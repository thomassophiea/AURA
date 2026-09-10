/**
 * Exercise every Cortex diagnostic tool against a live Gateway.
 *
 * This is the honesty check for the tool layer: each tool either returns real
 * evidence or an explicit gap. Anything that returns a plausible-looking value
 * it did not measure is a defect.
 */
import { ControllerSession } from '../server/monitoring/controllerClient.js';
import { GatewayEvidence } from '../server/cortex/gatewayEvidence.js';
import { CapabilityRegistry } from '../server/cortex/capabilityRegistry.js';
import { createDiagnosticTools, toolSpecs, TOOL_ACTIVITY } from '../server/cortex/diagnosticTools.js';

const BASE = process.env.GW_BASE ?? 'https://192.168.100.12:5825';
const session = new ControllerSession({
  baseUrl: BASE,
  username: process.env.GW_USER ?? 'admin',
  password: process.env.GW_PW,
  timeoutMs: 120_000,
});

const capabilities = new CapabilityRegistry();
await capabilities.probe(new GatewayEvidence(session), { session });
const tools = createDiagnosticTools({ session, capabilities });

console.log(`# Cortex tool layer, live against ${BASE}\n`);
console.log(`${Object.keys(tools).length} tools registered:`);
for (const [name, t] of Object.entries(tools)) {
  console.log(`  ${name.padEnd(24)} risk=${t.risk.padEnd(11)} "${TOOL_ACTIVITY[name] ?? '(no label)'}"`);
}

const specs = toolSpecs(tools);
const badSpecs = specs.filter((s) => !s.name || !s.description || !s.parameters);
console.log(`\nspec validity: ${specs.length - badSpecs.length}/${specs.length} complete`);

const writeTools = Object.values(tools).filter((t) => t.risk === 'write' || t.risk === 'disruptive');
console.log(`write/disruptive tools exposed to the model: ${writeTools.length} (must be 0)`);

function summarise(label, out) {
  const keys = Object.keys(out ?? {});
  const basis = out?.basis ?? '-';
  const unavailable = out?.unavailable ? '  UNAVAILABLE' : '';
  console.log(`\n── ${label}  [basis=${basis}]${unavailable}`);
  return keys;
}

// 1. capabilities
{
  const out = await tools.getCapabilities.handler({});
  summarise('getCapabilities', out);
  console.log(`   usable=${out.usable.length} unavailable=${out.unavailable.length}`);
  console.log(`   e.g. unavailable: ${out.unavailable.slice(0, 3).map((u) => u.capability).join(', ')}`);
}

// 2. site overview
let firstMac = null;
{
  const out = await tools.getSiteOverview.handler({ worst: 5 });
  summarise('getSiteOverview', out);
  console.log(`   sites=${out.sitesInTelemetry.join(',')} clients=${out.clientCount} scorable=${out.scorableClients} unscorable=${out.unscorableRows}`);
  console.log(`   apStatus=${JSON.stringify(out.apStatusCounts)} randomizedMacs=${out.randomizedMacClients}`);
  for (const c of out.worstBySignal.slice(0, 5)) {
    console.log(`   worst: ${c.mac} rss=${c.rss} snr=${c.snr} rfqi=${c.rfqi} ap=${c.apName?.value}`);
  }
  firstMac = out.worstBySignal[0]?.mac ?? null;
}

// 3. findClient — resolved / ambiguous / not found
{
  const ok = await tools.findClient.handler({ query: firstMac });
  summarise(`findClient("${firstMac}")`, ok);
  console.log(`   status=${ok.status} matchedOn=${ok.matchedOn}`);

  const amb = await tools.findClient.handler({ query: 'iPhone' });
  summarise('findClient("iPhone")', amb);
  console.log(`   status=${amb.status}` + (amb.totalMatches ? ` matches=${amb.totalMatches}` : ''));
  if (amb.status === 'ambiguous') console.log(`   instruction: ${amb.instruction}`);

  const missing = await tools.findClient.handler({ query: '11:22:33:44:55:66' });
  summarise('findClient(unknown MAC)', missing);
  console.log(`   status=${missing.status}`);
  console.log(`   instruction: ${missing.instruction}`);
}

