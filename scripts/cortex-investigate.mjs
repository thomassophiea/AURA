/**
 * End-to-end Aura Cortex investigation against a live Gateway and a live LLM.
 *
 * This is the only test that proves the whole thing: model -> tool selection ->
 * real Gateway evidence -> evidence-backed answer, with the ledger audit that
 * catches a claim the evidence does not support.
 *
 *   GW_PW=... GROQ_API_KEY=... node scripts/cortex-investigate.mjs "why is X slow?"
 */
import { ControllerSession } from '../server/monitoring/controllerClient.js';
import { GatewayEvidence } from '../server/cortex/gatewayEvidence.js';
import { CapabilityRegistry } from '../server/cortex/capabilityRegistry.js';
import { createDiagnosticTools, TOOL_ACTIVITY } from '../server/cortex/diagnosticTools.js';
import { runInvestigation, auditAnswer } from '../server/cortex/investigationAgent.js';
import { OpenAiLlmProvider } from '../server/cortexLlmProvider.js';

const BASE = process.env.GW_BASE ?? 'https://192.168.100.12:5825';
const question = process.argv.slice(2).join(' ').trim() || 'Are any clients having problems right now?';

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  console.error('GROQ_API_KEY is required.');
  process.exit(1);
}

// Ask Groq which models it will actually serve, rather than trusting a
// hardcoded id that may have been retired.
const modelsResp = await fetch('https://api.groq.com/openai/v1/models', {
  headers: { Authorization: `Bearer ${apiKey}` },
});
const available = modelsResp.ok ? (await modelsResp.json()).data.map((m) => m.id) : [];
// Measured against Groq's live model list 2026-09-10: every llama-3.x id the
// AURA registry still advertises has been retired. These are the ids actually
// served, ordered by reasoning capability. Safeguard/prompt-guard/whisper
// models are deliberately excluded — they are classifiers and ASR, not agents.
const PREFERRED = [
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'qwen/qwen3.6-27b',
  'openai/gpt-oss-20b',
  'groq/compound',
];
const model = process.env.CORTEX_MODEL ?? PREFERRED.find((m) => available.includes(m)) ?? available[0];
console.log(`# model: ${model}   (${available.length} available from Groq)`);
if (!model) {
  console.error('No usable Groq model.');
  process.exit(1);
}

const session = new ControllerSession({
  baseUrl: BASE,
  username: process.env.GW_USER ?? 'admin',
  password: process.env.GW_PW,
  timeoutMs: 120_000,
});

const capabilities = new CapabilityRegistry();
await capabilities.probe(new GatewayEvidence(session), { session });
const tools = createDiagnosticTools({ session, capabilities });
const provider = new OpenAiLlmProvider({ apiKey, baseUrl: 'https://api.groq.com/openai/v1' });

console.log(`# gateway: ${BASE}`);
console.log(`# question: ${question}\n`);

const t0 = Date.now();
const result = await runInvestigation({
  provider,
  model,
  tools,
  capabilities,
  question,
  activityLabels: TOOL_ACTIVITY,
  onActivity: (label, meta) => console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}  (${meta.tool})`),
});

console.log(`\n──────── ANSWER ────────\n`);
if (result.providerError) {
  console.log(`Cortex could not reach the AI service: ${result.providerError}`);
} else {
  console.log(result.answer || '(no answer produced)');
}

console.log(`\n──────── EVIDENCE LEDGER ────────`);
if (!result.ledger.length) console.log('  (no tool calls)');
for (const l of result.ledger) {
  console.log(
    `  ${l.ok ? 'ok  ' : 'FAIL'} ${String(l.tool).padEnd(22)} ` +
      `basis=${String(l.basis ?? '-').padEnd(9)} ${String(l.durationMs ?? '-').padStart(6)}ms ` +
      `args=${JSON.stringify(l.args).slice(0, 60)}` +
      (l.untrustedFieldCount ? `  fenced=${l.untrustedFieldCount}` : '') +
      (l.suspiciousFields ? `  SUSPICIOUS=${l.suspiciousFields}` : '')
  );
}

console.log(`\n──────── RUN ────────`);
console.log(`  iterations      ${result.iterations}`);
console.log(`  tool calls      ${result.usage.toolCalls}`);
console.log(`  stopped because ${result.stoppedBecause}`);
console.log(`  wall clock      ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  tokens          prompt=${result.usage.promptTokens} completion=${result.usage.completionTokens}`);
for (const w of result.warnings) console.log(`  warning: ${w}`);

const findings = auditAnswer(result.answer, result.ledger);
console.log(`\n──────── HALLUCINATION AUDIT ────────`);
if (!findings.length) {
  console.log('  clean — every checked claim has a matching successful tool call');
} else {
  for (const f of findings) console.log(`  [${f.severity}] ${f.detail}`);
}

process.exit(findings.some((f) => f.severity === 'high') ? 2 : 0);
