/**
 * Live smoke test: drive the new GatewayEvidence layer against the lab Gateway.
 * Proves the Node port of the flex/report stack returns the same real data the
 * verified Python does — before anything is built on top of it.
 */
import { ControllerSession } from '../server/monitoring/controllerClient.js';
import {
  GatewayEvidence,
  signal,
  rtt,
  isScorableClientRow,
  airtimeSplit,
  parseRoamRadios,
} from '../server/cortex/gatewayEvidence.js';

const BASE = process.env.GW_BASE ?? 'https://192.168.100.12:5825';

const session = new ControllerSession({
  baseUrl: BASE,
  username: 'admin',
  password: process.env.GW_PW,
  timeoutMs: 120_000,
});

const ev = new GatewayEvidence(session);

console.log(`# GatewayEvidence live smoke against ${BASE}\n`);

// --- 1. MuTable
const clients = await ev.clients();
console.log(`[1] flex MuTable          ok=${clients.ok} rows=${clients.rows.length} err=${clients.error ?? '-'}`);
if (!clients.ok) process.exit(1);

const scorable = clients.rows.filter(isScorableClientRow);
console.log(`    scorable rows=${scorable.length}  placeholder/idle=${clients.rows.length - scorable.length}`);

// unique clients
const byMac = new Map();
for (const r of clients.rows) {
  if (r.MAC) byMac.set(r.MAC, r);
}
console.log(`    unique MACs=${byMac.size}`);

// --- 2. sentinel handling proof
let sentinelHits = 0;
let realRtt = 0;
for (const r of clients.rows) {
  for (const col of ['DNSRTT', 'WirelessRTT', 'NetworkRTT']) {
    if (Number(r[col]) >= 65535) sentinelHits++;
    else if (rtt(r[col]) !== null) realRtt++;
  }
}
console.log(`[2] RTT sentinels suppressed=${sentinelHits}  real readings kept=${realRtt}`);

// --- 3. ApTable + airtime identity
const radios = await ev.radios();
console.log(`[3] flex ApTable          ok=${radios.ok} rows=${radios.rows.length}`);
let consistent = 0;
let inconsistent = 0;
for (const r of radios.rows) {
  const s = airtimeSplit(r);
  if (s.consistent) consistent++;
  else inconsistent++;
}
console.log(`    airtime identity holds on ${consistent}/${radios.rows.length} rows (fails ${inconsistent})`);
const sample = radios.rows.find((r) => airtimeSplit(r).consistent);
if (sample) {
  const s = airtimeSplit(sample);
  console.log(
    `    e.g. ${sample.ApName} radio${sample.RadioIndex}: util=${s.utilization}% ` +
      `own=${s.ownClients}% cochan=${s.coChannel}% nonwifi=${s.nonWifi}% avail=${s.available}% noise=${s.noise ?? 'radio-off'}`
  );
}

// --- 4. client timeline via muEvent
const [firstMac] = [...byMac.keys()];
const tl = await ev.clientTimeline(firstMac);
console.log(`[4] muEvent timeline      ok=${tl.ok} events=${tl.events.length} for ${firstMac}`);
for (const e of tl.events.slice(0, 6)) {
  const radios2 = parseRoamRadios(e.details);
  console.log(
    `    ${new Date(Number(e.timestamp)).toISOString()}  ${String(e.type).padEnd(15)} ` +
      `ap=${e.apName ?? '-'} ssid=${e.ssid ?? '-'} FT=${e.fastTransition ?? '-'}` +
      (radios2 ? ` radio ${radios2.from}->${radios2.to}${radios2.interband ? ' (interband)' : ''}` : '')
  );
}

// --- 5. baselines
const bl = await ev.clientBaselines(firstMac);
console.log(`[5] baselines             ok=${bl.ok}`);
for (const [k, v] of Object.entries(bl.baselines ?? {})) {
  console.log(`    ${k.padEnd(24)} points=${String(v.values.length).padEnd(5)} median=${v.median ?? '-'}`);
}

// --- 6. audit logs with the params they actually need
const audit = await ev.auditLogs({ hours: 24 });
console.log(`[6] auditlogs(24h)        ok=${audit.ok} entries=${audit.entries.length} err=${audit.error ?? '-'}`);

// --- 7. neighbours (interference source identification)
const nb = await ev.neighbours();
console.log(`[7] SmartRfNeighborTable  ok=${nb.ok} rows=${nb.rows.length} err=${nb.error ?? '-'}`);
if (nb.rows.length) {
  console.log(`    columns: ${Object.keys(nb.rows[0]).slice(0, 12).join(',')}`);
}

// --- 8. AURA_LAB scoping proof
const labRows = clients.rows.filter((r) => r.SiteName === 'AURA_LAB');
const sites = [...new Set(clients.rows.map((r) => r.SiteName))];
console.log(`[8] sites seen in MuTable: ${sites.join(', ')}`);
console.log(`    AURA_LAB client rows=${labRows.length}`);

console.log('\n# smoke complete');
process.exit(0);
