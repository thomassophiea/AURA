/**
 * /api/v1/ppsk — AURA-owned PPSK / MPSK identities for WPA2-Personal WLANs.
 *
 * AURA owns the identity lifecycle here (create, enable/disable, rotate,
 * revoke). Enforcement lives on the Campus OS AP, which resolves identity by
 * matching the key against the 4-way-handshake MIC in a wpa_psk_file and tags
 * the station with the matched `keyid` — proven on real hardware
 * (docs/PPSK_HARDWARE_FINDINGS.md).
 *
 * Two-plane honesty: the controller's config generator does not YET emit the
 * key file, so `/keyfile` renders exactly what would be pushed and reports
 * `provisioning.supported === false` with the reason. We never pretend a key is
 * live on the gateway when it is not — the same discipline the guests router
 * uses for gateway enforcement.
 *
 * RBAC: reads require viewer, mutations and passphrase reveal require operator,
 * validated the same way as the rest of the identity layer. Passphrases are
 * stored encrypted and only leave the server through the audited reveal path.
 */

import { Router, json as expressJson } from 'express';
import { requireRole as defaultRequireRole } from '../identity/identityRouter.js';
import { audit as defaultAudit } from '../identity/identityStore.js';
import { sanitizeError } from '../monitoring/errorSanitizer.js';
import { isCryptoConfigured } from './ppskCrypto.js';
import * as defaultStore from './ppskStore.js';
import { validatePassphrase, generatePassphrase, renderPskFile } from './pmk.js';

const VALID_SCOPES = new Set(['global', 'site', 'site-group', 'gateway']);
const jsonBody = expressJson({ limit: '16kb' });

function actorFrom(req) {
  return {
    actor: req.auraActor ?? 'unknown',
    source: req.auraActorSource ?? 'unknown',
  };
}

/**
 * Validate a create/update body. `partial` (update) makes every field optional
 * but still validates any field that is present. Returns { ok, value | error }.
 * A PPSK identity is operational data — no personal fields are accepted.
 */
function validate(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body required' };
  const out = {};

  const need = (field, present) => (partial ? present : true);

  if (need('name', 'name' in body)) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return { ok: false, error: 'name is required' };
    }
    out.name = body.name.trim().slice(0, 128);
  }
  if (need('ssid', 'ssid' in body)) {
    if (typeof body.ssid !== 'string' || !body.ssid.trim()) {
      return { ok: false, error: 'ssid is required' };
    }
    out.ssid = body.ssid.trim().slice(0, 32);
  }
  if (need('passphrase', 'passphrase' in body)) {
    const reason = validatePassphrase(body.passphrase);
    if (reason) return { ok: false, error: reason };
    out.passphrase = body.passphrase;
  } else if ('passphrase' in body && body.passphrase != null) {
    const reason = validatePassphrase(body.passphrase);
    if (reason) return { ok: false, error: reason };
    out.passphrase = body.passphrase;
  }

  if ('description' in body) out.description = body.description ? String(body.description).slice(0, 512) : null;
  if ('keyid' in body && body.keyid) out.keyid = String(body.keyid);
  if ('role' in body) out.role = body.role ? String(body.role).slice(0, 128) : null;

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
    return res.status(409).json({ error: 'a key with that identity already exists on this SSID', code: 'DUPLICATE_KEYID' });
  }
  const sanitized = sanitizeError(error, { endpoint });
  console.warn(`[PPSK] ${endpoint} failed: ${error?.message}`);
  return res.status(500).json({ error: 'internal error', ...sanitized });
}

