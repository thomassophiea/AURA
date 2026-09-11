/**
 * The only module in AURA that changes AP radio configuration.
 *
 * Measured behaviour of XCC 10.20.1.0-020R, established by experiment on a live
 * AP5020 rather than read out of a document:
 *
 *   - `PUT /v1/aps/{serial}` takes the WHOLE AP object; partial bodies are
 *     rejected. Read, mutate, write back.
 *   - `radios[].adminState` + `adminStateOvr` DO land. Setting adminState=false
 *     with adminStateOvr=true disables that radio, survives a re-read, and
 *     measurably drops `pwrUsage`.
 *   - `radios[].txPower` DOES NOT land. The PUT returns HTTP 200 and the value
 *     is unchanged on re-read, because txPower is the operational value SmartRF
 *     assigns, not a setpoint. This is precisely why every write here is
 *     verified by reading the state back: a 200 from this controller is not
 *     evidence that anything happened.
 *
 * Measured effect of disabling the 6 GHz radio on an AP5020 (2026-09-11):
 * 14.112 W → 11.868 W, a 15.9% reduction, against an untouched control AP that
 * stayed at 14.3-14.5 W. The shipped powerModel.js assumes 25% for the same
 * band; that constant is a model, this is a measurement.
 */

/** Deep clone via JSON — the AP object is pure JSON from the controller. */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** The subset of an AP's radio config this module ever changes, for rollback. */
export function captureRadioState(ap) {
  return {
    serialNumber: ap?.serialNumber ?? null,
    hostSite: ap?.hostSite ?? null,
    capturedRadios: (ap?.radios ?? []).map((r) => ({
      radioIndex: r.radioIndex,
      adminState: r.adminState,
      adminStateOvr: r.adminStateOvr,
    })),
  };
}

/**
 * Apply the desired admin state to the named radios of an AP object.
 * Pure: returns a new object plus the diff it intends.
 */
export function planRadioChange(ap, { radioIndexes, adminState }) {
  const next = clone(ap);
  const intended = [];
  for (const radio of next.radios ?? []) {
    if (!radioIndexes.includes(radio.radioIndex)) continue;
    intended.push({
      radioIndex: radio.radioIndex,
      from: { adminState: radio.adminState, adminStateOvr: radio.adminStateOvr },
      to: { adminState, adminStateOvr: adminState === false ? true : false },
    });
    radio.adminState = adminState;
    // Disabling needs the per-AP override on; restoring hands control back to
    // the profile rather than pinning "enabled" as an override forever.
    radio.adminStateOvr = adminState === false;
  }
  return { next, intended };
}

/**
 * Did the controller actually land the intent?
 * Compares the re-read AP against the intent, radio by radio.
 */
export function verifyRadioChange(readBackAp, intended) {
  const byIndex = new Map((readBackAp?.radios ?? []).map((r) => [r.radioIndex, r]));
  const mismatches = [];
  for (const change of intended) {
    const actual = byIndex.get(change.radioIndex);
    if (!actual) {
      mismatches.push({ radioIndex: change.radioIndex, reason: 'radio_absent' });
      continue;
    }
    if (actual.adminState !== change.to.adminState) {
      mismatches.push({
        radioIndex: change.radioIndex,
        reason: 'admin_state_not_applied',
        expected: change.to.adminState,
        actual: actual.adminState,
      });
    }
  }
  return { verified: mismatches.length === 0, mismatches };
}

/**
 * Is a radio that was told to be off actually off the air?
 *
 * MEASURED ON HARDWARE (2026-09-11): an AP4020X accepted `adminState=false` +
 * `adminStateOvr=true`, persisted it, and returned it on read-back — while the
 * same object reported `txPower: 17` on that radio, still on 5955 MHz, with its
 * power draw unchanged. The three AP5020s in the same site went to `txPower: 0`.
 *
 * So a configuration read-back proves the controller stored the intent. It does
 * NOT prove the radio stopped transmitting. `txPower` is the device's own
 * operational report and is the second, independent piece of evidence.
 *
 * Only the disable direction is checked. After re-enabling, a radio legitimately
 * reports 0 dBm for a while until SmartRF reassigns it, so requiring a non-zero
 * value there would produce false alarms.
 *
 * @returns {{effective: boolean, stillOnAir: Array<{radioIndex:number, txPower:number}>}}
 */
export function checkRadiosOffAir(ap, radioIndexes) {
  const stillOnAir = [];
  for (const radio of ap?.radios ?? []) {
    if (!radioIndexes.includes(radio.radioIndex)) continue;
    const tx = Number(radio.txPower);
    if (Number.isFinite(tx) && tx > 0) {
      stillOnAir.push({ radioIndex: radio.radioIndex, txPower: tx });
    }
  }
  return { effective: stillOnAir.length === 0, stillOnAir };
}

/**
 * Read one AP's full record.
 * @returns {Promise<{ok:boolean, ap?:object, error?:string, status?:number}>}
 */
export async function readAp(session, serial) {
  const resp = await session.get(`/v1/aps/${encodeURIComponent(serial)}`);
  if (!resp.ok) {
    return { ok: false, error: resp.errorSummary ?? 'AP read failed', status: resp.status };
  }
  if (!resp.data || typeof resp.data !== 'object' || !resp.data.serialNumber) {
    // XCC answers unmatched paths with an HTML 404 body that still parses as a
    // 200 in some proxy configurations. Assert on shape, never on status alone.
    return { ok: false, error: 'AP read returned an unexpected body shape', status: resp.status };
  }
  return { ok: true, ap: resp.data };
}

