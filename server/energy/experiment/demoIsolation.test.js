import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The demo fail-safe's isolation, asserted at the module boundary.
 *
 * Every other guarantee in this feature is a runtime one — a provenance field, a
 * precedence check, a CHECK constraint. This file asserts the structural one
 * that makes those hard to get wrong: the projection exists ONLY in the HTTP
 * layer. It is computed per request and laid over a response.
 *
 * Which means the formal consumers of Energy savings — the environmental /
 * ISO 14001 report and the scenario extrapolation — read `summarize()` straight
 * off the engine and therefore cannot see a projected figure even in principle.
 * There is no exclusion rule for them to get wrong, because there is nothing
 * reaching them to exclude.
 *
 * If someone later imports the overlay into the engine, the repository or the
 * report to "reuse the numbers", these tests fail and say why. That is the
 * point: the runtime marks would still be correct while the isolation quietly
 * stopped being true.
 */

// fileURLToPath, not URL.pathname: this repository lives under a directory with
// a space in its name, which pathname percent-encodes into a path that does not
// exist.
const DIR = path.dirname(fileURLToPath(import.meta.url));

async function source(relative) {
  return readFile(path.resolve(DIR, relative), 'utf8');
}

/**
 * The module with its comments removed.
 *
 * These modules document at length what they do NOT do — "nothing here is
 * written to metric_samples" — so a plain substring search over the whole file
 * matches the promise and reports it as the violation. Only the code counts.
 */
async function code(relative) {
  const text = await source(relative);
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const DEMO_MODULES = ['demoProjection.js', 'demoOverlay.js'];

describe('the projection never reaches the engine', () => {
  it('experimentEngine.js does not import the demo projection or overlay', async () => {
    const text = await code('experimentEngine.js');
    for (const module of DEMO_MODULES) {
      expect(text).not.toContain(module);
    }
  });

  it('summarize() is the report path, and it is built only from measured rows', async () => {
    const text = await code('experimentEngine.js');
    // The provenance the engine can emit is fixed and does not include a
    // simulated-value class beyond the existing "no controller write" case.
    expect(text).not.toContain('DEMO_SIMULATED');
  });
});

describe('the projection never reaches the formal consumers', () => {
  it('reportEvidence.js — the environmental/ISO report bridge — cannot see it', async () => {
    const text = await code('reportEvidence.js');
    for (const module of DEMO_MODULES) {
      expect(text).not.toContain(module);
    }
    expect(text).not.toContain('DEMO_SIMULATED');
  });

  it('the environmental report itself cannot see it', async () => {
    const text = await code('../environmentalReport.js');
    for (const module of DEMO_MODULES) {
      expect(text).not.toContain(module);
    }
    expect(text).not.toContain('DEMO_SIMULATED');
  });

  it('the scenario engine cannot see it', async () => {
    const text = await code('../scenarioEngine.js');
    for (const module of DEMO_MODULES) {
      expect(text).not.toContain(module);
    }
  });

  it('report evidence still requires landed controller writes and a supported claim', async () => {
    // The two conditions no simulated run can satisfy. Asserted as text
    // because the alternative is a database, and this is the invariant that
    // keeps a projection out of a formal environmental record.
    const text = await source('reportEvidence.js');
    expect(text).toContain('controller_writes_applied');
    expect(text).toContain('claimSupported');
  });
});

describe('the projection never becomes telemetry', () => {
  it('neither demo module writes to the database', async () => {
    for (const module of DEMO_MODULES) {
      const text = await code(module);
      expect(text).not.toContain('experimentRepository');
      expect(text).not.toContain('db/pool');
      expect(text).not.toContain('query(');
      expect(text).not.toMatch(/\bINSERT\b/i);
      expect(text).not.toMatch(/\bUPDATE\s+\w/i);
      expect(text).not.toContain('metric_samples');
    }
  });

  it('neither demo module talks to the controller', async () => {
    for (const module of DEMO_MODULES) {
      const text = await code(module);
      expect(text).not.toContain('controllerClient');
      expect(text).not.toContain('radioActuator');
      expect(text).not.toContain('session.');
    }
  });

  it('the episode audit table is the only thing persisted, and only as DEMO_SIMULATED', async () => {
    const migration = await source('../../db/migrations/0021_energy_demo_simulation.sql');
    // A single permitted value, enforced by the database rather than by
    // convention, so no future code path can file a measurement here.
    expect(migration).toMatch(/CHECK\s*\(\s*value_source\s*=\s*'DEMO_SIMULATED'\s*\)/);
    expect(migration).not.toMatch(/ALTER TABLE metric_samples/i);
    expect(migration).not.toMatch(/ALTER TABLE energy_experiments/i);
  });
});
