import { describe, it, expect, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runTriggerEvaluation,
  runExclusive,
  isTriggerBusy,
  __resetTriggerGuard,
} from './triggerGuard.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => __resetTriggerGuard());

describe('trigger single-flight guard', () => {
  it('skips an evaluation while another is in flight', async () => {
    const gate = deferred();
    let runs = 0;
    const first = runTriggerEvaluation(async () => {
      runs += 1;
      await gate.promise;
      return 'first';
    });
    // Same tick: the sweep and the demo timer firing together.
    const second = await runTriggerEvaluation(async () => {
      runs += 1;
      return 'second';
    });
    expect(second).toEqual({ skipped: true });
    expect(isTriggerBusy()).toBe(true);
    gate.resolve();
    expect(await first).toBe('first');
    expect(runs).toBe(1);
    expect(isTriggerBusy()).toBe(false);
  });

  it('never runs two guarded functions concurrently', async () => {
    let active = 0;
    let maxActive = 0;
    const work = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
    };
    await Promise.all([
      runTriggerEvaluation(work),
      runExclusive(work),
      runExclusive(work),
      runTriggerEvaluation(work),
    ]);
    expect(maxActive).toBe(1);
  });

  it('makes an operator action wait for an in-flight evaluation rather than dropping it', async () => {
    const gate = deferred();
    const order = [];
    const evaluation = runTriggerEvaluation(async () => {
      order.push('evaluate:start');
      await gate.promise;
      order.push('evaluate:end');
    });
    const action = runExclusive(async () => {
      order.push('activate');
      return 'done';
    });
    gate.resolve();
    await evaluation;
    expect(await action).toBe('done');
    expect(order).toEqual(['evaluate:start', 'evaluate:end', 'activate']);
  });

  it('a failing evaluation does not wedge the guard', async () => {
    await expect(
      runTriggerEvaluation(async () => {
        throw new Error('controller down');
      })
    ).rejects.toThrow('controller down');
    expect(await runTriggerEvaluation(async () => 'next')).toBe('next');
  });
});

describe('every trigger evaluation goes through the guard', () => {
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('the demo override timer evaluates only inside runTriggerEvaluation', async () => {
    const text = strip(await readFile(path.resolve(DIR, 'experimentRouter.js'), 'utf8'));
    const calls = text.split('engine.evaluateTrigger(').length - 1;
    expect(calls).toBe(1);
    const at = text.indexOf('engine.evaluateTrigger(');
    expect(text.lastIndexOf('runTriggerEvaluation(', at)).toBeGreaterThan(-1);
    expect(at - text.lastIndexOf('runTriggerEvaluation(', at)).toBeLessThan(300);
  });

  it('the server sweep uses the shared guard and no private flag', async () => {
    const text = strip(await readFile(path.resolve(DIR, '../../../server.js'), 'utf8'));
    expect(text).not.toContain('energyTriggerRunning');
    const sweep = text.slice(text.indexOf('async function runEnergyTriggerSweep'));
    expect(sweep.slice(0, 600)).toContain('runEnergyTriggerEvaluation(');
  });
});
