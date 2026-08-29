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
 * insufficient role is refused). Without one, a bearer-token caller passes
 * ONLY after the token is validated against the controller (cached, with the
 * monitoring layer's grace window) — holding a live controller token is the
 * stronger secret, but a merely Bearer-shaped string is refused.
 * req.auraActor is set either way so audit entries always name someone.
 */
export function requireRole(minRole) {
  return async (req, res, next) => {
    const session = getSession(req);
    if (!session) {
      const token = extractBearerToken(req);
      const controllerUrl = req.headers['x-controller-url'] || process.env.CAMPUS_CONTROLLER_URL;
      if (!token || !controllerUrl) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const validation = await validateTokenAgainstController(token, controllerUrl);
      if (!validation.valid) {
        return res
          .status(validation.unreachable ? 503 : 401)
          .json({ error: validation.unreachable ? 'controller unreachable' : 'Unauthorized' });
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

/** Map the controller's role claim onto AURA roles. */
function defaultRoleForControllerRole(adminRole) {
  const r = String(adminRole ?? '').toLowerCase();
  if (r.includes('read')) return 'viewer';
  return 'admin';
}

/**
 * Derive the TRUSTED identity from a controller access token.
 *
 * Extreme controller access tokens are RS256 JWTs whose claims carry the
 * authenticated principal: `jti` is the login username and `extreme_role` is
 * the role. We do NOT verify the signature here — the caller has already
 * proven the token is genuine and live by validating it against the controller
 * (validateTokenAgainstController), so its claims are authoritative. Reading
 * identity from the token, never from the request body, is what prevents a
 * low-privilege token holder from claiming to be "admin".
 *
 * Returns { username, roleClaim } or null when the token is not a JWT whose
 * claims establish a username — in which case the session is refused rather
 * than trusting anything client-supplied.
 */
export function identityFromControllerToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const seg = parts[1] + '='.repeat((4 - (parts[1].length % 4)) % 4);
    const claims = JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'));
    const username = claims.jti ?? claims.username ?? claims.preferred_username ?? claims.sub;
    if (typeof username !== 'string' || !username) return null;
    return { username, roleClaim: claims.extreme_role ?? claims.role ?? null };
  } catch {
    return null;
  }
}

export function createIdentityRouter() {
  const router = Router();
  const jsonBody = expressJson({ limit: '16kb' });

  // POST /auth/session — exchange a fresh controller login for an AURA session.
  // The client body is NOT trusted for identity: username and role come from
  // the controller-issued token's claims after the controller validates it.
  router.post('/auth/session', jsonBody, async (req, res) => {
    const token = extractBearerToken(req);
    const controllerUrl = req.headers['x-controller-url'] || process.env.CAMPUS_CONTROLLER_URL;
    if (!token || !controllerUrl) return res.status(401).json({ error: 'Unauthorized' });

    const validation = await validateTokenAgainstController(token, controllerUrl);
    if (!validation.valid) {
      return res
        .status(validation.unreachable ? 503 : 401)
        .json({ error: validation.unreachable ? 'controller unreachable' : 'Unauthorized' });
    }

    // Identity is derived from the (now controller-verified) token, never the
    // request body — otherwise a valid low-privilege token holder could claim
    // userId "admin" and be handed an admin session on the conflict path.
    const identity = identityFromControllerToken(token);
    if (!identity || !USERNAME_RE.test(identity.username)) {
      return res.status(401).json({ error: 'could not establish identity from token' });
    }

    const user = await upsertLogin({
      username: identity.username,
      source: 'controller',
      defaultRole: defaultRoleForControllerRole(identity.roleClaim),
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
            groupsClaim: sso.groupsClaim ?? 'groups',
            groupMappings: Array.isArray(sso.groupMappings) ? sso.groupMappings : [],
          }
        : {
            enabled: false,
            issuer: '',
            clientId: '',
            defaultRole: 'viewer',
            clientSecretSet: false,
            groupsClaim: 'groups',
            groupMappings: [],
          },
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
      // Normalize and validate group→role mappings (bounded, known roles only).
      let groupMappings;
      if (sso.groupMappings !== undefined) {
        if (!Array.isArray(sso.groupMappings) || sso.groupMappings.length > 50) {
          return res.status(400).json({ error: 'groupMappings must be an array (max 50)' });
        }
        groupMappings = [];
        for (const m of sso.groupMappings) {
          const group = String(m?.group ?? '').trim();
          const role = String(m?.role ?? '');
          if (!group) continue;
          if (!ROLES.includes(role)) {
            return res.status(400).json({ error: `invalid role in mapping: ${role}` });
          }
          if (group.length > 256) {
            return res.status(400).json({ error: 'group name too long' });
          }
          groupMappings.push({ group, role });
        }
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
          groupsClaim: (sso.groupsClaim ?? existing.groupsClaim ?? 'groups').trim() || 'groups',
          groupMappings: groupMappings ?? existing.groupMappings ?? [],
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
