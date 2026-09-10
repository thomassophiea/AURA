/**
 * Live Cortex diagnosis harness.
 *
 * Drives the real evidence layer end to end against a Gateway and prints the
 * connection-lifecycle ladder for a client. This is the ground-truth check for
 * the agent: whatever Cortex says in chat must be derivable from this output,
 * and nothing here is synthesised.
 *
 *   GW_PW=... node scripts/cortex-diagnose.mjs                 # fleet overview
 *   GW_PW=... node scripts/cortex-diagnose.mjs <query>         # diagnose a client
 */
import { ControllerSession } from '../server/monitoring/controllerClient.js';
import { GatewayEvidence, signal, rtt } from '../server/cortex/gatewayEvidence.js';
import { CapabilityRegistry } from '../server/cortex/capabilityRegistry.js';
import { resolveClient, dedupeByMac, summariseCandidate } from '../server/cortex/clientResolver.js';
import { buildLifecycle, renderLifecycle, describeSecurity } from '../server/cortex/connectionLifecycle.js';

const BASE = process.env.GW_BASE ?? 'https://192.168.100.12:5825';
const query = process.argv.slice(2).join(' ').trim();

const session = new ControllerSession({
  baseUrl: BASE,
  username: process.env.GW_USER ?? 'admin',
  password: process.env.GW_PW,
  timeoutMs: 120_000,
});
const evidence = new GatewayEvidence(session);
const capabilities = new CapabilityRegistry();

console.log(`# Cortex diagnosis via ${BASE}\n`);

// Probe capabilities against THIS box rather than trusting the baseline.
const snap = await capabilities.probe(evidence, { session });
const counts = {};
for (const c of Object.values(snap.capabilities)) {
  counts[c.availability] = (counts[c.availability] ?? 0) + 1;
}
console.log('Capability registry (probed):', JSON.stringify(counts));
console.log(`  usable=${capabilities.usableKeys().length}  unusable=${capabilities.unusableKeys().length}\n`);

const clientsRes = await evidence.clients();
if (!clientsRes.ok) {
  console.error('FATAL: client telemetry unavailable:', clientsRes.error);
  process.exit(1);
}
const rows = clientsRes.rows;
const unique = dedupeByMac(rows);

// Resolve config context once — used for VLAN and security resolution.
const svcRes = await session.get('/v1/services');
const topoRes = await session.get('/v1/topologies');
const services = Array.isArray(svcRes.data) ? svcRes.data : [];
const topologies = Array.isArray(topoRes.data) ? topoRes.data : [];

function contextFor(row) {
  const service =
    services.find((s) => s.id === row.RFSUUID) ??
    services.find((s) => s.ssid === row.SSID) ??
    null;
  const topology = service
    ? topologies.find((t) => t.id === service.defaultTopology) ?? null
    : null;
  return { service, topology };
}

if (!query) {
  console.log(`Fleet: ${unique.length} unique clients, ${rows.length} samples\n`);
  const scored = unique
    .map(summariseCandidate)
    .filter((c) => c.rss !== null)
    .sort((a, b) => (a.rss ?? 0) - (b.rss ?? 0));
  console.log('Weakest 10 by signal:');
  for (const c of scored.slice(0, 10)) {
    console.log(
      `  ${c.mac}  ${String(c.hostname || c.osName || c.manufacturer || '?').slice(0, 22).padEnd(22)} ` +
        `${String(c.apName).padEnd(26)} ${String(c.ssid).padEnd(14)} ` +
        `RSS ${String(c.rss).padStart(4)} SNR ${String(c.snr).padStart(3)} RFQI ${c.rfqi ?? '-'}/5` +
        (c.randomizedMac ? '  [randomized MAC]' : '')
    );
  }
  const randomized = unique.filter((r) => summariseCandidate(r).randomizedMac).length;
  console.log(`\nRandomized MACs: ${randomized}/${unique.length} clients`);
  const sites = [...new Set(unique.map((r) => r.SiteName))];
  console.log(`Sites present in telemetry: ${sites.join(', ')}`);
  process.exit(0);
}

// ── diagnose one client ────────────────────────────────────────────────
const res = resolveClient(query, rows);
console.log(`Resolution for "${query}": ${res.status} (matched on ${res.matchedOn})`);

