import { describe, it, expect } from 'vitest';

import {
  resolveEnvironmentName,
  resolveProcessRole,
  describeEnvironment,
  describeVariables,
} from './environment.js';

describe('resolveEnvironmentName', () => {
  it('defaults to integration when unset', () => {
    expect(resolveEnvironmentName({})).toBe('integration');
    expect(resolveEnvironmentName({ AURA_ENVIRONMENT: '  ' })).toBe('integration');
  });

  it('normalises case and whitespace', () => {
    expect(resolveEnvironmentName({ AURA_ENVIRONMENT: ' Production ' })).toBe('production');
  });

  it('rejects an unknown environment rather than guessing', () => {
    expect(() => resolveEnvironmentName({ AURA_ENVIRONMENT: 'staging' })).toThrow(
      /must be one of integration, production/
    );
  });
});

describe('resolveProcessRole', () => {
  it('defaults to web', () => {
    expect(resolveProcessRole({})).toBe('web');
  });

  it('reads the known roles', () => {
    expect(resolveProcessRole({ MONITORING_ROLE: 'collector' })).toBe('collector');
    expect(resolveProcessRole({ MONITORING_ROLE: 'CLEANUP' })).toBe('cleanup');
  });

  it('falls back to web for an unknown role, matching server.js', () => {
    expect(resolveProcessRole({ MONITORING_ROLE: 'nonsense' })).toBe('web');
  });
});

describe('describeEnvironment', () => {
  it('reports production with its label and short label', () => {
    expect(describeEnvironment({ AURA_ENVIRONMENT: 'production' })).toMatchObject({
      environment: 'production',
      label: 'Production Demo',
      shortLabel: 'PROD DEMO',
      explicit: true,
      isProduction: true,
    });
  });

  it('flags a defaulted environment as not explicit', () => {
    expect(describeEnvironment({})).toMatchObject({
      environment: 'integration',
      explicit: false,
      isProduction: false,
    });
  });
});

describe('describeVariables', () => {
  it('reports missing required variables for the web role', () => {
    const result = describeVariables({ AURA_ENVIRONMENT: 'production' }, 'web');
    expect(result.ok).toBe(false);
    expect(result.missingRequired).toContain('DATABASE_URL');
    expect(result.missingRequired).toContain('CAMPUS_CONTROLLER_URL');
    expect(result.present).toEqual(['AURA_ENVIRONMENT']);
  });

  it('is satisfied when every required variable is set', () => {
    const result = describeVariables(
      {
        AURA_ENVIRONMENT: 'production',
        DATABASE_URL: 'postgres://x',
        MONITORING_ROLE: 'cleanup',
      },
      'cleanup'
    );
    expect(result.ok).toBe(true);
    expect(result.missingRequired).toEqual([]);
  });

  it('treats an empty string as unset', () => {
    const result = describeVariables({ AURA_ENVIRONMENT: 'production', DATABASE_URL: '' }, 'cleanup');
    expect(result.missingRequired).toContain('DATABASE_URL');
  });

  it('never returns a variable value', () => {
    const secret = 'postgres://user:hunter2@host/db';
    const result = describeVariables(
      { AURA_ENVIRONMENT: 'production', DATABASE_URL: secret, MONITORING_ROLE: 'cleanup' },
      'cleanup'
    );
    expect(JSON.stringify(result)).not.toContain('hunter2');
  });
});
