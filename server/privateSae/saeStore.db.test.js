/**
 * Database integration tests for the Private SAE store.
 *
 * The behaviour under test IS the SQL and the crypto boundary: encryption at
 * rest, the (ssid, keyid) unique constraint, the enabled/unexpired filter that
 * decides what lands in the AP sae_password file, and the binding cascade-delete.
 * A mocked client would only assert that we send the strings we send. Requires a
 * real PostgreSQL via TEST_DATABASE_URL; skips loudly otherwise.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  hasTestDatabase,
  SKIP_REASON,
  setupTestDatabase,
  teardownTestDatabase,
} from '../monitoring/testSupport/dbHarness.js';
import { query } from '../db/pool.js';
import {
  isReady,
  createCredential,
  getCredential,
  listCredentials,
  updateCredential,
  deleteCredential,
  revealPassphrase,
  liveEntriesForSsid,
  upsertBinding,
  listBindings,
  deleteBinding,
} from './saeStore.js';

const PASS_A = 'zephyr-quill-cobalt-01'; // 22 chars — meets the SAE minimum
const PASS_B = 'miner-basalt-onyx-slate'; // 23 chars

if (!hasTestDatabase) {
  console.warn(`[saeStore.db.test] SKIPPED — ${SKIP_REASON}`);
}

describe.skipIf(!hasTestDatabase)('saeStore (PostgreSQL)', () => {
  beforeAll(async () => {
    // The store refuses to hold a passphrase it cannot encrypt.
    process.env.PPSK_ENCRYPTION_KEY = 'test-key-with-adequate-entropy-0123456789';
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    // Bindings cascade from credentials; truncating both keeps each test clean.
    await query('TRUNCATE private_sae_bindings, private_sae_credentials RESTART IDENTITY CASCADE');
  });

  it('is ready once the schema is applied', async () => {
    expect(await isReady()).toBe(true);
  });

  it('defaults SSID and AKM, and stores the passphrase encrypted, never in clear', async () => {
    const created = await createCredential({ name: 'Thomas-Test', passphrase: PASS_A, role: 'Employee-Test' });
    expect(created.keyid).toBe('Thomas-Test');
    expect(created.ssid).toBe('AURA_PSAE');
    expect(created.akm).toBe('wpa3-sae');
    expect(created).not.toHaveProperty('passphrase');

    const { rows } = await query('SELECT passphrase_encrypted FROM private_sae_credentials WHERE id = $1', [created.id]);
    expect(rows[0].passphrase_encrypted).toMatch(/^v1:/);
    expect(rows[0].passphrase_encrypted).not.toContain(PASS_A);

    expect(await revealPassphrase(created.id)).toBe(PASS_A);
  });

  it('enforces one keyid per SSID (unique constraint → 23505)', async () => {
    await createCredential({ name: 'Dup', ssid: 'S', passphrase: PASS_A });
    await expect(createCredential({ name: 'Dup', ssid: 'S', passphrase: PASS_B })).rejects.toMatchObject({
      code: '23505',
    });
    const other = await createCredential({ name: 'Dup', ssid: 'OtherSSID', passphrase: PASS_B });
    expect(other.ssid).toBe('OtherSSID');
  });

  it('rotates the passphrase on update, leaving other fields intact', async () => {
    const created = await createCredential({ name: 'Rotate', ssid: 'S', passphrase: PASS_A, role: 'R1' });
    const updated = await updateCredential(created.id, { passphrase: PASS_B });
    expect(updated.role).toBe('R1');
    expect(await revealPassphrase(created.id)).toBe(PASS_B);
  });

  it('renders only enabled, unexpired credentials, with bound MACs and vlan', async () => {
    const live = await createCredential({ name: 'Live', ssid: 'Lab', passphrase: PASS_A, vlanId: 30 });
    await upsertBinding(live.id, 'A4:83:E7:2C:19:D0');
    await upsertBinding(live.id, 'B4:83:E7:2C:19:D1');

    const disabled = await createCredential({ name: 'Off', ssid: 'Lab', passphrase: PASS_B });
    await updateCredential(disabled.id, { enabled: false });
    await createCredential({
      name: 'Expired',
      ssid: 'Lab',
      passphrase: 'expired-value-onyx-1234',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const entries = await liveEntriesForSsid('Lab');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ keyid: 'Live', passphrase: PASS_A, vlanId: 30 });
    expect([...entries[0].macs].sort()).toEqual(['a4:83:e7:2c:19:d0', 'b4:83:e7:2c:19:d1']);
  });

  it('upserts a binding idempotently and counts it on the credential', async () => {
    const c = await createCredential({ name: 'Bind', ssid: 'S', passphrase: PASS_A });
    const first = await upsertBinding(c.id, 'A4:83:E7:2C:19:D0');
    expect(first.created).toBe(true);
    const again = await upsertBinding(c.id, 'a4-83-e7-2c-19-d0'); // same MAC, different formatting
    expect(again.created).toBe(false);
    expect(await listBindings(c.id)).toHaveLength(1);
    expect((await getCredential(c.id)).bindingCount).toBe(1);
  });

  it('cascade-deletes bindings when a credential is deleted', async () => {
    const c = await createCredential({ name: 'Cascade', ssid: 'S', passphrase: PASS_A });
    await upsertBinding(c.id, 'A4:83:E7:2C:19:D0');
    await upsertBinding(c.id, 'B4:83:E7:2C:19:D1');
    expect(await deleteCredential(c.id)).toBe(true);
    const { rows } = await query('SELECT count(*)::int AS n FROM private_sae_bindings');
    expect(rows[0].n).toBe(0);
  });

  it('revokes a single binding', async () => {
    const c = await createCredential({ name: 'Revoke', ssid: 'S', passphrase: PASS_A });
    await upsertBinding(c.id, 'A4:83:E7:2C:19:D0');
    await upsertBinding(c.id, 'B4:83:E7:2C:19:D1');
    expect(await deleteBinding(c.id, 'A4:83:E7:2C:19:D0')).toBe(true);
    expect(await listBindings(c.id)).toHaveLength(1);
  });

  it('lists and deletes credentials', async () => {
    const a = await createCredential({ name: 'A', ssid: 'S', passphrase: PASS_A });
    await createCredential({ name: 'B', ssid: 'S', passphrase: PASS_B });
    expect(await listCredentials()).toHaveLength(2);
    expect(await listCredentials({ ssid: 'S' })).toHaveLength(2);

    expect(await deleteCredential(a.id)).toBe(true);
    expect(await getCredential(a.id)).toBeNull();
    expect(await listCredentials()).toHaveLength(1);
  });
});
