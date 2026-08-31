/**
 * Database integration tests for the PPSK store.
 *
 * The behaviour under test IS the SQL and the crypto boundary: encryption at
 * rest, the (ssid, keyid) unique constraint, and the enabled/unexpired filter
 * that decides what lands in the AP key file. A mocked client would only assert
 * that we send the strings we send. Requires a real PostgreSQL via
 * TEST_DATABASE_URL; skips loudly otherwise.
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
  createIdentity,
  getIdentity,
  listIdentities,
  updateIdentity,
  deleteIdentity,
  revealPassphrase,
  liveEntriesForSsid,
} from './ppskStore.js';

if (!hasTestDatabase) {
  // eslint-disable-next-line no-console
  console.warn(`[ppskStore.db.test] SKIPPED — ${SKIP_REASON}`);
}

describe.skipIf(!hasTestDatabase)('ppskStore (PostgreSQL)', () => {
  beforeAll(async () => {
    // The store refuses to hold a passphrase it cannot encrypt.
    process.env.PPSK_ENCRYPTION_KEY = 'test-key-with-adequate-entropy-0123456789';
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await query('TRUNCATE ppsk_identities RESTART IDENTITY');
  });

  it('is ready once the schema is applied', async () => {
    expect(await isReady()).toBe(true);
  });

  it('persists an identity and stores the passphrase encrypted, never in clear', async () => {
    const created = await createIdentity({
      name: 'Thomas-Test',
      ssid: 'Aura-PPSK-Lab',
      passphrase: 'Thomas-7284',
      role: 'Employee-Test',
    });
    expect(created.keyid).toBe('Thomas-Test');
    expect(created).not.toHaveProperty('passphrase');

    // The column holds versioned ciphertext, and the plaintext appears nowhere.
    const { rows } = await query('SELECT passphrase_encrypted FROM ppsk_identities WHERE id = $1', [
      created.id,
    ]);
    expect(rows[0].passphrase_encrypted).toMatch(/^v1:/);
    expect(rows[0].passphrase_encrypted).not.toContain('Thomas-7284');

    // …but it round-trips through the audited reveal path.
    expect(await revealPassphrase(created.id)).toBe('Thomas-7284');
  });

  it('enforces one keyid per SSID (unique constraint → 23505)', async () => {
    await createIdentity({ name: 'Dup', ssid: 'S', passphrase: 'abcdefgh' });
    await expect(createIdentity({ name: 'Dup', ssid: 'S', passphrase: 'ijklmnop' })).rejects.toMatchObject({
      code: '23505',
    });
    // The same keyid on a DIFFERENT SSID is fine.
    const other = await createIdentity({ name: 'Dup', ssid: 'OtherSSID', passphrase: 'ijklmnop' });
    expect(other.ssid).toBe('OtherSSID');
  });

  it('rotates the passphrase on update, leaving other fields intact', async () => {
    const created = await createIdentity({ name: 'Rotate', ssid: 'S', passphrase: 'firstpass1', role: 'R1' });
    const updated = await updateIdentity(created.id, { passphrase: 'secondpass2' });
    expect(updated.role).toBe('R1'); // untouched
    expect(await revealPassphrase(created.id)).toBe('secondpass2');
  });

  it('renders only enabled, unexpired entries into the key file, decrypted', async () => {
    await createIdentity({ name: 'Live', ssid: 'Lab', passphrase: 'livepass1', vlanId: 30 });
    const disabled = await createIdentity({ name: 'Off', ssid: 'Lab', passphrase: 'offpass12' });
    await updateIdentity(disabled.id, { enabled: false });
    await createIdentity({
      name: 'Expired',
      ssid: 'Lab',
      passphrase: 'exppass12',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const entries = await liveEntriesForSsid('Lab');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ keyid: 'Live', passphrase: 'livepass1', vlanId: 30 });
  });

  it('lists and deletes', async () => {
    const a = await createIdentity({ name: 'A', ssid: 'S', passphrase: 'aaaaaaaa1' });
    await createIdentity({ name: 'B', ssid: 'S', passphrase: 'bbbbbbbb1' });
    expect(await listIdentities()).toHaveLength(2);
    expect(await listIdentities({ ssid: 'S' })).toHaveLength(2);

    expect(await deleteIdentity(a.id)).toBe(true);
    expect(await getIdentity(a.id)).toBeNull();
    expect(await listIdentities()).toHaveLength(1);
  });
});
