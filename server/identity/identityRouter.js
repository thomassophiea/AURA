/**
 * AURA identity routes: session establishment, whoami, user management, the
 * audit trail, and platform settings (SSO / Cortex enablement).
 *
 * Authentication roots are external. A browser that has just authenticated to
 * the controller exchanges that proof for an AURA session cookie; the cookie
 * then carries the user's AURA role for RBAC on mutating routes. API clients
 * that present only a controller bearer token keep working exactly as before —
 * they hold the controller's own credentials, which is the stronger secret.
 */

import { Router, json as expressJson } from 'express';
import {
  extractBearerToken,
  validateTokenAgainstController,
} from '../monitoring/requireControllerScope.js';
import {
  upsertLogin,
  getUser,
  listUsers,
  updateUser,
  listAudit,
  audit,
  getSetting,
  setSetting,
  roleAtLeast,
  ROLES,
} from './identityStore.js';
import {
  createSessionToken,
  getSession,
  sessionCookieHeader,
  clearSessionCookieHeader,
} from './sessionService.js';

const USERNAME_RE = /^[A-Za-z0-9@._-]{1,128}$/;

/**
 * RBAC middleware for browser-mutating routes.
 *
 * With a session cookie, the cookie's role is enforced (a disabled user or an
 * insufficient role is refused). Without one, a bearer-token caller passes —
 * they authenticated to the controller directly and predate the identity
 * layer (the QA pipeline, curl operators). req.auraActor is set either way so
 * audit entries always name someone.
 */
export function requireRole(minRole) {
  return async (req, res, next) => {
    const session = getSession(req);
    if (!session) {
      // Bearer-token API clients pass (they hold controller credentials, the
      // stronger secret) — but an anonymous caller with neither is refused.
      const bearer = req.headers.authorization ?? '';
      if (!bearer.startsWith('Bearer ') || bearer.length < 10) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      req.auraActor = 'api-client';
      req.auraActorSource = 'bearer';
      return next();
    }
    req.auraActor = session.username;
    req.auraActorSource = session.source;
    // The cookie's role is a snapshot; re-check the store so a demotion or a
    // disable takes effect on the next request, not the next login.
    const user = await getUser(session.username).catch(() => null);
    const role = user?.role ?? session.role;
    if (user?.disabled) {
      return res.status(403).json({ error: 'account disabled' });
    }
    if (!roleAtLeast(role, minRole)) {
      return res.status(403).json({ error: `requires ${minRole} role` });
    }
    return next();
  };
}

/** Map the controller's adminRole claim onto AURA roles. */
function defaultRoleForControllerRole(adminRole) {
  const r = String(adminRole ?? '').toLowerCase();
  if (r.includes('read')) return 'viewer';
  return 'admin';
}

