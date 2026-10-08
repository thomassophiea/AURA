/**
 * Auth for the ambient-light side channel in server.js.
 *
 * POST /api/light-sensor/report is posted by the AP-resident `lightguard` agent
 * (scripts/lightguard.sh, installed by scripts/deploy-lightguard.sh) and can
 * end in a REAL radio-disable write: a report feeds the darkness trigger, which
 * activates the energy experiment. So in production it requires a shared
 * secret, `LIGHT_SENSOR_TOKEN`, sent as the `X-Light-Token` header:
 *
 *   - NODE_ENV=production and LIGHT_SENSOR_TOKEN unset -> 503 "not configured"
 *     (fail closed: an unset secret must not mean "anyone may post")
 *   - token set and header wrong or missing            -> 401
 *   - outside production with no token set             -> open, as before, so a
 *     local bench keeps working
 *
 * The comparison is constant-time over SHA-256 digests, so neither the length
 * nor a prefix of the secret leaks through response timing.
 *
 * GET /api/light-sensor/states is read by the browser (AccessPoints) and
 * requires an authenticated caller: a Bearer token (the same presence check as
 * server.js `requireAuth`) or a valid signed AURA session cookie — which is
 * what a same-origin fetch from a logged-in browser carries.
 */

import crypto from 'node:crypto';

export const LIGHT_SENSOR_TOKEN_ENV = 'LIGHT_SENSOR_TOKEN';
export const LIGHT_SENSOR_TOKEN_HEADER = 'X-Light-Token';

/** Constant-time string equality. */
export function tokensMatch(presented, expected) {
  if (typeof presented !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = crypto.createHash('sha256').update(presented).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * @param {{ env?: Record<string,string|undefined>, getSession?: (req:object)=>unknown }} [deps]
 */
export function createLightSensorAuth({ env = process.env, getSession = () => null } = {}) {
  /** Gate for the sensor POST. Reads env per request so a redeploy-free rotate works in tests. */
  function requireSensorToken(req, res, next) {
    const expected = env[LIGHT_SENSOR_TOKEN_ENV];
    if (!expected) {
      if (env.NODE_ENV === 'production') {
        return res.status(503).json({
          error: `Light sensor ingest is not configured: set ${LIGHT_SENSOR_TOKEN_ENV} on the server.`,
        });
      }
      return next();
    }
    if (!tokensMatch(req.get?.(LIGHT_SENSOR_TOKEN_HEADER) ?? '', expected)) {
      return res.status(401).json({ error: 'invalid token' });
    }
    return next();
  }

  /** Gate for the browser read: Bearer token or a valid AURA session cookie. */
  function requireReader(req, res, next) {
    const auth = req.headers?.authorization || '';
    if (auth.startsWith('Bearer ') && auth.length >= 10) return next();
    let session = null;
    try {
      session = getSession(req);
    } catch {
      session = null;
    }
    if (session) return next();
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return { requireSensorToken, requireReader };
}
