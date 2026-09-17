/**
 * What this Gateway can actually change.
 *
 * The catalogue proposes; the live object disposes. A catalogued field that is
 * absent from the resource in front of us is reported UNAVAILABLE WITH A REASON
 * rather than quietly offered — because the alternative is what already
 * happened: a confident, well-argued change request to enable 802.11r on a
 * platform whose service object has no such field. Applied, it would have
 * returned success and changed nothing.
 *
 * This is the write-side statement of a rule the Cortex contract already
 * applies to telemetry: an absent field is not a false one, and you cannot
 * conclude anything about a thing you never read. "Not exposed here" and "off"
 * are different answers, and only one of them is honest.
 */
import { CHANGE_CATALOG } from './changeCatalog.js';

/** Present means the key exists — an explicit null is a value, not an absence.
 *  Several of these fields are legitimately null before first use, and reading
 *  that as "the Gateway does not support it" would hide half the catalogue. */
const hasPath = (obj, path) => Object.prototype.hasOwnProperty.call(obj, path);

export function resolveWritableSurface(liveObject, catalog = CHANGE_CATALOG) {
  if (!liveObject || typeof liveObject !== 'object') {
    // A failed read is not an empty capability set. Everything is unavailable
    // because we could not look, which is a different sentence from "this
    // Gateway cannot do these things" — and the reason says so.
    return {
      available: [],
      unavailable: catalog.map((e) => ({
        id: e.id,
        label: e.label,
        reason: 'the resource could not be read',
      })),
    };
  }

  const available = [];
  const unavailable = [];

  for (const e of catalog) {
    if (!hasPath(liveObject, e.path)) {
      unavailable.push({ id: e.id, label: e.label, reason: 'not exposed on this Gateway' });
      continue;
    }
    available.push({
      id: e.id,
      label: e.label,
      path: e.path,
      type: e.type,
      risk: e.risk,
      rationale: e.rationale,
      current: liveObject[e.path],
      ...(e.min !== undefined ? { min: e.min } : {}),
      ...(e.max !== undefined ? { max: e.max } : {}),
    });
  }

  return { available, unavailable };
}

/**
 * Check a requested value before anything reaches the Gateway.
 *
 * Returning the coerced value rather than the input is deliberate: the caller
 * writes `check.value`, so a string "300" cannot reach the wire as a string.
 */
export function validateDesiredValue(entry, value) {
  if (!entry) return { ok: false, error: 'unknown change' };

  if (entry.type === 'boolean') {
    if (typeof value !== 'boolean') {
      return { ok: false, error: `${entry.label} is on or off — got ${JSON.stringify(value)}` };
    }
    return { ok: true, value };
  }

  if (entry.type === 'integer') {
    const n = Number(value);
    if (!Number.isInteger(n)) {
      return { ok: false, error: `${entry.label} must be a whole number — got ${JSON.stringify(value)}` };
    }
    if (n < entry.min || n > entry.max) {
      return {
        ok: false,
        error: `${entry.label} must be between ${entry.min} and ${entry.max} — got ${n}`,
      };
    }
    return { ok: true, value: n };
  }

  return { ok: false, error: `unsupported type ${entry.type}` };
}
