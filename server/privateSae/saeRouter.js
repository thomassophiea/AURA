/**
 * /api/v1/private-sae — AURA-owned Private SAE (WPA3-Personal) credentials.
 *
 * Private SAE is PPSK's identity model on the SAE AKM. AURA owns the credential
 * lifecycle here (create, enable/disable, rotate, revoke) and the enrollment loop
 * that binds a station MAC to a credential. Enforcement lives on the Campus OS
 * AP, which selects a per-station SAE password by MAC pre-Commit (hardware
 * evidence — docs/private-sae/PRIVATE_SAE_CAMPUS_OS_REQUIREMENTS.md).
 *
 * Two-plane honesty: the controller's config generator does not YET emit a
 * sae_password set, so `/keyfile` renders exactly what would be pushed and
 * reports `provisioning.supported === false`, and every mutation returns
 * `enforcement {attempted:false, applied:false}`. We never pretend a credential
 * is live on air — the same discipline the PPSK router uses.
 *
 * RBAC: reads require viewer, mutations and passphrase reveal require operator.
 * Passphrases are stored encrypted (ppskCrypto, reused) and only leave the server
 * through the audited reveal path or inside the rendered sae_password file.
 */

import { Router, json as expressJson } from 'express';
import { requireRole as defaultRequireRole } from '../identity/identityRouter.js';
import { audit as defaultAudit, listAudit as defaultListAudit } from '../identity/identityStore.js';
import { sanitizeError } from '../monitoring/errorSanitizer.js';
import { isCryptoConfigured } from '../ppsk/ppskCrypto.js';
import * as defaultStore from './saeStore.js';
import {
  validatePassphrase,
  generatePassphrase,
  renderSaePasswordFile,
  canonicalMac,
  DEFAULT_SSID,
  DEFAULT_AKM,
  VALID_AKMS,
} from './saeCredential.js';

const VALID_SCOPES = new Set(['global', 'site', 'site-group', 'gateway']);
const jsonBody = expressJson({ limit: '16kb' });

// The single honest-enforcement statement returned on every mutation until the
// controller enhancement (R1) ships. Kept in one place so it never drifts.
const UNENFORCED = {
  attempted: false,
  applied: false,
  reason:
    'controller does not yet emit sae_password sets; render keyfile and apply out of band',
};

function actorFrom(req) {
  return {
    actor: req.auraActor ?? 'unknown',
    source: req.auraActorSource ?? 'unknown',
  };
}

/**
 * Validate a create/update body. `partial` (update) makes every field optional
 * but still validates any field that is present. Returns { ok, value | error }.
 * A SAE credential is operational data — no personal fields are accepted.
 */
function validate(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body required' };
  const out = {};
  const need = (present) => (partial ? present : true);

  if (need('name' in body)) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return { ok: false, error: 'name is required' };
    }
    out.name = body.name.trim().slice(0, 128);
  }
  // SSID has a default; only validate a supplied one. On create, fall back to the default.
  if ('ssid' in body && body.ssid != null && body.ssid !== '') {
    if (typeof body.ssid !== 'string' || !body.ssid.trim()) {
      return { ok: false, error: 'ssid must be a non-empty string' };
    }
    out.ssid = body.ssid.trim().slice(0, 32);
  } else if (!partial) {
    out.ssid = DEFAULT_SSID;
  }
  if (need('passphrase' in body)) {
    const reason = validatePassphrase(body.passphrase);
    if (reason) return { ok: false, error: reason };
    out.passphrase = body.passphrase;
  } else if ('passphrase' in body && body.passphrase != null) {
    const reason = validatePassphrase(body.passphrase);
    if (reason) return { ok: false, error: reason };
    out.passphrase = body.passphrase;
  }

  if ('akm' in body && body.akm != null && body.akm !== '') {
    if (!VALID_AKMS.has(body.akm)) return { ok: false, error: `akm must be one of ${[...VALID_AKMS].join(', ')}` };
    out.akm = body.akm;
  } else if (!partial) {
    out.akm = DEFAULT_AKM;
  }

  if ('description' in body) out.description = body.description ? String(body.description).slice(0, 512) : null;
  if ('keyid' in body && body.keyid) out.keyid = String(body.keyid);
  if ('role' in body) out.role = body.role ? String(body.role).slice(0, 128) : null;

  if ('email' in body) {
    const email = body.email ? String(body.email).trim() : '';
    // Optional owner contact; validated loosely (ASCII, one @) — a label, not an
    // auth principal, and never used to send from the server here.
    if (email && (email.length > 254 || !/^[\x21-\x7e]+@[\x21-\x7e]+\.[\x21-\x7e]+$/.test(email))) {
      return { ok: false, error: 'email is not a valid address' };
    }
    out.email = email || null;
  }
  if ('usage' in body && body.usage != null) {
    if (body.usage !== 'multi' && body.usage !== 'single') {
      return { ok: false, error: "usage must be 'multi' or 'single'" };
    }
    out.usage = body.usage;
  }
  if ('notify' in body) out.notify = Boolean(body.notify);
  if ('storeLocally' in body) out.storeLocally = Boolean(body.storeLocally);

  if ('vlanId' in body && body.vlanId != null && body.vlanId !== '') {
    const v = Number(body.vlanId);
    if (!Number.isInteger(v) || v < 1 || v > 4094) return { ok: false, error: 'vlanId must be 1–4094' };
    out.vlanId = v;
  } else if ('vlanId' in body) {
    out.vlanId = null;
  }

  if ('scope' in body && body.scope) {
    if (!VALID_SCOPES.has(body.scope)) return { ok: false, error: `scope must be one of ${[...VALID_SCOPES].join(', ')}` };
    out.scope = body.scope;
  }
  if ('scopeRef' in body) out.scopeRef = body.scopeRef ? String(body.scopeRef) : null;
  if ('enabled' in body) out.enabled = Boolean(body.enabled);

  if ('expiresAt' in body && body.expiresAt) {
    const t = new Date(body.expiresAt);
    if (Number.isNaN(t.getTime())) return { ok: false, error: 'expiresAt must be a valid date' };
    out.expiresAt = t.toISOString();
  } else if ('expiresAt' in body) {
    out.expiresAt = null;
  }

  if ('maxDevices' in body && body.maxDevices != null && body.maxDevices !== '') {
    const m = Number(body.maxDevices);
    if (!Number.isInteger(m) || m < 1) return { ok: false, error: 'maxDevices must be a positive integer' };
    out.maxDevices = m;
  } else if ('maxDevices' in body) {
    out.maxDevices = null;
  }

  return { ok: true, value: out };
}

