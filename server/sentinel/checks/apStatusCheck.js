/**
 * AP operational status check.
 *
 * /v1/state/aps reports each AP's entityStatus: an operationalStatus and a
 * troubles list. An AP out of service is a critical, named event (the AP
 * Health SLE only moves a percentage); reported troubles on an in-service AP
 * are warnings. Names come from /v1/aps since the state list only has serials.
 */

import { fetchXcc } from '../../validationEngine/xccClient.js';

function toArray(val) {
  return Array.isArray(val?.data) ? val.data : Array.isArray(val) ? val : [];
}

function apSerial(ap) {
  return ap.apSerialNum ?? ap.serialNumber ?? ap.apSerialNo ?? ap.id;
}

export async function runApStatusCheck(opts) {
  const osSiteId = opts.siteId && !opts.siteId.startsWith('xiq:') ? opts.siteId : null;
  const statePath = osSiteId
    ? `/v1/state/sites/${encodeURIComponent(osSiteId)}/aps`
    : '/v1/state/aps';

  const [stateList, aps] = await Promise.all([
    fetchXcc(statePath, opts),
    fetchXcc('/v1/aps', opts),
  ]);

  const nameBySerial = new Map();
  for (const ap of toArray(aps)) {
    const serial = apSerial(ap);
    const name = ap.apName ?? ap.hostname ?? null;
    if (serial && name) nameBySerial.set(serial, name);
  }
  const displayAp = (serial) => nameBySerial.get(serial) ?? serial;

  const alerts = [];
  const statuses = [];

  for (const entry of toArray(stateList)) {
    const serial = apSerial(entry);
    if (!serial) continue;
    const status = entry.entityStatus?.operationalStatus ?? 'Unknown';
    const troubles = Array.isArray(entry.entityStatus?.troubles)
      ? entry.entityStatus.troubles
      : [];
    const name = displayAp(serial);
    statuses.push({ accessPoint: name, status, troubles: troubles.join(', ') || '—' });

    if (status !== 'InService') {
      alerts.push({
        id: `ap_status:${serial}`,
        severity: 'critical',
        checkName: 'ap_status',
        message: `Access point ${name} is not in service (status: ${status}${troubles.length ? `, ${troubles.join(', ')}` : ''})`,
        target: name,
        context: { apSerial: serial, apName: name, status, troubles },
      });
    } else if (troubles.length > 0) {
      alerts.push({
        id: `ap_status:${serial}`,
        severity: 'warning',
        checkName: 'ap_status',
        message: `Access point ${name} reports troubles: ${troubles.join(', ')}`,
        target: name,
        context: { apSerial: serial, apName: name, status, troubles },
      });
    }
  }

  const impacted = alerts.length;
  const evidence = {
    apStatuses: statuses.sort((a, b) => a.accessPoint.localeCompare(b.accessPoint)),
    summary:
      statuses.length === 0
        ? 'No AP state records found.'
        : impacted === 0
          ? `All ${statuses.length} AP(s) in service with no reported troubles.`
          : `${impacted} of ${statuses.length} AP(s) out of service or reporting troubles.`,
  };

  return { alerts, evidence };
}
