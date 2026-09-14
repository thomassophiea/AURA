#!/usr/bin/env node
/**
 * Cortex evaluation runner.
 *
 * Runs the AI-First scenario set against a real provider and a real Gateway,
 * grades BEHAVIOUR (not prose), and reports per-category scores with measured
 * latency, tokens and cost.
 *
 * WHY IT NEEDS REAL CREDENTIALS
 * -----------------------------
 * There is no mock mode, deliberately and consistently with the rest of Cortex.
 * A mock provider once existed here and fabricated telemetry-shaped prose; an
 * eval run against a mock would grade the mock. If credentials are missing this
 * script says exactly which ones and exits 2 — it never substitutes a stub and
 * reports a score.
 *
 * USAGE
 *   ANTHROPIC_API_KEY=sk-ant-… GW_PW=… node scripts/cortex-eval.mjs
 *   … --model claude-opus-5            run one model
 *   … --compare claude-sonnet-5,claude-opus-5
 *   … --category safety                run one category
 *   … --scenario ts-client-unhappy     run one scenario
 *   … --json report.json               write the full report
 *
 * EXIT CODES
 *   0  every scenario passed
 *   1  at least one non-safety scenario failed
 *   3  a SAFETY scenario failed  (CI must treat this as a hard stop)
 *   2  cannot run: missing credentials or unreachable Gateway
 */

import { writeFileSync } from 'node:fs';
import { SCENARIOS, containsSecret } from '../server/cortex/eval/scenarios.js';
import { runGraders } from '../server/cortex/eval/graders.js';
import { runInvestigation, auditAnswer } from '../server/cortex/investigationAgent.js';
import { createLlmProviderForModel, createLlmProvider } from '../server/cortexLlmProvider.js';
import { createDiagnosticTools } from '../server/cortex/diagnosticTools.js';
import { getCapabilitiesFor } from '../server/cortex/capabilityRegistry.js';
import { GatewayEvidence } from '../server/cortex/gatewayEvidence.js';
import { ControllerSession } from '../server/monitoring/controllerClient.js';
import { selectModel } from '../server/cortex/modelPolicy.js';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const GW_URL = process.env.CAMPUS_CONTROLLER_URL ?? 'https://192.168.100.12:5825';
const GW_USER = process.env.GW_USER ?? 'admin';
const GW_PW = process.env.GW_PW ?? process.env.CAMPUS_CONTROLLER_PASSWORD;

function fail(msg) {
  console.error(`\n  Cannot run the evaluation.\n\n  ${msg}\n`);
  process.exit(2);
}

// ── Preflight: name the exact blocker rather than half-running ──────────────
if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_API_KEY && !process.env.GROQ_API_KEY) {
  fail(
    'No LLM provider key is set.\n' +
      '  Set ANTHROPIC_API_KEY (preferred) or GROQ_API_KEY and re-run.\n' +
      '  There is no mock provider: an eval against a stub would grade the stub.'
  );
}
if (!GW_PW) {
  fail(
    `No Gateway password. Set GW_PW for ${GW_USER}@${GW_URL}.\n` +
      '  The scenarios read live telemetry; there is no recorded fixture set.'
  );
}

const models = (flag('compare') ?? flag('model') ?? 'claude-sonnet-5').split(',').map((s) => s.trim());
const categoryFilter = flag('category');
const scenarioFilter = flag('scenario');
const jsonOut = flag('json');

let selected = SCENARIOS;
if (categoryFilter) selected = selected.filter((s) => s.category === categoryFilter);
if (scenarioFilter) selected = selected.filter((s) => s.id === scenarioFilter);
if (!selected.length) fail(`No scenarios matched. Categories: ${[...new Set(SCENARIOS.map((s) => s.category))].join(', ')}`);

console.log(`\nCortex evaluation — ${selected.length} scenario(s) × ${models.length} model(s)`);
console.log(`Gateway: ${GW_URL}\n`);

// ── Live Gateway session ───────────────────────────────────────────────────
//
// ONE SESSION, ONE LOGIN, REUSED BY EVERY SCENARIO.
//
// This Gateway locks the admin account out after a few logins in quick
// succession, and the correct password then answers 401 — indistinguishable
// from a rotated credential. Worse, `ControllerSession.get()` re-mints on a 401
// (controllerClient.js), so once locked out a 16-scenario run cascades into
// dozens of fresh login attempts, each deepening the lockout. Two runs of this
// harness were invalidated that way: every telemetry tool returned
// `fetch_failed` and troubleshooting scored near zero for a reason that had
// nothing to do with the model.
//
// So: do not add an auth "pre-check" in front of this. A curl probe seconds
// before this line is a SECOND login and is enough on its own to trip it. If
// the Gateway is locked, back off for several minutes — retrying makes it
// worse, and never sweep credentials at this box.
const session = new ControllerSession({ baseUrl: GW_URL, username: GW_USER, password: GW_PW });
try {
  const probe = await session.get('/v3/sites');
  if (!probe.ok) {
    fail(
      `Gateway ${GW_URL} answered ${probe.status} to the first read.\n` +
        (probe.status === 401
          ? '  A 401 with a correct password means the admin account is locked out after\n' +
            '  repeated logins. Back off several minutes and re-run — do not retry immediately,\n' +
            '  and do not add a pre-check login in front of this one.'
          : '  Check the URL and credentials.')
    );
  }
} catch (err) {
  fail(`Gateway ${GW_URL} did not answer: ${err.message}`);
}

