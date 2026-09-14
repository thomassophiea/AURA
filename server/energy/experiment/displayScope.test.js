import { describe, it, expect } from 'vitest';
import { selectDisplayExperiment } from './displayScope.js';

const CONFIG = {
  treatment_site_id: 'n-id',
  control_site_id: 's-id',
  treatment_site_name: 'EAL-PT-N',
  control_site_name: 'EAL-PT-S',
};

const run = (treatment, control, state = 'complete') => ({
  id: `${treatment}-${control}`,
  state,
  treatment_site_id: treatment,
  control_site_id: control,
});

describe('an in-flight experiment is always the subject', () => {
  it('outranks the configured pair, which may have been edited mid-run', () => {
    const active = run('other-n', 'other-s', 'optimization_active');
    const { experiment, reason } = selectDisplayExperiment({
      active,
      latest: active,
      config: CONFIG,
    });
    expect(experiment).toBe(active);
    expect(reason).toBe('active');
  });
});

describe('a finished run is shown only if it is about the configured pair', () => {
  it('is the subject when the pair still matches', () => {
    const latest = run('n-id', 's-id');
    const { experiment, reason } = selectDisplayExperiment({ latest, config: CONFIG });
    expect(experiment).toBe(latest);
    expect(reason).toBe('latest_matches_configured_pair');
  });

  it('is history when the pair has been re-pointed since', () => {
    // The exact Integration case: configured EAL-PT-N/EAL-PT-S, but the most
    // recent run was PrimarySite/EAL from three days earlier. Presenting that
    // run labelled PrimarySite as "Energy optimized site" is the bug.
    const { experiment, reason } = selectDisplayExperiment({
      latest: run('primary-id', 'eal-id'),
      config: CONFIG,
    });
    expect(experiment).toBeNull();
    expect(reason).toBe('configured_pair_differs_from_last_run');
  });

  it('is history when only one side was re-pointed', () => {
    expect(
      selectDisplayExperiment({ latest: run('n-id', 'eal-id'), config: CONFIG }).experiment
    ).toBeNull();
    expect(
      selectDisplayExperiment({ latest: run('primary-id', 's-id'), config: CONFIG }).experiment
    ).toBeNull();
  });

  it('is history when the sides were swapped — that is a different experiment', () => {
    // Optimized and control reversed is not the same comparison, and the claim
    // would have the wrong sign.
    const { experiment } = selectDisplayExperiment({ latest: run('s-id', 'n-id'), config: CONFIG });
    expect(experiment).toBeNull();
  });

  it('is shown regardless of how it ended, as long as the pair matches', () => {
    for (const state of ['complete', 'error']) {
      const latest = run('n-id', 's-id', state);
      expect(selectDisplayExperiment({ latest, config: CONFIG }).experiment).toBe(latest);
    }
  });
});

describe('when there is nothing to disagree with', () => {
  it('reports no experiment when none exists', () => {
    expect(selectDisplayExperiment({ config: CONFIG })).toEqual({
      experiment: null,
      reason: 'no_experiment',
    });
  });

  it('falls back to the most recent run when no pair is configured', () => {
    const latest = run('a', 'b');
    expect(selectDisplayExperiment({ latest, config: null }).reason).toBe(
      'latest_no_configured_pair'
    );
    expect(selectDisplayExperiment({ latest, config: {} }).reason).toBe(
      'latest_no_configured_pair'
    );
  });

  it('treats a half-configured pair as unconfigured rather than guessing', () => {
    expect(
      selectDisplayExperiment({ latest: run('a', 'b'), config: { treatment_site_id: 'n-id' } })
        .reason
    ).toBe('latest_no_configured_pair');
  });

  it('survives being called with nothing at all', () => {
    expect(selectDisplayExperiment({})).toEqual({ experiment: null, reason: 'no_experiment' });
  });
});
