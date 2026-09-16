/**
 * Change one catalogued field on one WLAN, and prove the Gateway honoured it.
 *
 * The proving is the point. This platform returns 200/201 and then discards the
 * parts of a payload whose shape it did not like, with no error and no warning —
 * so a status code is evidence that the request was RECEIVED, never that it was
 * applied. Configuration is complete when read-back agrees, not when REST says
 * success.
 *
 * Four outcomes, and the distinctions between them are the product:
 *
 *   applied           read-back agrees with what was asked for
 *   silently_dropped  write accepted, field unchanged          -> A FAILURE
 *   rejected          the Gateway said no, and said why
 *   read_failed       we could not check                       -> NOT the same
 *                     thing as silently_dropped; one is a claim about the
 *                     change, the other is a claim about our own visibility
 *
 * Collapsing read_failed into silently_dropped would report a working change as
 * broken; collapsing it into applied would report a broken change as working.
 * Both are worse than saying we do not know.
 */
import { requestXcc } from '../validationEngine/xccClient.js';
import { getCatalogEntry } from './changeCatalog.js';
import { validateDesiredValue } from './writableSurface.js';

export async function applyWlanChange({
  serviceId,
  changeId,
  desired,
  authToken,
  controllerUrl,
  fetchFn,
}) {
  const fail = (status, error, extra = {}) => ({
    status,
    error,
    before: null,
    after: null,
    httpStatus: null,
    ...extra,
  });

  const entry = getCatalogEntry(changeId);
  if (!entry) {
    return fail('invalid', `${changeId} is not a change Cortex can make on this platform`);
  }

  // Validated before anything reaches the wire: a value the Gateway will reject
  // is not worth a round trip, and `check.value` is coerced so a numeric string
  // cannot be written as a string.
  const check = validateDesiredValue(entry, desired);
  if (!check.ok) return fail('invalid', check.error);

  const opts = { authToken, controllerUrl, fetchFn };
  const path = `/v1/services/${encodeURIComponent(serviceId)}`;

  const current = await requestXcc(path, { ...opts, method: 'GET' });
  if (!current.ok) {
    return fail('read_failed', current.errorText ?? `HTTP ${current.status}`, {
      httpStatus: current.status,
    });
  }

  const before = current.data?.[entry.path] ?? null;

  // The WHOLE object back, one field changed. Never a fragment — a partial body
  // wipes the fields it omits on this Gateway.
  const body = { ...current.data, [entry.path]: check.value };
  const written = await requestXcc(path, { ...opts, method: 'PUT', body });
  if (!written.ok) {
    return {
      status: 'rejected',
      error: written.errorText ?? `HTTP ${written.status}`,
      before,
      after: null,
      httpStatus: written.status,
    };
  }

  const readBack = await requestXcc(path, { ...opts, method: 'GET' });
  if (!readBack.ok) {
    return {
      status: 'read_failed',
      error:
        `The write returned ${written.status}, but the read-back failed ` +
        `(${readBack.errorText ?? `HTTP ${readBack.status}`}), so whether it applied is unknown.`,
      before,
      after: null,
      httpStatus: readBack.status,
    };
  }

  const after = readBack.data?.[entry.path] ?? null;
  const honoured = entry.verify(after, check.value);

  return {
    status: honoured ? 'applied' : 'silently_dropped',
    before,
    after,
    httpStatus: written.status,
    error: honoured
      ? null
      : `The Gateway returned ${written.status} and ${entry.path} is still ` +
        `${JSON.stringify(after)}. The write was discarded, not applied.`,
  };
}