// 4. diagnoseClient
{
  const out = await tools.diagnoseClient.handler({ mac: firstMac });
  summarise(`diagnoseClient(${firstMac})`, out);
  console.log(`   ap=${out.attachment?.apName?.value} ssid=${out.attachment?.ssid?.value} security=${out.attachment?.security} vlan=${out.attachment?.vlan?.id}`);
  console.log(`   radio: rss=${out.radio?.rss} snr=${out.radio?.snr} rfqi=${out.radio?.rfqi} sustainedMedian=${out.radio?.sustainedRssMedian} samples=${out.radio?.sampleCount}`);
  console.log(`   latency: wireless=${out.latency?.wirelessMs} network=${out.latency?.networkMs} dns=${out.latency?.dnsMs}  (null = not measured)`);
  console.log(`   events=${out.timeline?.eventCount}`);
  console.log(`   lastSuccessful=${out.lifecycle?.lastSuccessfulStage}`);
  console.log(`   firstFailing=${out.lifecycle?.firstFailingStage}`);
  console.log(`   failureDomain=${out.lifecycle?.failureDomain}`);
  console.log(`   noEvidenceSource=[${out.lifecycle?.stagesWithNoEvidenceSource?.join(', ')}]`);
  const unknownStages = out.lifecycle.stages.filter((s) => s.status === 'unknown');
  console.log(`   stages marked unknown (never rendered as pass/fail): ${unknownStages.length}`);
}

// 5. peers
{
  const out = await tools.compareClientToPeers.handler({ mac: firstMac });
  summarise(`compareClientToPeers(${firstMac})`, out);
  for (const c of out.cohorts ?? []) {
    console.log(`   ${c.cohort.padEnd(18)} peers=${String(c.peerCount).padStart(3)} medianRss=${c.peerMedianRss ?? '-'} medianRfqi=${c.peerMedianRfqi ?? '-'} noIp=${c.peersWithoutIp}`);
  }
}

// 6. backend preflight
{
  const out = await tools.checkBackendServices.handler({});
  summarise('checkBackendServices', out);
  console.log(`   dhcp: ${out.dhcp.withoutIpv4}/${out.dhcp.associatedClients} without IPv4`);
  console.log(`   dns : measured on ${out.dns.clientsMeasured} clients p50=${out.dns.p50Ms} p90=${out.dns.p90Ms}`);
  console.log(`   vlan: ${out.vlan.danglingTopologies.length} dangling of ${out.vlan.wlansChecked} WLANs`);
  console.log(`   ntp : basis=${out.ntp.basis ?? 'unknown'}`);
}

// 7. RF health
{
  const out = await tools.getRfHealth.handler({});
  summarise('getRfHealth', out);
  console.log(`   radios=${out.radioCount}`);
  for (const r of (out.radios ?? []).slice(0, 6)) {
    const a = r.airtime;
    console.log(
      `   ${String(r.apName?.value).padEnd(26)} r${r.radioIndex} ${String(r.band).padEnd(7)} ` +
        `clients=${String(r.clients).padStart(2)} util=${String(a.utilization).padStart(3)}% ` +
        `own=${a.ownClients}% cochan=${a.coChannel}% nonwifi=${a.nonWifi}% ` +
        `noise=${a.noise ?? 'RADIO-OFF'} consistent=${a.consistent} offenders=${r.coChannelOffenders.length}`
    );
  }
}

// 8. AP health — the down lab AP
{
  const out = await tools.getApHealth.handler({ apSerial: 'WM012243W-30032' });
  summarise('getApHealth(AP5010-LAB)', out);
  console.log(`   name=${out.apName?.value} status=${out.operationalStatus} site=${out.site?.value}`);
  console.log(`   troubles=${JSON.stringify(out.troubles)}  <- ${out.troublesNote}`);
  for (const r of out.radios ?? []) {
    console.log(`   radio${r.radioIndex} admin=${r.adminState} reqCh=${r.requestedChannel} opCh=${r.operatingChannel} txPower=${r.txPower} onAir=${r.onAir}`);
  }
}

// 9. WLAN config
{
  const out = await tools.getWlanConfig.handler({});
  summarise('getWlanConfig', out);
  for (const w of out.wlans ?? []) {
    console.log(
      `   ${String(w.ssid?.value).padEnd(16)} ${String(w.security).padEnd(26)} ` +
        `vlan=${w.topology?.vlan ?? '-'} resolves=${w.topologyResolves} status=${w.status} cp=${w.captivePortal ?? '-'}`
    );
  }
  const psae = out.wlans.find((w) => w.ssid?.value === 'AURA_PSAE');
  const ppsk = out.wlans.find((w) => w.ssid?.value === 'AURA_PPSK');
  console.log(`   AURA_PSAE present=${Boolean(psae)} security=${psae?.security}`);
  console.log(`   AURA_PPSK present=${Boolean(ppsk)} security=${ppsk?.security}`);
}

// 10. recent changes
{
  const out = await tools.getRecentChanges.handler({ hours: 48 });
  summarise('getRecentChanges(48h)', out);
  console.log(`   entries=${out.entryCount}`);
  for (const e of (out.entries ?? []).slice(0, 5)) {
    console.log(`   ${e.at} ${e.user?.value ?? '-'} ${String(e.action?.value ?? '').slice(0, 90)}`);
  }
}

console.log('\n# tool layer live check complete');
process.exit(0);
