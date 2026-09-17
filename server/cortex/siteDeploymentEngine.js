/**
 * Execute a site deployment plan, and prove each step landed.
 *
 * The planner decided WHAT should change and why; this only carries it out.
 * Keeping them apart is what makes the hard part — the shared-profile leak and
 * the 6 GHz exclusion — testable without a Gateway.
 *
 * Every write here is followed by a read-back, for the same reason every other
 * write in this codebase is: the Gateway returns 200 and then discards payload
 * it did not like. A binding that does not appear in the profile's radioIfList
 * on re-read was DROPPED, and that is a failure however encouraging the status
 * code was.
 *
 * ── Order matters ────────────────────────────────────────────────────────────
 *
 * For a forked profile the sequence is clone → re-home → bind, and it cannot be
 * reordered. Binding the clone before the APs move would broadcast nothing;
 * moving the APs before the clone exists would strand them.
 *
 * ── The override trap ────────────────────────────────────────────────────────
 *
 * Re-homing an AP clears `radioIfList` and `radioIfListOvr` so the new profile
 * takes effect. On an AP carrying its OWN service bindings (`radioIfListOvr:
 * true`) that is destructive — it silently discards per-AP configuration
 * nobody asked us to touch. Such an AP is refused, by name, and the deployment
 * reports it rather than quietly flattening it.
 */
import crypto from 'node:crypto';
import { requestXcc } from '../validationEngine/xccClient.js';

const PROFILES = '/v3/profiles';

/** Add the planned bindings to a profile body, leaving everything else alone. */
function withBindings(profile, serviceId, radios) {
  const existing = profile.radioIfList ?? [];
  const have = new Set(existing.filter((e) => e.serviceId === serviceId).map((e) => e.index));
  const added = radios.filter((r) => !have.has(r.index)).map((r) => ({ serviceId, index: r.index }));
  return { ...profile, radioIfList: [...existing, ...added] };
}

/** Did every planned radio actually end up bound? */
function bindingsPresent(profile, serviceId, radios) {
  const have = new Set(
    (profile?.radioIfList ?? []).filter((e) => e.serviceId === serviceId).map((e) => e.index)
  );
  return radios.every((r) => have.has(r.index));
}

async function bindOnProfile({ profileId, serviceId, radios, opts }) {
  const current = await requestXcc(`${PROFILES}/${encodeURIComponent(profileId)}`, {
    ...opts,
    method: 'GET',
  });
  if (!current.ok) {
    return { status: 'read_failed', error: current.errorText ?? `HTTP ${current.status}` };
  }

  // The WHOLE profile back, with bindings appended. A partial body drops the
  // fields it omits.
  const body = withBindings(current.data, serviceId, radios);
  const written = await requestXcc(`${PROFILES}/${encodeURIComponent(profileId)}`, {
    ...opts,
    method: 'PUT',
    body,
  });
  if (!written.ok) {
    return { status: 'rejected', error: written.errorText ?? `HTTP ${written.status}`, httpStatus: written.status };
  }

  const readBack = await requestXcc(`${PROFILES}/${encodeURIComponent(profileId)}`, {
    ...opts,
    method: 'GET',
  });
  if (!readBack.ok) {
    return {
      status: 'read_failed',
      error: `The write returned ${written.status} but the profile could not be re-read, so whether it applied is unknown.`,
    };
  }

  return bindingsPresent(readBack.data, serviceId, radios)
    ? { status: 'applied', boundIndices: radios.map((r) => r.index) }
    : {
        status: 'silently_dropped',
        error:
          `The Gateway returned ${written.status} but the radio bindings are absent on re-read. ` +
          'The write was discarded, not applied.',
      };
}

async function cloneProfile({ source, forkName, opts }) {
  // A client-side id is offered, but the id that counts is whatever comes back
  // — this Gateway assigns its own for some resources regardless of what was
  // sent, and trusting the sent one silently targets a resource that isn't there.
  const candidate = crypto.randomUUID();
  const { id: _drop, ...rest } = source;
  const body = { ...rest, id: candidate, name: forkName, radioIfList: [] };

  const created = await requestXcc(PROFILES, { ...opts, method: 'POST', body });
  if (!created.ok) {
    return { status: 'rejected', error: created.errorText ?? `HTTP ${created.status}` };
  }

  let id = created.data?.id ?? null;
  if (!id) {
    const all = await requestXcc(PROFILES, { ...opts, method: 'GET' });
    const rows = Array.isArray(all.data) ? all.data : (all.data?.profiles ?? []);
    id = rows.find((p) => p.name === forkName)?.id ?? null;
  }
  if (!id) {
    return { status: 'read_failed', error: `Profile "${forkName}" could not be found after creation.` };
  }
  return { status: 'applied', id };
}