if (res.status === 'not_found') {
  console.log(`\n${res.note ?? 'No match.'}`);
  if (res.identityNote) console.log(`\n${res.identityNote}`);
  process.exit(0);
}
if (res.status === 'ambiguous') {
  console.log(`\n${res.totalMatches} clients match. Candidates:\n`);
  for (const c of res.candidates) {
    console.log(
      `  ${c.mac}  ${String(c.hostname || c.osName || c.manufacturer || '?').slice(0, 24).padEnd(24)} ` +
        `${String(c.apName).padEnd(26)} ${c.ssid}` + (c.randomizedMac ? '  [randomized]' : '')
    );
  }
  console.log('\nCortex would ask which of these you mean rather than pick one.');
  process.exit(0);
}

const client = res.client;
const row = unique.find((r) => (r.MAC ?? '').toUpperCase() === client.mac);
const { service, topology } = contextFor(row);
const tl = await evidence.clientTimeline(client.mac);
const bl = await evidence.clientBaselines(client.mac);

console.log(`\n── Client ──────────────────────────────────────────────`);
console.log(`  MAC          ${client.mac}${client.randomizedMac ? '   [randomized / locally-administered]' : ''}`);
console.log(`  Device       ${[client.osName, client.manufacturer].filter(Boolean).join(' / ') || 'unknown'}`);
console.log(`  Hostname     ${client.hostname ?? '(not published)'}`);
console.log(`  Username     ${client.username ?? '(none — PSK network or not supplied)'}`);
console.log(`  IP           ${client.ip ?? '(none)'}`);
console.log(`  Site         ${client.siteName}`);
console.log(`  AP / radio   ${client.apName} (${client.apSerial}) radio ${client.radioId}`);
console.log(`  WLAN         ${client.ssid}` + (service ? `  [${describeSecurity(service).mode}]` : ''));
console.log(`  Role         ${client.role ?? '(none)'}`);
console.log(`  VLAN         ${topology ? `${topology.vlanid} (${topology.name})` : '(unresolved)'}`);

const sig = signal(row);
console.log(`\n── Live radio ──────────────────────────────────────────`);
console.log(`  RSS ${sig.rss ?? '?'} dBm | SNR ${sig.snr ?? '?'} dB | RFQI ${row.RFQI ?? '?'}/5 | ch ${row.Channel} (${row['11Protocol']})`);
console.log(
  `  wirelessRTT ${fmt(rtt(row.WirelessRTT))} | networkRTT ${fmt(rtt(row.NetworkRTT))} | dnsRTT ${fmt(rtt(row.DNSRTT))}`
);
console.log(`  (a dash means the Gateway did not measure it — not zero, not good)`);

console.log(`\n── 3-hour baseline (Gateway's own learned envelope) ────`);
for (const [k, v] of Object.entries(bl.baselines ?? {})) {
  console.log(`  ${k.replace('baselining', '').padEnd(14)} median=${v.median ?? '-'}  points=${v.values.length}`);
}

console.log(`\n── Event timeline (muEvent) ────────────────────────────`);
if (!tl.events.length) console.log('  no events in the window');
for (const e of tl.events.slice(-12)) {
  console.log(
    `  ${new Date(Number(e.timestamp)).toISOString()}  ${String(e.type).padEnd(15)} ` +
      `${e.apName ?? ''} ${e.fastTransition ? `FT[${e.fastTransition}]` : ''}`
  );
}

const life = buildLifecycle({ row, events: tl.events, service, topology, capabilities });
console.log(`\n── Connection path ─────────────────────────────────────`);
console.log(renderLifecycle(life));
console.log(`\n  last successful stage : ${life.lastSuccessful?.label ?? 'none'}`);
console.log(`  first failing stage   : ${life.firstFailing?.label ?? 'none'}`);
console.log(`  stages with no evidence source: ${life.unknowns.length} (${life.unknowns.join(', ')})`);

if (client.randomizedMac) {
  console.log(`\n  NOTE: ${res.identityNote}`);
}

process.exit(0);

function fmt(v) {
  return v === null ? '-' : `${v} ms`;
}
