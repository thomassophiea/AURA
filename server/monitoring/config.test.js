import { describe, it, expect } from 'vitest';

import {
  loadMonitoringConfig,
  assertPersistenceReady,
  describeMonitoringConfig,
} from './config.js';

describe('loadMonitoringConfig', () => {
  it('defaults detailed retention to exactly seven days', () => {
    expect(loadMonitoringConfig({}).retentionDays).toBe(7);
  });

  it('makes retention configurable', () => {
    expect(loadMonitoringConfig({ MONITORING_RETENTION_DAYS: '14' }).retentionDays).toBe(14);
  });

  it('rejects a non-integer retention rather than silently rounding', () => {
    expect(() => loadMonitoringConfig({ MONITORING_RETENTION_DAYS: '7.5' })).toThrow(
      /must be an integer/
    );
  });

  it('rejects a zero or negative retention', () => {
    expect(() => loadMonitoringConfig({ MONITORING_RETENTION_DAYS: '0' })).toThrow(/must be >= 1/);
  });

  it('rejects a retention beyond the supported ceiling', () => {
    expect(() => loadMonitoringConfig({ MONITORING_RETENTION_DAYS: '365' })).toThrow(
      /must be <= 90/
    );
  });

  it('parses the documented boolean spellings', () => {
    expect(loadMonitoringConfig({ MONITORING_COLLECTOR_ENABLED: 'false' }).collectorEnabled).toBe(
      false
    );
    expect(loadMonitoringConfig({ MONITORING_COLLECTOR_ENABLED: '0' }).collectorEnabled).toBe(false);
    expect(loadMonitoringConfig({ MONITORING_CLEANUP_ENABLED: 'yes' }).cleanupEnabled).toBe(true);
  });

  it('rejects an unparseable boolean instead of defaulting to false', () => {
    expect(() => loadMonitoringConfig({ MONITORING_COLLECTOR_ENABLED: 'maybe' })).toThrow(
      /must be a boolean/
    );
  });

  it('enables collection and cleanup by default', () => {
    const config = loadMonitoringConfig({});
    expect(config.collectorEnabled).toBe(true);
    expect(config.cleanupEnabled).toBe(true);
  });

  it('keeps the collector out-of-process and AP reports off by default', () => {
    const config = loadMonitoringConfig({});
    expect(config.collectorInProcess).toBe(false);
    expect(config.apReportsEnabled).toBe(false);
  });

  it('refuses to persist client identifiers without a pseudonymization salt', () => {
    expect(() =>
      loadMonitoringConfig({ MONITORING_PERSIST_CLIENT_IDENTIFIERS: 'true' })
    ).toThrow(/PSEUDONYM_SALT/);
  });

  it('allows client identifiers once a salt is supplied', () => {
    const config = loadMonitoringConfig({
      MONITORING_PERSIST_CLIENT_IDENTIFIERS: 'true',
      MONITORING_CLIENT_PSEUDONYM_SALT: 'salty',
    });
    expect(config.persistClientIdentifiers).toBe(true);
  });

  it('rejects a backoff ceiling below the base backoff', () => {
    expect(() =>
      loadMonitoringConfig({
        MONITORING_FAILURE_BACKOFF_SECONDS: '600',
        MONITORING_MAX_BACKOFF_SECONDS: '60',
      })
    ).toThrow(/MAX_BACKOFF/);
  });

  it('returns a frozen object so config cannot drift at runtime', () => {
    const config = loadMonitoringConfig({});
    expect(Object.isFrozen(config)).toBe(true);
  });
});

describe('assertPersistenceReady', () => {
  it('throws when DATABASE_URL is missing, rather than falling back to volatile storage', () => {
    expect(() => assertPersistenceReady(loadMonitoringConfig({}))).toThrow(/DATABASE_URL/);
  });

  it('passes when DATABASE_URL is present', () => {
    const config = loadMonitoringConfig({ DATABASE_URL: 'postgres://localhost/aura' });
    expect(assertPersistenceReady(config)).toBe(true);
  });
});

describe('describeMonitoringConfig', () => {
  it('never exposes secrets', () => {
    const config = loadMonitoringConfig({
      DATABASE_URL: 'postgres://user:hunter2@db.internal/aura',
      MONITORING_CREDENTIAL_KEY: 'c2VjcmV0LWtleQ==',
      MONITORING_CONTROLLER_USERNAME: 'svc-monitor',
      MONITORING_CONTROLLER_PASSWORD: 'hunter2',
    });
    const described = JSON.stringify(describeMonitoringConfig(config));
    expect(described).not.toContain('hunter2');
    expect(described).not.toContain('c2VjcmV0LWtleQ==');
    expect(described).not.toContain('svc-monitor');
    expect(described).not.toContain('db.internal');
  });

  it('reports whether credentials are configured without revealing them', () => {
    const config = loadMonitoringConfig({
      MONITORING_CONTROLLER_USERNAME: 'svc',
      MONITORING_CONTROLLER_PASSWORD: 'pw',
    });
    expect(describeMonitoringConfig(config).defaultControllerCredentialsConfigured).toBe(true);
  });

  it('accepts the CAMPUS_CONTROLLER_USER/PASSWORD aliases already used in deployment', () => {
    const config = loadMonitoringConfig({
      CAMPUS_CONTROLLER_USER: 'admin',
      CAMPUS_CONTROLLER_PASSWORD: 'pw',
    });
    expect(config.defaultControllerUsername).toBe('admin');
    expect(config.defaultControllerPassword).toBe('pw');
  });

  it('prefers the MONITORING_-prefixed names when both are set', () => {
    const config = loadMonitoringConfig({
      MONITORING_CONTROLLER_USERNAME: 'svc-monitor',
      CAMPUS_CONTROLLER_USER: 'admin',
    });
    expect(config.defaultControllerUsername).toBe('svc-monitor');
  });
});
