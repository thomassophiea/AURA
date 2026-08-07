import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  readDatabaseEnvironment,
  assertDatabaseEnvironment,
  describeDatabaseEnvironment,
  EnvironmentMismatchError,
} from './environmentGuard.js';

const STAMPED_AT = new Date('2026-08-07T12:00:00.000Z');

function stampedAs(environment) {
  return vi.fn().mockResolvedValue({
    rows: [{ environment, stamped_at: STAMPED_AT }],
  });
}

function undefinedTable() {
  const error = new Error('relation "environment_identity" does not exist');
  error.code = '42P01';
  return vi.fn().mockRejectedValue(error);
}

let previousEnvironment;

beforeEach(() => {
  previousEnvironment = process.env.AURA_ENVIRONMENT;
});

afterEach(() => {
  if (previousEnvironment === undefined) delete process.env.AURA_ENVIRONMENT;
  else process.env.AURA_ENVIRONMENT = previousEnvironment;
});

describe('readDatabaseEnvironment', () => {
  it('returns the stamp', async () => {
    const result = await readDatabaseEnvironment({ queryFn: stampedAs('production') });
    expect(result).toMatchObject({ stamped: true, environment: 'production' });
  });

  it('reports an un-migrated database rather than throwing', async () => {
    const result = await readDatabaseEnvironment({ queryFn: undefinedTable() });
    expect(result).toMatchObject({ stamped: false, reason: 'not_migrated' });
  });

  it('reports a table that exists but is empty', async () => {
    const queryFn = vi.fn().mockResolvedValue({ rows: [] });
    expect(await readDatabaseEnvironment({ queryFn })).toMatchObject({
      stamped: false,
      reason: 'no_row',
    });
  });

  it('rethrows a real database error instead of calling it "not stamped"', async () => {
    const error = new Error('connection refused');
    error.code = 'ECONNREFUSED';
    await expect(
      readDatabaseEnvironment({ queryFn: vi.fn().mockRejectedValue(error) })
    ).rejects.toThrow('connection refused');
  });
});

describe('assertDatabaseEnvironment', () => {
  it('passes when the stamp matches', async () => {
    process.env.AURA_ENVIRONMENT = 'production';
    await expect(
      assertDatabaseEnvironment({ queryFn: stampedAs('production') })
    ).resolves.toMatchObject({ ok: true, environment: 'production', stamped: true });
  });

  it('throws when a production process is pointed at the integration database', async () => {
    process.env.AURA_ENVIRONMENT = 'production';
    await expect(assertDatabaseEnvironment({ queryFn: stampedAs('integration') })).rejects.toThrow(
      EnvironmentMismatchError
    );
  });

  it('throws when an integration process is pointed at the production database', async () => {
    process.env.AURA_ENVIRONMENT = 'integration';
    const error = await assertDatabaseEnvironment({
      queryFn: stampedAs('production'),
    }).catch((e) => e);
    expect(error).toBeInstanceOf(EnvironmentMismatchError);
    expect(error.expected).toBe('integration');
    expect(error.actual).toBe('production');
    expect(error.message).toMatch(/DATABASE_URL service reference/);
  });

  it('allows an un-migrated database through so migrations can create the stamp', async () => {
    process.env.AURA_ENVIRONMENT = 'production';
    await expect(
      assertDatabaseEnvironment({ queryFn: undefinedTable() })
    ).resolves.toMatchObject({ ok: true, stamped: false });
  });
});

describe('describeDatabaseEnvironment', () => {
  it('reports a mismatch without throwing, so health endpoints keep answering', async () => {
    process.env.AURA_ENVIRONMENT = 'production';
    const result = await describeDatabaseEnvironment({ queryFn: stampedAs('integration') });
    expect(result).toMatchObject({
      declared: 'production',
      databaseEnvironment: 'integration',
      matches: false,
    });
  });

  it('reports an unreachable database as matches:null rather than false', async () => {
    process.env.AURA_ENVIRONMENT = 'production';
    const result = await describeDatabaseEnvironment({
      queryFn: vi.fn().mockRejectedValue(new Error('boom')),
    });
    expect(result.matches).toBeNull();
    expect(result.reason).toBe('unreachable');
  });
});
