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
  const topoById = new Map();   // topology UUID -> { name, vlanid }
  const topoByName = new Map(); // topology name  -> { name, vlanid }
  for (const t of toArray(topologies)) {
    const entry = { name: t.name, vlanid: t.vlanid };
    if (t.id) topoById.set(String(t.id), entry);
    if (t.name) topoByName.set(t.name, entry);
  }

  const wlanVlans = []; // { ssid, vlanId, topologyName }
  for (const svc of toArray(services)) {
    const ssid = svc.serviceName ?? svc.name ?? svc.ssid;

    // Campus Controller uses `defaultTopology` (UUID string)
    const topoRef = svc.defaultTopology ?? svc.topologyId ?? svc.topology;
    if (!topoRef) continue;

    // defaultTopology can be a UUID string or an embedded topology object
    let topo;
    if (typeof topoRef === 'object' && topoRef !== null) {
      topo = { name: topoRef.name, vlanid: topoRef.vlanid };
    } else {
      topo = topoById.get(String(topoRef)) ?? topoByName.get(String(topoRef));
    }

    if (topo && topo.vlanid != null) {
      wlanVlans.push({ ssid, vlanId: topo.vlanid, topologyName: topo.name ?? String(topoRef) });
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

  const serviceList = toArray(services);
  const topoList = toArray(topologies);
  const wlanVlans = mapWlansToVlans(services, topologies);
  const apList = toArray(aps);

  const evidence = {
    wlansChecked: wlanVlans.map((w) => ({ ssid: w.ssid, vlanId: w.vlanId, topologyName: w.topologyName })),
    topologiesFound: topoList.map((t) => ({ id: t.id, name: t.name, vlanid: t.vlanid })),
    servicesFound: serviceList.map((s) => ({
      name: s.serviceName ?? s.name ?? s.ssid,
      defaultTopology: s.defaultTopology ?? null,
    })),
    apsScanned: apList.slice(0, LLDP_BATCH_SIZE).map((ap) => apSerial(ap)),
    totalAps: apList.length,
    lldpResults: [],
    summary: '',
  };

  if (!wlanVlans.length) {
    evidence.summary = `${serviceList.length} WLAN(s) and ${topoList.length} topology(s) found, but no VLAN mappings resolved. Check that services have a defaultTopology field pointing to a topology with a vlanid.`;
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

      const noNeighbors = affected.includes('no-neighbors');
      const noMembership = affected.includes('no-vlanMembership');
      const severity = (noNeighbors || noMembership) ? 'info' : 'warning';

      // Use descriptive messages that distinguish real issues from incomplete data
      let message;
      if (noNeighbors) {
        message = `AP ${apPart} has no LLDP neighbors — cannot verify VLAN ${vlanId} trunk for SSID ${ssid}`;
      } else if (noMembership) {
        message = `AP ${apPart} — LLDP neighbor lacks VLAN membership data for VLAN ${vlanId} (SSID ${ssid})`;
      } else {
        message = `AP ${apPart} missing VLAN ${vlanId} on uplink trunk for SSID ${ssid}`;
      }

      alerts.push({
        id: `vlan_trunk:${apPart}:${vlanId}`,
        severity,
        checkName: 'vlan_trunk',
        message,
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

  const warnings = alerts.filter((a) => a.severity === 'warning').length;
  const infos = alerts.filter((a) => a.severity === 'info').length;
  if (warnings > 0) {
    evidence.summary = `${warnings} trunk mismatch(es) found across ${wlanVlans.length} WLAN(s) and ${lldpByAp.length} AP(s).${infos ? ` ${infos} informational (incomplete LLDP data).` : ''}`;
  } else if (infos > 0) {
    evidence.summary = `No trunk mismatches. ${infos} AP(s) have incomplete LLDP data — cannot fully verify. ${wlanVlans.length} WLAN(s), ${lldpByAp.length} AP(s) checked.`;
  } else {
    evidence.summary = `All ${wlanVlans.length} WLAN VLAN(s) verified on ${lldpByAp.length} AP trunk(s). No mismatches found.`;
  }

  return { alerts, evidence };
}