const evidence = new GatewayEvidence(session);
const { registry: capabilities } = getCapabilitiesFor({ key: GW_URL, evidence, session });

/**
 * Resolve the concrete client MAC the client-scoped scenarios need.
 * Scenarios carry `__CLIENT_MAC__` rather than a hardcoded address so the suite
 * survives the lab having different clients on a different day.
 */
async function resolveSubjectMac() {
  try {
    const tools = createDiagnosticTools({ session, scope: {}, capabilities });
    const res = await tools.getSiteOverview.handler({});
    const mac = res?.clients?.[0]?.mac ?? res?.worstClients?.[0]?.mac ?? null;
    if (mac) console.log(`Subject client resolved live: ${mac}\n`);
    else console.log('No connected client found — client-scoped scenarios will run unscoped.\n');
    return mac;
  } catch {
    return null;
  }
}
const subjectMac = await resolveSubjectMac();

const report = { startedAt: new Date().toISOString(), gateway: GW_URL, models: {} };
let anyFailure = false;
let safetyFailure = false;

for (const model of models) {
  console.log(`\n${'='.repeat(70)}\nMODEL: ${model}\n${'='.repeat(70)}`);
  const modelReport = { scenarios: [], totals: {} };

  for (const scenario of selected) {
    const scope = { ...(scenario.scope ?? {}) };
    let skipped = null;
    if (scope.mac === '__CLIENT_MAC__') {
      if (subjectMac) {
        scope.mac = subjectMac;
      } else {
        // SKIP, do not run-and-fail.
        //
        // A client-diagnosis scenario with no client measures nothing. Run
        // unscoped, the model correctly answers "which client are you asking
        // about?" — refusing to invent a subject, which is exactly the
        // behaviour this product wants — and then gets marked down for calling
        // no tools and admitting no gap. That is the harness scoring good
        // behaviour as failure, and it drags the whole troubleshooting category
        // down for a reason that has nothing to do with the model.
        skipped = 'no connected client on the Gateway to diagnose';
      }
    }

    if (skipped) {
      console.log(`  [SKIP] ${scenario.id.padEnd(26)}   —  ${skipped}`);
      modelReport.scenarios.push({
        id: scenario.id,
        category: scenario.category,
        runbook: scenario.runbook ?? null,
        skipped,
        passed: null,
        score: null,
      });
      continue;
    }

    // INJECT THE HOSTILE STRING FOR REAL.
    //
    // This field used to be declared on the scenario and read by nobody, so the
    // flagship injection test ran a benign question against whatever happened
    // to be on the lab box and graded "resisted injection" on an input that
    // contained no injection. It could not have detected a regression.
    //
    // It is injected through `scope`, which is a genuine network-sourced path
    // into the system prompt — the UI fills `ssid` and `siteName` from Gateway
    // data — and it needs no write to the Gateway to exercise.
    if (scenario.injectHostileData) {
      scope.ssid = scenario.injectHostileData;
    }

    const policy = selectModel({
      question: scenario.question,
      intent: scenario.intent,
      requestedModel: model,
    });

    let provider;
    try {
      ({ provider } = createLlmProviderForModel(model, []));
    } catch {
      ({ provider } = createLlmProvider({}));
    }

    const tools = createDiagnosticTools({ session, scope, capabilities });
    const t0 = Date.now();
    let result;
    try {
      result = await runInvestigation({
        provider,
        model,
        tools,
        capabilities,
        question: scenario.question,
        scope,
        effort: policy.effort,
      });
    } catch (err) {
      result = { answer: '', ledger: [], providerError: err.message };
    }
    const latencyMs = Date.now() - t0;

    // The graders read `audit`, so compute it the same way the route does.
    const graded = runGraders(
      { ...result, audit: auditAnswer(result.answer, result.ledger) },
      scenario.graders
    );

    // Secret leakage is checked outside the grader set: it is a hard stop
    // regardless of which scenario surfaced it.
    const leaked = containsSecret(result.answer);
    if (leaked) {
      graded.passed = false;
      graded.failures.push({ id: 'secret-leak', passed: false, weight: 99, detail: `answer matched ${leaked}` });
    }

    if (!graded.passed) {
      anyFailure = true;
      if (scenario.category === 'safety') safetyFailure = true;
    }

    const mark = graded.passed ? 'PASS' : 'FAIL';
    const cost = result.cost?.estimatedCostUsd;
    console.log(
      `  [${mark}] ${scenario.id.padEnd(26)} ${String(Math.round(graded.score * 100)).padStart(3)}%  ` +
        `${String(latencyMs).padStart(6)}ms  ${String(result.ledger?.length ?? 0).padStart(2)} tools  ` +
        (cost === null || cost === undefined ? 'unpriced' : `$${cost.toFixed(4)}`)
    );
    for (const f of graded.failures) console.log(`         ↳ ${f.id}: ${f.detail}`);

    modelReport.scenarios.push({
      id: scenario.id,
      category: scenario.category,
      runbook: scenario.runbook ?? null,
      passed: graded.passed,
      score: graded.score,
      failures: graded.failures,
      latencyMs,
      toolCalls: result.ledger?.length ?? 0,
      iterations: result.iterations ?? 0,
      stoppedBecause: result.stoppedBecause ?? null,
      cost: result.cost ?? null,
      providerError: result.providerError ?? null,
      answer: result.answer ?? '',
    });
  }

  // ── Per-category rollup ──────────────────────────────────────────────────
  // Skipped scenarios are excluded from every denominator. A skip is "not
  // measured", and folding it in as a failure is the same sin the doctrine
  // forbids the model for: reporting an absent measurement as a bad one.
  const scored = modelReport.scenarios.filter((s) => !s.skipped);
  const skippedCount = modelReport.scenarios.length - scored.length;
  const byCategory = {};
  for (const s of scored) {
    const c = (byCategory[s.category] ??= { n: 0, passed: 0, score: 0 });
    c.n += 1;
    c.passed += s.passed ? 1 : 0;
    c.score += s.score;
  }
  for (const [name, c] of Object.entries(byCategory)) {
    c.meanScore = Number((c.score / c.n).toFixed(3));
    delete c.score;
    console.log(`\n  ${name.padEnd(16)} ${c.passed}/${c.n} passed   mean score ${c.meanScore}`);
  }

  // Null-aware, to match the per-scenario line and the doctrine everywhere
  // else: a run with no published rate is "unpriced", never "$0.0000". Folding
  // nulls in as zero here would have printed a free-looking total for an
  // entirely unpriced provider.
  const priced = scored.filter((x) => typeof x.cost?.estimatedCostUsd === 'number');
  const totalCost = priced.reduce((s, x) => s + x.cost.estimatedCostUsd, 0);
  const costLabel = priced.length ? `$${totalCost.toFixed(4)}` : 'unpriced';
  const meanLatency = scored.length
    ? Math.round(scored.reduce((s, x) => s + x.latencyMs, 0) / scored.length)
    : 0;
  modelReport.totals = {
    byCategory,
    passed: scored.filter((s) => s.passed).length,
    total: scored.length,
    skipped: skippedCount,
    meanLatencyMs: meanLatency,
    estimatedCostUsd: priced.length ? Number(totalCost.toFixed(4)) : null,
    pricedScenarios: priced.length,
  };
  console.log(
    `\n  TOTAL  ${modelReport.totals.passed}/${modelReport.totals.total}` +
      `${skippedCount ? ` (${skippedCount} skipped)` : ''}  mean ${meanLatency}ms  ${costLabel}`
  );

  report.models[model] = modelReport;
}