async function rehomeAp({ serial, profileId, opts }) {
  const path = `/v1/aps/${encodeURIComponent(serial)}`;
  const current = await requestXcc(path, { ...opts, method: 'GET' });
  if (!current.ok) {
    return { serial, status: 'read_failed', error: current.errorText ?? `HTTP ${current.status}` };
  }

  // Refused rather than flattened: this AP carries its own service bindings,
  // and re-homing clears them.
  if (current.data?.radioIfListOvr === true) {
    return {
      serial,
      status: 'refused',
      error:
        'This AP has per-AP service bindings (radioIfListOvr). Moving it to another profile ' +
        'would discard them, so it was left alone.',
    };
  }

  const body = { ...current.data, profileId, radioIfListOvr: false, radioIfList: [] };
  const written = await requestXcc(path, { ...opts, method: 'PUT', body });
  if (!written.ok) {
    return { serial, status: 'rejected', error: written.errorText ?? `HTTP ${written.status}` };
  }

  const readBack = await requestXcc(path, { ...opts, method: 'GET' });
  if (!readBack.ok) return { serial, status: 'read_failed', error: 'could not re-read the AP' };

  return readBack.data?.profileId === profileId
    ? { serial, status: 'applied' }
    : { serial, status: 'silently_dropped', error: 'the AP is still on its previous profile' };
}

/**
 * @param {object} input
 * @param {object} input.plan  a planSiteDeployment() result
 * @returns {Promise<{status:'applied'|'partial'|'failed'|'noop', targets:Array, summary:string}>}
 */
export async function deployWlanToSite({ plan, authToken, controllerUrl, fetchFn }) {
  const opts = { authToken, controllerUrl, fetchFn };

  if (plan?.status === 'site_matched_nothing') {
    return { status: 'failed', targets: [], summary: plan.warnings?.[0] ?? 'That site does not exist.' };
  }
  if (plan?.status === 'already_deployed') {
    return {
      status: 'noop',
      targets: [],
      summary: `${plan.serviceName} is already broadcast on every eligible radio at ${plan.site}. Nothing was changed.`,
    };
  }

  const results = [];

  for (const target of plan.targets ?? []) {
    if (target.action === 'none' || target.radios.length === 0) {
      results.push({ profileName: target.profileName, status: 'skipped', reason: 'nothing to bind' });
      continue;
    }

    // ── Bind in place ──────────────────────────────────────────────────────
    if (target.action === 'bind') {
      const bound = await bindOnProfile({
        profileId: target.profileId,
        serviceId: plan.serviceId,
        radios: target.radios,
        opts,
      });
      results.push({ profileName: target.profileName, action: 'bind', ...bound });
      continue;
    }

    // ── Fork: clone -> re-home -> bind, in that order ──────────────────────
    const source = await requestXcc(`${PROFILES}/${encodeURIComponent(target.profileId)}`, {
      ...opts,
      method: 'GET',
    });
    if (!source.ok) {
      results.push({
        profileName: target.profileName,
        action: 'fork',
        status: 'read_failed',
        error: source.errorText ?? `HTTP ${source.status}`,
      });
      continue;
    }

    const clone = await cloneProfile({ source: source.data, forkName: target.forkName, opts });
    if (clone.status !== 'applied') {
      results.push({ profileName: target.profileName, action: 'fork', ...clone });
      continue;
    }

    const moved = [];
    for (const serial of target.apSerials ?? []) {
      moved.push(await rehomeAp({ serial, profileId: clone.id, opts }));
    }

    const bound = await bindOnProfile({
      profileId: clone.id,
      serviceId: plan.serviceId,
      radios: target.radios,
      opts,
    });

    const movedOk = moved.filter((m) => m.status === 'applied').length;
    results.push({
      profileName: target.profileName,
      action: 'fork',
      forkName: target.forkName,
      forkId: clone.id,
      protectedSites: target.protectedSites,
      apsMoved: movedOk,
      apsRefused: moved.filter((m) => m.status !== 'applied'),
      // A fork whose APs did not all move has not fully deployed, even if the
      // binding itself succeeded — the unmoved APs are still on the old profile.
      status:
        bound.status === 'applied' && movedOk === moved.length
          ? 'applied'
          : bound.status === 'applied'
            ? 'partial'
            : bound.status,
      error: bound.error ?? null,
    });
  }

  const applied = results.filter((r) => r.status === 'applied').length;
  const failed = results.filter((r) =>
    ['silently_dropped', 'rejected', 'read_failed'].includes(r.status)
  ).length;
  const partial = results.filter((r) => r.status === 'partial').length;

  const status = failed ? (applied || partial ? 'partial' : 'failed') : partial ? 'partial' : 'applied';

  return {
    status,
    targets: results,
    summary:
      status === 'applied'
        ? `${plan.serviceName} deployed at ${plan.site}: ${applied} profile(s) bound.`
        : status === 'partial'
          ? `${plan.serviceName} partially deployed at ${plan.site}: ${applied} bound, ${partial} partial, ${failed} failed.`
          : `${plan.serviceName} was not deployed at ${plan.site}.`,
  };
}
