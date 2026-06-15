import { fetchXcc } from '../../validationEngine/xccClient.js';
import { resolveLldpForVlan } from '../../validationEngine/lldpTopologyResolver.js';

const LLDP_BATCH_SIZE = 15;

function toArray(val) {
  return Array.isArray(val?.data) ? val.data : Array.isArray(val) ? val : [];
}

function apSerial(ap) {
  return ap.apSerialNum ?? ap.serialNumber ?? ap.id;
}

/**
 * Map each WLAN to its topology's VLAN ID.
 */
function mapWlansToVlans(services, topologies) {
  const topoMap = new Map(); // topology id or name -> vlanid
  for (const t of toArray(topologies)) {
    if (t.id) topoMap.set(String(t.id), t.vlanid);
    if (t.name) topoMap.set(t.name, t.vlanid);
  }

  const wlanVlans = []; // { ssid, vlanId, topologyName }
  for (const svc of toArray(services)) {
    const ssid = svc.name ?? svc.ssid;
    const topoId = svc.topologyId ?? svc.topology;
    const topoName = svc.topologyName ?? svc.topology;
    const vlanId = topoMap.get(String(topoId)) ?? topoMap.get(topoName);
    if (vlanId != null) {
      wlanVlans.push({ ssid, vlanId, topologyName: topoName ?? topoId });
    }
  }
  return wlanVlans;
}

/**
 * Fetch LLDP data for APs in batches.
 */
async function fetchLldpBatched(aps, opts) {
  const apList = toArray(aps).slice(0, LLDP_BATCH_SIZE);
  return Promise.all(
    apList.map(async (ap) => {
      const serial = apSerial(ap);
      try {
        const neighbors = await fetchXcc(`/v1/aps/${encodeURIComponent(serial)}/lldp`, opts);
        return { apSerial: serial, neighbors: Array.isArray(neighbors) ? neighbors : [] };
      } catch {
        return { apSerial: serial, neighbors: [] };
      }
    }),
  );
}

/**
 * Run VLAN trunk checks across all WLANs. Returns array of alert descriptors.
 */
export async function runVlanTrunkCheck(opts) {
  const [services, topologies, aps] = await Promise.all([
    fetchXcc('/v1/services', opts),
    fetchXcc('/v1/topologies', opts),
    fetchXcc('/v1/aps', opts),
  ]);

  const wlanVlans = mapWlansToVlans(services, topologies);
  const apList = toArray(aps);

  const evidence = {
    wlansChecked: wlanVlans.map((w) => ({ ssid: w.ssid, vlanId: w.vlanId, topologyName: w.topologyName })),
    apsScanned: apList.slice(0, LLDP_BATCH_SIZE).map((ap) => apSerial(ap)),
    totalAps: apList.length,
    lldpResults: [],
    summary: '',
  };

  if (!wlanVlans.length) {
    evidence.summary = 'No WLANs with topology VLAN mappings found — nothing to check.';
    return { alerts: [], evidence };
  }

  // Fetch LLDP once for the batch of APs
  const lldpByAp = await fetchLldpBatched(aps, opts);
  evidence.lldpResults = lldpByAp.map(({ apSerial: serial, neighbors }) => ({
    apSerial: serial,
    neighborCount: neighbors.length,
  }));

  if (!lldpByAp.length) {
    evidence.summary = `No LLDP data retrieved from ${apList.length} APs.`;
    return { alerts: [], evidence };
  }

  const alerts = [];

  for (const { ssid, vlanId } of wlanVlans) {
    const result = resolveLldpForVlan(lldpByAp, vlanId);
    if (result.result === 'pass') continue;

    for (const affected of result.affectedAps) {
      const [apPart] = affected.split('(');
      const portMatch = affected.match(/port:([^)]+)/);
      const switchMatch = affected.match(/switch:([^)]+)/);

      const severity = affected.includes('no-neighbors') || affected.includes('no-vlanMembership')
        ? 'info'
        : 'warning';

      alerts.push({
        id: `vlan_trunk:${apPart}:${vlanId}`,
        severity,
        checkName: 'vlan_trunk',
        message: `AP ${apPart} missing VLAN ${vlanId} on uplink trunk for SSID ${ssid}`,
        target: apPart,
        context: {
          apSerial: apPart,
          vlanId,
          ssid,
          port: portMatch?.[1] ?? null,
          switchName: switchMatch?.[1] ?? null,
        },
      });
    }
  }

  evidence.summary = alerts.length
    ? `${alerts.length} trunk issue(s) found across ${wlanVlans.length} WLAN(s) and ${lldpByAp.length} AP(s).`
    : `All ${wlanVlans.length} WLAN VLAN(s) verified on ${lldpByAp.length} AP trunk(s). No issues.`;

  return { alerts, evidence };
}