export function createIdentityRouter() {
  const router = Router();
  const jsonBody = expressJson({ limit: '16kb' });

  // POST /auth/session — exchange a fresh controller login for an AURA session.
  router.post('/auth/session', jsonBody, async (req, res) => {
    const token = extractBearerToken(req);
    const controllerUrl = req.headers['x-controller-url'] || process.env.CAMPUS_CONTROLLER_URL;
    const { userId, adminRole } = req.body ?? {};
    if (!token || !controllerUrl) return res.status(401).json({ error: 'Unauthorized' });
    if (typeof userId !== 'string' || !USERNAME_RE.test(userId)) {
      return res.status(400).json({ error: 'invalid userId' });
    }

    const validation = await validateTokenAgainstController(token, controllerUrl);
    if (!validation.valid) {
      return res
        .status(validation.unreachable ? 503 : 401)
        .json({ error: validation.unreachable ? 'controller unreachable' : 'Unauthorized' });
    }

    const user = await upsertLogin({
      username: userId,
      source: 'controller',
      defaultRole: defaultRoleForControllerRole(adminRole),
    });
    if (user.disabled) return res.status(403).json({ error: 'account disabled' });

    const sessionToken = createSessionToken({
      username: user.username,
      role: user.role,
      source: 'controller',
    });
    res.setHeader('Set-Cookie', sessionCookieHeader(sessionToken, req));
    audit('auth.login', { actor: user.username, source: 'controller' });
    res.json({ user: { username: user.username, role: user.role, source: user.source } });
  });

  // GET /auth/me — the current session's identity, or 401.
  router.get('/auth/me', async (req, res) => {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: 'no session' });
    const user = await getUser(session.username).catch(() => null);
    if (user?.disabled) return res.status(403).json({ error: 'account disabled' });
    res.json({
      user: {
        username: session.username,
        role: user?.role ?? session.role,
        source: session.source,
      },
    });
  });

  // POST /auth/logout
  router.post('/auth/logout', (req, res) => {
    const session = getSession(req);
    if (session) audit('auth.logout', { actor: session.username, source: session.source });
    res.setHeader('Set-Cookie', clearSessionCookieHeader(req));
    res.json({ ok: true });
  });

  // ── User management (admin) ──

  router.get('/auth/users', requireRole('admin'), async (_req, res) => {
    res.json({ users: await listUsers(), roles: ROLES });
  });

  router.put('/auth/users/:username', requireRole('admin'), jsonBody, async (req, res) => {
    const { username } = req.params;
    if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'invalid username' });
    const { role, disabled } = req.body ?? {};
    if (role !== undefined && !ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });
    }
    try {
      const user = await updateUser(username, { role, disabled });
      if (!user) return res.status(404).json({ error: 'user not found' });
      audit('user.update', {
        actor: req.auraActor,
        source: req.auraActorSource,
        target: username,
        detail: { role, disabled },
      });
      res.json({ user });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // ── Audit trail (admin) ──

  router.get('/audit', requireRole('admin'), async (req, res) => {
    const limit = Number(req.query.limit) || 100;
    res.json({ entries: await listAudit({ limit, action: req.query.action ?? null }) });
  });

  // ── Platform settings ──

  // Public, secret-free flags the frontend needs before/at login.
  router.get('/settings/public', async (_req, res) => {
    const [sso, cortex] = await Promise.all([getSetting('sso'), getSetting('cortex')]);
    res.json({
      ssoEnabled: Boolean(sso?.enabled && sso?.issuer && sso?.clientId),
      cortexEnabled: Boolean(cortex?.enabled),
    });
  });

  // Admin read — client secret is never echoed back.
  router.get('/settings/identity', requireRole('admin'), async (_req, res) => {
    const [sso, cortex] = await Promise.all([getSetting('sso'), getSetting('cortex')]);
    res.json({
      sso: sso
        ? {
            enabled: Boolean(sso.enabled),
            issuer: sso.issuer ?? '',
            clientId: sso.clientId ?? '',
            defaultRole: sso.defaultRole ?? 'viewer',
            clientSecretSet: Boolean(sso.clientSecret),
          }
        : { enabled: false, issuer: '', clientId: '', defaultRole: 'viewer', clientSecretSet: false },
      cortex: { enabled: Boolean(cortex?.enabled) },
    });
  });

  // Admin write. SSO secret is write-only: omitted/empty keeps the stored one.
  router.put('/settings/identity', requireRole('admin'), jsonBody, async (req, res) => {
    const { sso, cortex } = req.body ?? {};
    if (sso) {
      if (sso.enabled && (!sso.issuer || !sso.clientId)) {
        return res.status(400).json({ error: 'SSO requires an issuer and client ID' });
      }
      if (sso.defaultRole !== undefined && !ROLES.includes(sso.defaultRole)) {
        return res.status(400).json({ error: 'invalid default role' });
      }
      const existing = (await getSetting('sso')) ?? {};
      await setSetting(
        'sso',
        {
          enabled: Boolean(sso.enabled),
          issuer: String(sso.issuer ?? '').trim(),
          clientId: String(sso.clientId ?? '').trim(),
          clientSecret: sso.clientSecret ? String(sso.clientSecret) : (existing.clientSecret ?? ''),
          defaultRole: sso.defaultRole ?? existing.defaultRole ?? 'viewer',
        },
        req.auraActor
      );
      audit('settings.sso', {
        actor: req.auraActor,
        source: req.auraActorSource,
        detail: { enabled: Boolean(sso.enabled), issuer: sso.issuer },
      });
    }
    if (cortex) {
      await setSetting('cortex', { enabled: Boolean(cortex.enabled) }, req.auraActor);
      audit('settings.cortex', {
        actor: req.auraActor,
        source: req.auraActorSource,
        detail: { enabled: Boolean(cortex.enabled) },
      });
    }
    res.json({ ok: true });
  });

  return router;
}
