/**
 * Device health, live against a real Gateway.
 *
 * Every claim this feature makes about the platform — no CPU, no memory, no
 * temperature, an empty `wired` array on ifstats, a 404 on traceurls — was
 * measured, not read off a spec. This script is how that stays true: it runs
 * the real tools against real hardware and prints what came back, including the
 * parts that came back missing.
 *
 *   GW_PW=... node scripts/device-health-live.mjs
 *   GW_PW=... node scripts/device-health-live.mjs --ap CV012408S-C0102
 *   GW_PW=... node scripts/device-health-live.mjs --bundle CV012408S-C0102
 *
 * Read-only throughout. It never issues the disruptive log-collection write,
 * and the assertion at the end proves no write tool is exposed at all.
 */
import { ControllerSession } from '../server/monitoring/controllerClient.js';
import { GatewayEvidence } from '../server/cortex/gatewayEvidence.js';
import { CapabilityRegistry } from '../server/cortex/capabilityRegistry.js';
import { createDiagnosticTools } from '../server/cortex/diagnosticTools.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? true;
};

const BASE = process.env.GW_BASE ?? 'https://192.168.100.12:5825';
const session = new ControllerSession({
  baseUrl: BASE,
  username: process.env.GW_USER ?? 'admin',
  password: process.env.GW_PW,
  timeoutMs: 120_000,
});

const capabilities = new CapabilityRegistry();
const tools = createDiagnosticTools({ session, capabilities });

const line = (s = '') => console.log(s);
const rule = (t) => line(`\n${'─'.repeat(78)}\n${t}\n`);

// Safety first: the model must never be handed a write.
const writeTools = Object.values(tools).filter((t) => t.risk === 'write' || t.risk === 'disruptive');
if (writeTools.length) {
  console.error(`FAIL: ${writeTools.length} write/disruptive tool(s) exposed to the model`);
  process.exit(3);
}

rule(`Device health, live against ${BASE}`);
line(`Read-only tools registered: ${Object.keys(tools).length}`);
line('Write/disruptive tools exposed to the model: 0');

const started = Date.now();

// ── Fleet ────────────────────────────────────────────────────────────────────
rule('1. "Do I have any unhealthy APs?"  → getDeviceHealth()');
const fleet = await tools.getDeviceHealth.handler({});
if (fleet.unavailable) {
  line(`UNAVAILABLE: ${fleet.reason}`);
} else {
  line(`${fleet.apCount} APs assessed`);
  line(`  healthy          ${fleet.healthy}`);
  line(`  degraded         ${fleet.degraded}`);
  line(`  unhealthy        ${fleet.unhealthy}`);
  line(`  unknown          ${fleet.unknown}   <- must never be folded into healthy`);
  line(`  RMA candidates   ${fleet.rmaCandidates}`);
  line(`  RMA recommended  ${fleet.rmaRecommended}`);
  line(`\nFirmware spread:`);
  for (const f of fleet.firmwareSpread) line(`  ${String(f.apCount).padStart(3)} x ${f.build}`);
  line(`\nExceptions (${fleet.exceptions.length}):`);
  for (const e of fleet.exceptions) {
    line(`  ${String(e.ap?.value ?? e.serial).padEnd(26)} ${e.health.padEnd(10)} RMA: ${e.rma}`);
    line(`      attributed to: ${e.attributedTo ?? '—'}`);
    for (const f of e.faults) line(`      FAULT   ${f}`);
    for (const c of e.concerns) line(`      concern ${c}`);
    if (e.blockedHealthyBy?.length) line(`      blocked by: ${e.blockedHealthyBy.join(', ')}`);
  }
  line(`\nPlatform gaps reported on a SUCCESSFUL assessment: ${fleet.capabilityGaps.join(', ')}`);
}

// ── One AP, deep ─────────────────────────────────────────────────────────────
const target = flag('--ap') ?? flag('--bundle')
  ?? (typeof fleet.exceptions?.[0]?.serial === 'string' ? fleet.exceptions[0].serial : null)
  ?? null;

if (target) {
  rule(`2. "Is ${target} healthy?"  → getDeviceHealth({apSerial})`);
  const one = await tools.getDeviceHealth.handler({ apSerial: target });
  if (one.unavailable) {
    line(`UNAVAILABLE (${one.status}): ${one.reason}`);
  } else {
    line(`${one.ap?.value ?? target}  ${one.model}  @ ${one.site?.value ?? '?'}`);
    line(`\n  Health: ${one.health}`);
    line(`  RMA:    ${one.rma}`);
    if (one.rmaReasons?.length) for (const r of one.rmaReasons) line(`    why:     ${r}`);
    if (one.rmaBlockers?.length) for (const b of one.rmaBlockers) line(`    blocker: ${b}`);
    line(`\n  Checks:`);
    for (const c of one.checks) {
      const mark = { pass: ' ok ', concern: 'WARN', fault: 'FAIL', unmeasured: ' -- ' }[c.state];
      line(`   [${mark}] ${c.check.padEnd(17)}${c.reason ? `(${c.reason}) ` : ''}${c.summary}`);
    }
    line(`\n  Isolation:`);
    for (const l of one.isolation.layers) {
      line(`    ${l.layer.padEnd(18)} ${l.verdict}`);
    }
    line(`\n  Reboot history available: ${one.rebootHistoryAvailable}`);
    if (one.suspectTelemetry?.length) {
      line(`  Suspect telemetry: ${one.suspectTelemetry.map((s) => s.check).join(', ')}`);
    }
  }

  rule(`3. "Why does ${target} keep rebooting?"  → getApRebootHistory()`);
  const reboots = await tools.getApRebootHistory.handler({ apSerial: target });
  if (reboots.unavailable) {
    line(`${reboots.status}: ${reboots.reason}`);
    line(`instruction: ${reboots.instruction}`);
  } else {
    line(`window ${reboots.windowHours}h, ${reboots.sampleCount} samples`);
    line(`unexpected restarts in 24h: ${reboots.unexpectedLast24h}`);
    line(`upgrade-correlated in 24h:  ${reboots.upgradeCorrelatedLast24h}`);
  }
}

// ── The RMA package ──────────────────────────────────────────────────────────
if (flag('--bundle')) {
  const serial = flag('--bundle');
  rule(`4. "Prepare the RMA evidence for ${serial}"  → buildRmaEvidence()`);
  const res = await tools.buildRmaEvidence.handler({ apSerial: serial });
  if (res.unavailable) {
    line(`${res.status}: ${res.reason}`);
  } else {
    line(res.summary);
    line(`\nEliminated alternative causes:`);
    for (const e of res.bundle.alternativeCausesEliminated) {
      line(`  ${e.layer}: ${e.eliminatedBy.join(', ')}`);
    }
    line(`\nNOT eliminated:`);
    for (const e of res.bundle.alternativeCausesNotEliminated) {
      line(`  ${e.layer}: ${e.verdict}`);
    }
    line(`\nDevice logs included: ${res.bundle.deviceLogs.included} — ${res.bundle.deviceLogs.why}`);
  }
}

rule(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
