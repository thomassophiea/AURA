/**
 * Change PROPOSALS from outside the browser — the MCP's only write-shaped path,
 * and it does not write.
 *
 * An external agent can draft a catalogued change ("enable 802.11k on
 * Skynet"). The draft becomes an ordinary Cortex `modify_wlan` workflow parked
 * at WAITING_FOR_CONFIRMATION. A person then reviews the diff and blast radius
 * in AURA's Cortex panel and approves it there, with their own Gateway
 * credentials and role; AURA applies it and re-reads the service to prove the
 * Gateway kept it (this Gateway is known to accept writes and discard them).
 *
 * What this module will never do: sign an approval token, call execute, or
 * touch the Gateway with anything but GETs. The proposal and the consent are
 * deliberately two different principals.
 *
 * Each proposal gets its own workflow session (`mcp:<uuid>`): the store allows
 * one active workflow per session, and a shared session would let one draft
 * block the next — or let a "yes" typed in some chat confirm it.
 */

import { randomUUID } from 'node:crypto';
import { getCatalogEntry } from './changeCatalog.js';
import { validateDesiredValue } from './writableSurface.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Who a change to this WLAN reaches: the profiles that bind it, the sites and
 * APs on those profiles, and the clients on it now. Reads only.
 */
export async function wlanBlastRadius(session, serviceId) {
  const [profiles, aps] = await Promise.all([
    session.get('/v3/profiles'),
    session.get('/v1/aps/query'),
  ]);
  if (!profiles.ok || !aps.ok || !Array.isArray(profiles.data) || !Array.isArray(aps.data)) {
    return {
      known: false,
      reason:
        'The profile or AP inventory could not be read, so the reach of this change is unknown.',
    };
  }
  const carrying = profiles.data.filter((p) =>
    (p.radioIfList ?? []).some((r) => r?.serviceId === serviceId)
  );
  const names = new Set(carrying.map((p) => p.name));
  const onProfiles = aps.data.filter((a) => names.has(a.profileName));
  const sites = [...new Set(onProfiles.map((a) => a.hostSite).filter(Boolean))];
  return {
    known: true,
    profiles: [...names],
    sites,
    accessPoints: onProfiles.length,
    note:
      'Every AP on these profiles broadcasts this WLAN, so the change reaches all of them at once. ' +
      'Profiles can span sites.',
  };
}

/**
 * @param {object} deps
 * @param {object} deps.engine   { begin, advance, requestConfirmation, buildPreview }
 * @param {object} deps.store    { load, listPending }
 * @param {(action: string, entry: object) => void} [deps.audit]
 */