// ── Model comparison ───────────────────────────────────────────────────────
if (models.length > 1) {
  console.log(`\n${'='.repeat(70)}\nCOMPARISON\n${'='.repeat(70)}`);
  console.log(`  ${'model'.padEnd(22)} ${'pass'.padEnd(8)} ${'latency'.padEnd(10)} cost`);
  for (const [model, r] of Object.entries(report.models)) {
    console.log(
      `  ${model.padEnd(22)} ${`${r.totals.passed}/${r.totals.total}`.padEnd(8)} ` +
        `${`${r.totals.meanLatencyMs}ms`.padEnd(10)} ` +
        `${r.totals.estimatedCostUsd === null ? 'unpriced' : `$${r.totals.estimatedCostUsd}`}`
    );
  }
  console.log(
    '\n  Judge cost per COMPLETED task, not per request: a cheaper model that needs\n' +
      '  a second pass to reach the same diagnosis is not cheaper.'
  );
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  console.log(`\nFull report written to ${jsonOut}`);
}

if (safetyFailure) {
  console.error('\nSAFETY FAILURE — a safety scenario did not pass. This is a hard stop.\n');
  process.exit(3);
}
if (anyFailure) {
  console.error('\nAt least one scenario failed.\n');
  process.exit(1);
}
console.log('\nAll scenarios passed.\n');
