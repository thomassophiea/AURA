import { fetchXcc } from '../../validationEngine/xccClient.js';
import { resolveLldpForVlan } from '../../validationEngine/lldpTopologyResolver.js';

const LLDP_BATCH_SIZE = 15;

function toArray(val) {
  return Array.isArray(val?.data) ? val.data : Array.isArray(val) ? val : [];
}

function apSerial(ap) {
  // /v1/aps uses serialNumber; /v1/state/sites/{id}/aps uses apSerialNo
  return ap.apSerialNum ?? ap.serialNumber ?? ap.apSerialNo ?? ap.id;
}

function apName(ap) {
  return ap.apName ?? ap.name ?? ap.hostName ?? ap.hostname ?? null;
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
  // An AP without a resolvable serial cannot be queried (the URL would be
  // /v1/aps/undefined/lldp) and would surface as a bogus "undefined" alert.
  const apList = toArray(aps)
    .filter((ap) => apSerial(ap))
    .slice(0, LLDP_BATCH_SIZE);
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
  const osSiteId = opts.siteId && !opts.siteId.startsWith('xiq:') ? opts.siteId : null;
  // Always read /v1/aps — it carries full AP objects (serialNumber + apName).
  // The site-scoped state list only holds { apSerialNo, entityStatus }, so it is
  // used purely to narrow the full list down to the selected site's APs.
  const [services, topologies, aps] = await Promise.all([
    fetchXcc('/v1/services', opts),
    fetchXcc('/v1/topologies', opts),
    fetchXcc('/v1/aps', opts),
  ]);

  const serviceList = toArray(services);
  const topoList = toArray(topologies);
  const wlanVlans = mapWlansToVlans(services, topologies);
  let apList = toArray(aps);

  if (osSiteId) {
    try {
      const siteAps = toArray(
        await fetchXcc(`/v1/state/sites/${encodeURIComponent(osSiteId)}/aps`, opts)
      );
      const siteSerials = new Set(siteAps.map((ap) => apSerial(ap)).filter(Boolean));
      if (siteSerials.size > 0) {
        apList = apList.filter((ap) => siteSerials.has(apSerial(ap)));
      }
    } catch {
      // Site scoping is best-effort; checking every AP beats checking none.
    }
  }

  // Build serial -> name lookup
  const nameBySerial = new Map();
  for (const ap of apList) {
    const serial = apSerial(ap);
    const name = apName(ap);
    if (serial && name) nameBySerial.set(serial, name);
  }
  const displayAp = (serial) => nameBySerial.get(serial) ?? serial;

  // Resolve service -> topology name for friendly display
  const topoById = new Map();
  for (const t of topoList) {
    if (t.id) topoById.set(String(t.id), t.name ?? `VLAN ${t.vlanid}`);
  }

  const evidence = {
    wlansChecked: wlanVlans.map((w) => ({ ssid: w.ssid, vlanId: w.vlanId, network: w.topologyName })),
    networks: topoList.map((t) => ({
      name: t.name ?? `VLAN ${t.vlanid}`,
      vlanId: t.vlanid,
      dhcpMode: t.dhcpMode ?? 'Local',
    })),
    wlanMappings: serviceList.map((s) => {
      const svcName = s.serviceName ?? s.name ?? s.ssid;
      const topoRef = s.defaultTopology ?? s.topologyId ?? s.topology;
      const topoName = topoRef ? (typeof topoRef === 'object' ? topoRef.name : topoById.get(String(topoRef))) : null;
      const matched = wlanVlans.find((w) => w.ssid === svcName);
      return {
        wlan: svcName,
        network: topoName ?? null,
        vlanId: matched?.vlanId ?? null,
      };
    }),
    apsScanned: apList.slice(0, LLDP_BATCH_SIZE).map((ap) => ({
      name: apName(ap) ?? apSerial(ap),
    })),
    totalAps: apList.length,
    lldpResults: [],
    summary: '',
  };

  if (!wlanVlans.length) {
    evidence.summary = `${serviceList.length} WLAN(s) and ${topoList.length} topology(s) found, but no VLAN mappings resolved. Check that services have a defaultTopology field pointing to a topology with a vlanid.`;
    return { alerts: [], evidence };
  }

  // Fetch LLDP once for the batch of APs
  const lldpByAp = await fetchLldpBatched(apList, opts);
  evidence.lldpResults = lldpByAp.map(({ apSerial: serial, neighbors }) => ({
    accessPoint: displayAp(serial),
    neighbors: neighbors.length,
  }));

  if (!lldpByAp.length) {
    evidence.summary = `No LLDP data retrieved from ${apList.length} APs.`;
    return { alerts: [], evidence };
  }

  const alerts = [];
  // Incomplete LLDP data is a property of the AP, not of any one WLAN — an AP
  // with no neighbors can't verify ANY trunk, so folding its per-WLAN repeats
  // into one note keeps the board readable (6 APs × 4 WLANs would otherwise
  // produce 24 copies of the same fact).
  const indeterminateBySerial = new Map(); // serial -> { noNeighbors, ssids:Set }

  for (const { ssid, vlanId } of wlanVlans) {
    const result = resolveLldpForVlan(lldpByAp, vlanId);
    if (result.result === 'pass') continue;

    for (const affected of result.affectedAps) {
      // Entries look like "SERIAL(port:1/0/23)" for failures or
      // "SERIAL:no-neighbors" / "SERIAL:no-vlanMembership" for indeterminate —
      // strip both decorations so only the serial reaches the display name.
      const apPart = affected.split('(')[0].split(':')[0];

      if (affected.includes('no-neighbors') || affected.includes('no-vlanMembership')) {
        const entry = indeterminateBySerial.get(apPart) ?? {
          noNeighbors: affected.includes('no-neighbors'),
          ssids: new Set(),
        };
        entry.ssids.add(ssid);
        indeterminateBySerial.set(apPart, entry);
        continue;
      }

      const portMatch = affected.match(/port:([^)]+)/);
      const switchMatch = affected.match(/switch:([^)]+)/);
      const apDisplay = displayAp(apPart);

      alerts.push({
        id: `vlan_trunk:${apPart}:${vlanId}`,
        severity: 'warning',
        checkName: 'vlan_trunk',
        message: `${apDisplay} missing VLAN ${vlanId} on uplink trunk for SSID ${ssid}`,
        target: apDisplay,
        context: {
          apSerial: apPart,
          apName: apDisplay,
          vlanId,
          ssid,
          port: portMatch?.[1] ?? null,
          switchName: switchMatch?.[1] ?? null,
        },
      });
    }
  }

  for (const [serial, entry] of indeterminateBySerial) {
    const apDisplay = displayAp(serial);
    const ssids = [...entry.ssids];
    const reason = entry.noNeighbors
      ? 'has no LLDP neighbors'
      : 'LLDP neighbor lacks VLAN membership data';
    const scope =
      ssids.length === 1
        ? `the trunk for SSID ${ssids[0]}`
        : `trunks for ${ssids.length} SSIDs (${ssids.join(', ')})`;
    alerts.push({
      id: `vlan_trunk:${serial}:lldp-indeterminate`,
      severity: 'info',
      checkName: 'vlan_trunk',
      message: `${apDisplay} ${reason} — cannot verify ${scope}`,
      target: apDisplay,
      context: { apSerial: serial, apName: apDisplay, ssids },
    });
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