export function createChangeProposals({ engine, store, audit = () => {} }) {
  return {
    /**
     * Draft a change for human approval.
     * @param {{tools: object, session: object, controllerUrl: string, gatewayName?: string,
     *          wlanName: string, changeId: string, desired: any, rationale?: string}} req
     */
    async propose({
      tools,
      session,
      controllerUrl,
      gatewayName = null,
      wlanName,
      changeId,
      desired,
      rationale = null,
    }) {
      const refuse = (reason, extra = {}) => ({
        basis: 'observed',
        status: 'refused',
        proposed: false,
        reason,
        ...extra,
      });
      if (!wlanName || !changeId) return refuse('wlanName and changeId are required.');

      const surface = await tools.listAvailableChanges.handler({ wlanName });
      if (
        surface?.unavailable === true ||
        surface?.status === 'scope_matched_nothing' ||
        surface?.status === 'not_found'
      ) {
        return refuse(
          surface?.reason ?? surface?.note ?? `No WLAN named "${wlanName}" could be read.`,
          {
            availableWlans: surface?.availableSsids ?? undefined,
          }
        );
      }
      const offered = (surface?.available ?? []).find((a) => a.id === changeId);
      if (!offered) {
        return refuse(
          `${changeId} cannot be changed on ${wlanName}: it is not in AURA's verified change catalogue for this Gateway.`,
          {
            changeable: (surface?.available ?? []).map((a) => ({
              id: a.id,
              label: a.label,
              current: a.current,
            })),
            notExposedByThisGateway: (surface?.unavailable ?? []).map((u) => u.id ?? u),
          }
        );
      }
      const entry = getCatalogEntry(changeId);
      const check = validateDesiredValue(entry, desired);
      if (!check.ok) return refuse(check.error);
      if (same(offered.current, check.value)) {
        return refuse(
          `${entry.label} on ${wlanName} is already ${JSON.stringify(check.value)}; there is nothing to change.`,
          {
            current: offered.current,
          }
        );
      }

      const blastRadius = await wlanBlastRadius(session, surface.serviceId).catch((err) => ({
        known: false,
        reason: err.message,
      }));

      const intent =
        `[MCP proposal] ${entry.label} on ${wlanName}: ${JSON.stringify(offered.current)} → ${JSON.stringify(check.value)}` +
        (rationale ? ` — ${String(rationale).slice(0, 300)}` : '');
      const { workflow, store: backing } = await engine.begin({
        sessionId: `mcp:${randomUUID()}`,
        userIntent: intent,
        workflowType: 'modify_wlan',
        requestedState: {
          wlanName,
          changeId,
          desired: check.value,
          serviceId: surface.serviceId,
          currentValue: offered.current,
          controllerUrl,
          gatewayName,
          origin: 'mcp',
          blastRadius,
        },
      });
      await engine.advance(workflow.id, {});
      await engine.requestConfirmation(workflow.id);
      const preview = await engine.buildPreview(workflow.id);

      audit('mcp.change.proposed', {
        actor: 'mcp-token',
        source: 'mcp',
        target: wlanName,
        detail: {
          workflowId: workflow.id,
          changeId,
          from: offered.current,
          to: check.value,
          store: backing,
        },
      });

      return {
        basis: 'observed',
        status: 'awaiting_approval',
        proposed: true,
        workflowId: workflow.id,
        change: preview?.diff ?? {
          path: entry.path,
          label: entry.label,
          from: offered.current,
          to: check.value,
        },
        blastRadius,
        approveIn:
          'AURA → Cortex panel → Pending changes. A person with the operator role reviews and approves it there.',
        durable: backing === 'db',
        note:
          'NOTHING HAS CHANGED ON THE GATEWAY. This is a draft awaiting human approval. Poll get_change_status ' +
          'with the workflowId to learn whether it was approved, applied and verified, or declined.',
      };
    },

    /** Where a proposal stands. */
    async status(workflowId) {
      const w = await store.load(workflowId);
      if (!w)
        return {
          basis: 'unknown',
          unavailable: true,
          reason: `No change ${workflowId} exists (or it expired after 7 days).`,
        };
      const rs = w.requestedState ?? {};
      const state =
        w.status === 'WAITING_FOR_CONFIRMATION'
          ? 'awaiting_approval'
          : w.status === 'CANCELLED'
            ? w.confirmationState === 'declined'
              ? 'declined'
              : 'cancelled'
            : w.status === 'COMPLETED'
              ? 'applied_and_verified'
              : w.status === 'COMPLETED_WITH_WARNINGS'
                ? 'applied_unverified'
                : w.status === 'FAILED'
                  ? 'failed'
                  : w.status.toLowerCase();
      return {
        basis: 'observed',
        workflowId,
        state,
        workflowStatus: w.status,
        change: {
          wlan: rs.wlanName ?? null,
          changeId: rs.changeId ?? null,
          from: rs.currentValue,
          to: rs.desired,
        },
        origin: rs.origin ?? 'cortex',
        updatedAt: w.updatedAt ?? null,
        ...(w.validation && Object.keys(w.validation).length ? { result: w.validation } : {}),
        ...(w.warnings?.length ? { warnings: w.warnings } : {}),
      };
    },

    /** Proposals waiting for a person. */
    async listPending({ origin = null } = {}) {
      const rows = await store.listPending();
      return rows
        .filter((w) => !origin || (w.requestedState?.origin ?? 'cortex') === origin)
        .map((w) => ({
          workflowId: w.id,
          intent: w.userIntent,
          origin: w.requestedState?.origin ?? 'cortex',
          wlan: w.requestedState?.wlanName ?? null,
          changeId: w.requestedState?.changeId ?? null,
          from: w.requestedState?.currentValue,
          to: w.requestedState?.desired,
          gateway: w.requestedState?.gatewayName ?? null,
          createdAt: w.createdAt ?? null,
        }));
    },
  };
}