/**
 * Apply a radio admin-state change to one AP with full read-after-write proof.
 *
 * The caller supplies `persistRollback`, which MUST durably store the captured
 * original before this function issues the write. That ordering is the whole
 * guarantee: a crash between capture and write leaves a restorable record; a
 * crash after the write leaves a record that already knows how to undo it.
 *
 * @returns {Promise<{
 *   ok: boolean, serial: string, verified: boolean, intended: object[],
 *   original: object, mismatches?: object[], error?: string, stage?: string
 * }>}
 */
export async function applyRadioChange({
  session,
  serial,
  radioIndexes,
  adminState,
  persistRollback,
  settleMs = 5000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const read = await readAp(session, serial);
  if (!read.ok) {
    return { ok: false, serial, verified: false, intended: [], original: null, stage: 'read', error: read.error };
  }

  const original = captureRadioState(read.ap);
  const { next, intended } = planRadioChange(read.ap, { radioIndexes, adminState });

  if (intended.length === 0) {
    return {
      ok: false,
      serial,
      verified: false,
      intended: [],
      original,
      stage: 'plan',
      error: `AP ${serial} has none of radios [${radioIndexes.join(', ')}].`,
    };
  }

  // Already in the desired state: nothing to write, and nothing to roll back.
  const alreadyThere = intended.every((c) => c.from.adminState === c.to.adminState);
  if (alreadyThere) {
    return { ok: true, serial, verified: true, intended, original, noop: true };
  }

  if (typeof persistRollback === 'function') {
    await persistRollback({ serial, original, intended });
  }

  const write = await session.write(`/v1/aps/${encodeURIComponent(serial)}`, {
    method: 'PUT',
    body: next,
  });
  if (!write.ok) {
    return {
      ok: false,
      serial,
      verified: false,
      intended,
      original,
      stage: 'write',
      error: write.errorSummary ?? `Controller rejected the write (HTTP ${write.status}).`,
    };
  }

  // The controller applies radio changes asynchronously to the AP.
  await sleep(settleMs);

  const back = await readAp(session, serial);
  if (!back.ok) {
    return {
      ok: false,
      serial,
      verified: false,
      intended,
      original,
      stage: 'verify_read',
      error: `Write was accepted but could not be verified: ${back.error}`,
    };
  }

  const { verified, mismatches } = verifyRadioChange(back.ap, intended);

  // Second, independent evidence: did the radio actually leave the air? Checked
  // only when disabling, and only reported — an AP that is slow to comply is not
  // the same failure as one that never complies, and the effectiveness sweep
  // re-checks it later.
  const onAir =
    verified && adminState === false
      ? checkRadiosOffAir(back.ap, radioIndexes)
      : { effective: true, stillOnAir: [] };

  return {
    ok: verified,
    serial,
    verified,
    // The controller stored the intent.
    configVerified: verified,
    // The device stopped transmitting. Can be false while configVerified is true.
    effective: onAir.effective,
    stillOnAir: onAir.stillOnAir,
    intended,
    original,
    mismatches,
    readBack: captureRadioState(back.ap),
    error: verified
      ? onAir.effective
        ? undefined
        : `Configuration was stored and confirmed, but radio ${onAir.stillOnAir
            .map((r) => r.radioIndex)
            .join(', ')} still reports transmit power.`
      : 'Controller accepted the write but the AP did not reach the intended state.',
    stage: verified ? (onAir.effective ? undefined : 'on_air') : 'verify',
  };
}

/**
 * Restore one AP to a previously captured state, verified the same way.
 *
 * Restoration NEVER reports success on an unverified read-back. An AP left in
 * an unknown state is an operational incident, and saying "restored" when it is
 * not would hide it.
 */
export async function restoreRadioState({
  session,
  serial,
  original,
  settleMs = 5000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const read = await readAp(session, serial);
  if (!read.ok) {
    return { ok: false, serial, verified: false, stage: 'read', error: read.error };
  }

  const next = clone(read.ap);
  const wanted = new Map((original?.capturedRadios ?? []).map((r) => [r.radioIndex, r]));
  const intended = [];
  for (const radio of next.radios ?? []) {
    const want = wanted.get(radio.radioIndex);
    if (!want) continue;
    if (radio.adminState === want.adminState && radio.adminStateOvr === want.adminStateOvr) continue;
    intended.push({
      radioIndex: radio.radioIndex,
      from: { adminState: radio.adminState, adminStateOvr: radio.adminStateOvr },
      to: { adminState: want.adminState, adminStateOvr: want.adminStateOvr },
    });
    radio.adminState = want.adminState;
    radio.adminStateOvr = want.adminStateOvr;
  }

  if (intended.length === 0) {
    return { ok: true, serial, verified: true, noop: true, intended: [] };
  }

  const write = await session.write(`/v1/aps/${encodeURIComponent(serial)}`, {
    method: 'PUT',
    body: next,
  });
  if (!write.ok) {
    return {
      ok: false,
      serial,
      verified: false,
      intended,
      stage: 'write',
      error: write.errorSummary ?? `Controller rejected the restore (HTTP ${write.status}).`,
    };
  }

  await sleep(settleMs);
  const back = await readAp(session, serial);
  if (!back.ok) {
    return {
      ok: false,
      serial,
      verified: false,
      intended,
      stage: 'verify_read',
      error: `Restore was accepted but could not be verified: ${back.error}`,
    };
  }

  const { verified, mismatches } = verifyRadioChange(back.ap, intended);
  return {
    ok: verified,
    serial,
    verified,
    intended,
    mismatches,
    error: verified ? undefined : 'Restore was accepted but the AP did not return to its captured state.',
    stage: verified ? undefined : 'verify',
  };
}
