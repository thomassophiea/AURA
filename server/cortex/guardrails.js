import crypto from 'node:crypto';

const DISRUPTIVE_RE = /\/v1\/aps\/[^/]+\/(reboot|reset|upgrade|realcapture|logs)$/;

export function isDisruptiveCall(method, path) {
  return method === 'PUT' && DISRUPTIVE_RE.test(path);
}

export function checkGuardrails(apiPlan, confirmationToken) {
  const disruptive = apiPlan.filter(c => c.disruptive || isDisruptiveCall(c.method, c.path));
  if (disruptive.length === 0) return { blocked: false };
  if (confirmationToken) return { blocked: false };
  return {
    blocked: true,
    action: disruptive[0].description ?? disruptive[0].path,
    description: `This action (${disruptive[0].path}) requires confirmation before proceeding.`,
    confirmationToken: crypto.randomUUID(),
  };
}