/** Map a store/DB error to an HTTP response, keeping internal detail server-side. */
function fail(res, error, endpoint) {
  if (error && error.code === '23505') {
    return res.status(409).json({ error: 'a credential with that identity already exists on this SSID', code: 'DUPLICATE_KEYID' });
  }
  const sanitized = sanitizeError(error, { endpoint });
  console.warn(`[PrivateSAE] ${endpoint} failed: ${error?.message}`);
  return res.status(500).json({ error: 'internal error', ...sanitized });
}

export function createPrivateSaeRouter({
  store = defaultStore,
  requireRole = defaultRequireRole,
  audit = defaultAudit,
  listAudit = defaultListAudit,
  cryptoConfigured = isCryptoConfigured,
  // Accepted for parity with the guests/PPSK injectable pattern; the wireless
  // plane is not yet driven, so these are intentionally unused for now.
  pool = null, // eslint-disable-line no-unused-vars
  encryptor = null, // eslint-disable-line no-unused-vars
  controllerClient = null, // eslint-disable-line no-unused-vars
} = {}) {
  const router = Router();

  // Persistence gate: everything 503s when the store is unavailable, rather
  // than surfacing a 500 on every poll.
  async function requireStore(res) {
    if (!(await store.isReady())) {
      res.status(503).json({ error: 'persistence unavailable', code: 'PERSISTENCE_UNAVAILABLE' });
      return false;
    }
    return true;
  }

  // Secret gate: writing or revealing a passphrase needs the encryption key.
  function requireCrypto(res) {
    if (!cryptoConfigured()) {
      res.status(501).json({
        error: 'Private SAE passphrase encryption is not configured',
        code: 'NOT_CONFIGURED',
        detail: 'Set PPSK_ENCRYPTION_KEY to enable creating and revealing credentials.',
      });
      return false;
    }
    return true;
  }

  // ── List ──
  router.get('/v1/private-sae', requireRole('viewer'), async (req, res) => {
    try {
      const ssid = typeof req.query.ssid === 'string' ? req.query.ssid : null;
      const items = await store.listCredentials({ ssid });
      if (items === null) return res.status(503).json({ error: 'persistence unavailable', code: 'PERSISTENCE_UNAVAILABLE' });
      res.json({ credentials: items, encryptionConfigured: cryptoConfigured() });
    } catch (error) {
      fail(res, error, '/v1/private-sae');
    }
  });

  // ── Generate a candidate passphrase (no persistence) ──
  router.post('/v1/private-sae/generate', requireRole('operator'), jsonBody, (req, res) => {
    const length = Number(req.body?.length) || 24;
    res.json({ passphrase: generatePassphrase(length) });
  });

  // ── Audit trail (Private SAE actions only) ──
  router.get('/v1/private-sae/audit', requireRole('operator'), async (req, res) => {
    try {
      const limit = Math.min(Math.max(1, Number(req.query.limit) || 200), 500);
      const all = await listAudit({ limit: 500 });
      const entries = all.filter((e) => typeof e.action === 'string' && e.action.startsWith('sae.')).slice(0, limit);
      res.json({ entries });
    } catch (error) {
      fail(res, error, '/v1/private-sae/audit');
    }
  });

  // ── Render the sae_password file for an SSID (the provisioning artifact) ──
  router.get('/v1/private-sae/keyfile', requireRole('operator'), async (req, res) => {
    if (!(await requireStore(res))) return;
    if (!requireCrypto(res)) return;
    const ssid = typeof req.query.ssid === 'string' ? req.query.ssid.trim() : '';
    if (!ssid) return res.status(400).json({ error: 'ssid query parameter is required' });
    try {
      const entries = await store.liveEntriesForSsid(ssid);
      if (entries === null) return res.status(503).json({ error: 'persistence unavailable' });
      audit('sae.keyfile.render', { ...actorFrom(req), target: ssid, detail: { entryCount: entries.length } });
      res.json({
        ssid,
        entryCount: entries.length,
        content: renderSaePasswordFile(entries),
        // Two-plane honesty: AURA can render the file, but the Campus OS
        // controller does not yet accept it. Never claim otherwise.
        provisioning: {
          supported: false,
          reason:
            'Campus OS controller does not yet emit a sae_password set; apply out of band until the controller enhancement (R1) ships.',
        },
      });
    } catch (error) {
      fail(res, error, '/v1/private-sae/keyfile');
    }
  });

  // ── Get one ──
  router.get('/v1/private-sae/:id', requireRole('viewer'), async (req, res) => {
    try {
      const item = await store.getCredential(req.params.id);
      if (item === null && !(await store.isReady())) {
        return res.status(503).json({ error: 'persistence unavailable' });
      }
      if (!item) return res.status(404).json({ error: 'not found' });
      res.json(item);
    } catch (error) {
      fail(res, error, '/v1/private-sae/:id');
    }
  });

  // ── Reveal the passphrase (audited, operator-only) ──
  router.get('/v1/private-sae/:id/reveal', requireRole('operator'), async (req, res) => {
    if (!(await requireStore(res))) return;
    if (!requireCrypto(res)) return;
    try {
      const item = await store.getCredential(req.params.id);
      if (!item) return res.status(404).json({ error: 'not found' });
      const passphrase = await store.revealPassphrase(req.params.id);
      audit('sae.reveal', { ...actorFrom(req), target: item.keyid, detail: { id: item.id, ssid: item.ssid } });
      res.json({ id: item.id, keyid: item.keyid, passphrase });
    } catch (error) {
      fail(res, error, '/v1/private-sae/:id/reveal');
    }
  });

  // ── List bindings for a credential ──
  router.get('/v1/private-sae/:id/bindings', requireRole('viewer'), async (req, res) => {
    if (!(await requireStore(res))) return;
    try {
      const item = await store.getCredential(req.params.id);
      if (!item) return res.status(404).json({ error: 'not found' });
      const bindings = await store.listBindings(req.params.id);
      res.json({ credentialId: item.id, keyid: item.keyid, bindings: bindings ?? [] });
    } catch (error) {
      fail(res, error, '/v1/private-sae/:id/bindings');
    }
  });

  // ── Create ──
  router.post('/v1/private-sae', requireRole('operator'), jsonBody, async (req, res) => {
    if (!(await requireStore(res))) return;
    if (!requireCrypto(res)) return;
    const { ok, value, error } = validate(req.body);
    if (!ok) return res.status(400).json({ error });
    try {
      const { actor } = actorFrom(req);
      const created = await store.createCredential({ ...value, createdBy: actor });
      if (!created) return res.status(503).json({ error: 'persistence unavailable' });
      audit('sae.create', { ...actorFrom(req), target: created.keyid, detail: { id: created.id, ssid: created.ssid, akm: created.akm, role: created.role, vlanId: created.vlanId } });
      res.status(201).json({ ...created, enforcement: UNENFORCED });
    } catch (error) {
      fail(res, error, '/v1/private-sae');
    }
  });

  // ── Update / rotate ──
  router.put('/v1/private-sae/:id', requireRole('operator'), jsonBody, async (req, res) => {
    if (!(await requireStore(res))) return;
    // A rotate (new passphrase) needs the encryption key; a metadata-only edit does not.
    if ('passphrase' in (req.body ?? {}) && req.body.passphrase != null && !requireCrypto(res)) return;
    const { ok, value, error } = validate(req.body, { partial: true });
    if (!ok) return res.status(400).json({ error });
    try {
      const updated = await store.updateCredential(req.params.id, value);
      if (!updated) return res.status(404).json({ error: 'not found' });
      audit('sae.update', { ...actorFrom(req), target: updated.keyid, detail: { id: updated.id, rotated: 'passphrase' in value, fields: Object.keys(value) } });
      res.json({ ...updated, enforcement: UNENFORCED });
    } catch (error) {
      fail(res, error, '/v1/private-sae/:id');
    }
  });

  // ── Enable / disable (revocation is a disable, applied on next reload) ──
  for (const [verb, enabled] of [['enable', true], ['disable', false]]) {
    router.post(`/v1/private-sae/:id/${verb}`, requireRole('operator'), async (req, res) => {
      if (!(await requireStore(res))) return;
      try {
        const updated = await store.updateCredential(req.params.id, { enabled });
        if (!updated) return res.status(404).json({ error: 'not found' });
        audit(`sae.${verb}`, { ...actorFrom(req), target: updated.keyid, detail: { id: updated.id, ssid: updated.ssid } });
        res.json({ credential: updated, enforcement: UNENFORCED });
      } catch (error) {
        fail(res, error, `/v1/private-sae/:id/${verb}`);
      }
    });
  }

  // ── Enroll: bind a station MAC to a credential (the enrollment loop) ──
  router.post('/v1/private-sae/:id/enroll', requireRole('operator'), jsonBody, async (req, res) => {
    if (!(await requireStore(res))) return;
    const mac = canonicalMac(req.body?.mac);
    if (!mac) return res.status(400).json({ error: 'mac is required (AA:BB:CC:DD:EE:FF)' });
    try {
      const item = await store.getCredential(req.params.id);
      if (!item) return res.status(404).json({ error: 'not found' });

      // Device-count ceiling: enrolling a *new* MAC past maxDevices is refused.
      // Re-enrolling an already-bound MAC is idempotent and always allowed.
      if (item.maxDevices != null) {
        const existing = await store.listBindings(req.params.id);
        const alreadyBound = (existing ?? []).some((b) => b.mac === mac);
        if (!alreadyBound && (existing ?? []).length >= item.maxDevices) {
          return res.status(409).json({
            error: `credential already has its maximum of ${item.maxDevices} device${item.maxDevices === 1 ? '' : 's'} enrolled`,
            code: 'MAX_DEVICES',
          });
        }
      }

      const result = await store.upsertBinding(req.params.id, mac);
      if (result === null) return res.status(503).json({ error: 'persistence unavailable' });
      audit('sae.enroll', { ...actorFrom(req), target: item.keyid, detail: { id: item.id, mac, created: result.created } });
      res.status(result.created ? 201 : 200).json({
        credentialId: item.id,
        keyid: item.keyid,
        binding: result.binding,
        enforcement: UNENFORCED,
      });
    } catch (error) {
      if (error && error.code === 'INVALID_MAC') return res.status(400).json({ error: 'mac is not a valid MAC address' });
      fail(res, error, '/v1/private-sae/:id/enroll');
    }
  });

  // ── Revoke one MAC binding ──
  router.delete('/v1/private-sae/:id/bindings/:mac', requireRole('operator'), async (req, res) => {
    if (!(await requireStore(res))) return;
    try {
      const item = await store.getCredential(req.params.id);
      if (!item) return res.status(404).json({ error: 'not found' });
      const removed = await store.deleteBinding(req.params.id, req.params.mac);
      if (!removed) return res.status(404).json({ error: 'binding not found' });
      audit('sae.revoke-binding', { ...actorFrom(req), target: item.keyid, detail: { id: item.id, mac: canonicalMac(req.params.mac) } });
      res.json({ outcome: 'REVOKED', credentialId: item.id, mac: canonicalMac(req.params.mac), enforcement: UNENFORCED });
    } catch (error) {
      fail(res, error, '/v1/private-sae/:id/bindings/:mac');
    }
  });

  // ── Delete ──
  router.delete('/v1/private-sae/:id', requireRole('operator'), async (req, res) => {
    if (!(await requireStore(res))) return;
    try {
      const item = await store.getCredential(req.params.id);
      if (!item) return res.status(404).json({ error: 'not found' });
      await store.deleteCredential(req.params.id);
      audit('sae.delete', { ...actorFrom(req), target: item.keyid, detail: { id: item.id, ssid: item.ssid } });
      res.json({ outcome: 'DELETED', credential: item, enforcement: UNENFORCED });
    } catch (error) {
      fail(res, error, '/v1/private-sae/:id');
    }
  });

  return router;
}