export function createPpskRouter({
  store = defaultStore,
  requireRole = defaultRequireRole,
  audit = defaultAudit,
  cryptoConfigured = isCryptoConfigured,
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
        error: 'PPSK passphrase encryption is not configured',
        code: 'NOT_CONFIGURED',
        detail: 'Set PPSK_ENCRYPTION_KEY to enable creating and revealing keys.',
      });
      return false;
    }
    return true;
  }

  // ── List ──
  router.get('/v1/ppsk', requireRole('viewer'), async (req, res) => {
    try {
      const ssid = typeof req.query.ssid === 'string' ? req.query.ssid : null;
      const items = await store.listIdentities({ ssid });
      if (items === null) return res.status(503).json({ error: 'persistence unavailable', code: 'PERSISTENCE_UNAVAILABLE' });
      res.json({ identities: items, encryptionConfigured: cryptoConfigured() });
    } catch (error) {
      fail(res, error, '/v1/ppsk');
    }
  });

  // ── Generate a candidate passphrase (no persistence) ──
  router.post('/v1/ppsk/generate', requireRole('operator'), jsonBody, (req, res) => {
    const length = Number(req.body?.length) || 16;
    res.json({ passphrase: generatePassphrase(length) });
  });

  // ── Render the wpa_psk_file for an SSID (the provisioning artifact) ──
  router.get('/v1/ppsk/keyfile', requireRole('operator'), async (req, res) => {
    if (!(await requireStore(res))) return;
    if (!requireCrypto(res)) return;
    const ssid = typeof req.query.ssid === 'string' ? req.query.ssid.trim() : '';
    if (!ssid) return res.status(400).json({ error: 'ssid query parameter is required' });
    try {
      const entries = await store.liveEntriesForSsid(ssid);
      if (entries === null) return res.status(503).json({ error: 'persistence unavailable' });
      audit('ppsk.keyfile.render', { ...actorFrom(req), target: ssid, detail: { entryCount: entries.length } });
      res.json({
        ssid,
        entryCount: entries.length,
        content: renderPskFile(entries),
        // Two-plane honesty: AURA can render the file, but the Campus OS
        // controller does not yet accept it. Never claim otherwise.
        provisioning: {
          supported: false,
          reason:
            'Campus OS controller does not yet emit wpa_psk_file; apply out of band until the controller enhancement ships.',
        },
      });
    } catch (error) {
      fail(res, error, '/v1/ppsk/keyfile');
    }
  });

  // ── Get one ──
  router.get('/v1/ppsk/:id', requireRole('viewer'), async (req, res) => {
    try {
      const item = await store.getIdentity(req.params.id);
      if (item === null && !(await store.isReady())) {
        return res.status(503).json({ error: 'persistence unavailable' });
      }
      if (!item) return res.status(404).json({ error: 'not found' });
      res.json(item);
    } catch (error) {
      fail(res, error, '/v1/ppsk/:id');
    }
  });

  // ── Reveal the passphrase (audited, operator-only) ──
  router.get('/v1/ppsk/:id/reveal', requireRole('operator'), async (req, res) => {
    if (!(await requireStore(res))) return;
    if (!requireCrypto(res)) return;
    try {
      const item = await store.getIdentity(req.params.id);
      if (!item) return res.status(404).json({ error: 'not found' });
      const passphrase = await store.revealPassphrase(req.params.id);
      audit('ppsk.reveal', { ...actorFrom(req), target: item.keyid, detail: { id: item.id, ssid: item.ssid } });
      res.json({ id: item.id, keyid: item.keyid, passphrase });
    } catch (error) {
      fail(res, error, '/v1/ppsk/:id/reveal');
    }
  });

  // ── Create ──
  router.post('/v1/ppsk', requireRole('operator'), jsonBody, async (req, res) => {
    if (!(await requireStore(res))) return;
    if (!requireCrypto(res)) return;
    const { ok, value, error } = validate(req.body);
    if (!ok) return res.status(400).json({ error });
    try {
      const { actor } = actorFrom(req);
      const created = await store.createIdentity({ ...value, createdBy: actor });
      if (!created) return res.status(503).json({ error: 'persistence unavailable' });
      audit('ppsk.create', { ...actorFrom(req), target: created.keyid, detail: { id: created.id, ssid: created.ssid, role: created.role, vlanId: created.vlanId } });
      res.status(201).json(created);
    } catch (error) {
      fail(res, error, '/v1/ppsk');
    }
  });

  // ── Update / rotate ──
  router.put('/v1/ppsk/:id', requireRole('operator'), jsonBody, async (req, res) => {
    if (!(await requireStore(res))) return;
    // A rotate (new passphrase) needs the encryption key; a metadata-only edit does not.
    if ('passphrase' in (req.body ?? {}) && req.body.passphrase != null && !requireCrypto(res)) return;
    const { ok, value, error } = validate(req.body, { partial: true });
    if (!ok) return res.status(400).json({ error });
    try {
      const updated = await store.updateIdentity(req.params.id, value);
      if (!updated) return res.status(404).json({ error: 'not found' });
      audit('ppsk.update', { ...actorFrom(req), target: updated.keyid, detail: { id: updated.id, rotated: 'passphrase' in value, fields: Object.keys(value) } });
      res.json(updated);
    } catch (error) {
      fail(res, error, '/v1/ppsk/:id');
    }
  });

  // ── Enable / disable (revocation is a disable, applied on next reload) ──
  for (const [verb, enabled] of [['enable', true], ['disable', false]]) {
    router.post(`/v1/ppsk/:id/${verb}`, requireRole('operator'), async (req, res) => {
      if (!(await requireStore(res))) return;
      try {
        const updated = await store.updateIdentity(req.params.id, { enabled });
        if (!updated) return res.status(404).json({ error: 'not found' });
        audit(`ppsk.${verb}`, { ...actorFrom(req), target: updated.keyid, detail: { id: updated.id, ssid: updated.ssid } });
        // Honest about enforcement: the AP still holds the old key file until the
        // controller re-renders and reloads. Say so.
        res.json({
          identity: updated,
          enforcement: {
            attempted: false,
            applied: false,
            reason: 'Key file re-render + AP reload is not yet driven by the controller; change takes effect on next provisioning.',
          },
        });
      } catch (error) {
        fail(res, error, `/v1/ppsk/:id/${verb}`);
      }
    });
  }

  // ── Delete ──
  router.delete('/v1/ppsk/:id', requireRole('operator'), async (req, res) => {
    if (!(await requireStore(res))) return;
    try {
      const item = await store.getIdentity(req.params.id);
      if (!item) return res.status(404).json({ error: 'not found' });
      await store.deleteIdentity(req.params.id);
      audit('ppsk.delete', { ...actorFrom(req), target: item.keyid, detail: { id: item.id, ssid: item.ssid } });
      res.json({
        outcome: 'DELETED',
        identity: item,
        enforcement: {
          attempted: false,
          applied: false,
          reason: 'A deleted key stops authenticating only after the AP reloads its key file; connected clients persist until then.',
        },
      });
    } catch (error) {
      fail(res, error, '/v1/ppsk/:id');
    }
  });

  return router;
}
