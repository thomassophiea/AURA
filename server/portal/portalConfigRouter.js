/**
 * /api/v1/portal-config — the Cloud Captive Portal's operator configuration.
 *
 * AURA owns none of this data: the portal's `PortalConfig` row is authoritative
 * and the portal validates every value (sponsor domains, addresses, TTLs,
 * guest-field ids) server-side. This router only authenticates the operator —
 * the same gateway-scoped policy the guest routes use, because sponsorship
 * configuration decides who can grant network access — and relays.
 */

import { Router, json as expressJson } from 'express';

import { createRequireGatewayAuth } from '../guests/guestsRouter.js';
import { sanitizeError } from '../monitoring/errorSanitizer.js';
import {
  loadCwpConfig,
  getPortalConfig as cwpGetPortalConfig,
  updatePortalConfig as cwpUpdatePortalConfig,
  uploadPortalImage as cwpUploadPortalImage,
  clearPortalImage as cwpClearPortalImage,
  CwpRequestError,
  CwpUnavailableError,
} from '../guests/cwpClient.js';

/** Operator identity for the portal's audit trail, when the caller names one. */
function actorFrom(req) {
  const header = req.headers['x-aura-user'];
  return typeof header === 'string' && header.trim() ? header.trim().slice(0, 128) : null;
}

function respondToCwpError(res, error) {
  if (error instanceof CwpUnavailableError) {
    return res.status(503).json({
      error: 'Guest portal service unavailable',
      detail:
        'AURA could not reach the captive portal service that owns this configuration.',
    });
  }
  if (error instanceof CwpRequestError) {
    return res.status(error.status).json({
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.body?.details ? { details: error.body.details } : {}),
    });
  }
  const { errorClass } = sanitizeError(error);
  return res.status(500).json({ error: 'Portal configuration request failed', errorClass });
}

export function createPortalConfigRouter({
  requireAuthFn = null,
  cwp = {
    get: cwpGetPortalConfig,
    update: cwpUpdatePortalConfig,
    uploadImage: cwpUploadPortalImage,
    clearImage: cwpClearPortalImage,
  },
  configFn = loadCwpConfig,
  fetchFn = null,
} = {}) {
  const router = Router();
  const jsonBody = expressJson({ limit: '16kb' });
  // The background image alone is allowed up to 5 MB of real bytes on the
  // portal side; base64 inflates that by ~1/3, plus the small JSON
  // envelope around it — 8 MB covers both fields with headroom.
  const imageJsonBody = expressJson({ limit: '8mb' });
  const requireGatewayAuth = requireAuthFn ?? createRequireGatewayAuth({ fetchFn });

  router.use('/v1/portal-config', requireGatewayAuth);

  function ensureConfigured(res) {
    const config = configFn();
    if (!config.configured) {
      res.status(501).json({
        error: 'Cloud Captive Portal is not connected',
        detail:
          'CWP_INTERNAL_API_URL and CWP_INTERNAL_API_TOKEN must point at the captive portal service.',
        code: 'NOT_CONFIGURED',
      });
      return null;
    }
    return config;
  }

  router.get('/v1/portal-config', async (req, res) => {
    const config = ensureConfigured(res);
    if (!config) return undefined;
    try {
      return res.json(await cwp.get({ config }));
    } catch (error) {
      return respondToCwpError(res, error);
    }
  });

  router.put('/v1/portal-config', jsonBody, async (req, res) => {
    const config = ensureConfigured(res);
    if (!config) return undefined;
    if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Body must be a JSON object' });
    }
    try {
      return res.json(await cwp.update(req.body, { config, actor: actorFrom(req) }));
    } catch (error) {
      return respondToCwpError(res, error);
    }
  });

  router.put('/v1/portal-config/:kind(logo|background)', imageJsonBody, async (req, res) => {
    const config = ensureConfigured(res);
    if (!config) return undefined;
    if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Body must be a JSON object' });
    }
    try {
      return res.json(
        await cwp.uploadImage(req.params.kind, req.body, { config, actor: actorFrom(req) })
      );
    } catch (error) {
      return respondToCwpError(res, error);
    }
  });

  router.delete('/v1/portal-config/:kind(logo|background)', async (req, res) => {
    const config = ensureConfigured(res);
    if (!config) return undefined;
    try {
      return res.json(await cwp.clearImage(req.params.kind, { config, actor: actorFrom(req) }));
    } catch (error) {
      return respondToCwpError(res, error);
    }
  });

  return router;
}
