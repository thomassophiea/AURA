/**
 * Meshpoint editor model (EPB-125 · meshpoints-parity.md). Name pattern,
 * defaults-seeded create (root=true / status=enabled / neighborTimeout=120 /
 * empty PskElement), single auth type bound to privacy.PskElement presence,
 * and the controller validation set. Field truth: api/defaults/meshpoints.json.
 */
import type { Meshpoint } from '../../../types/configure';

/**
 * meshpointNamePattern approximation — the controller regex resolves in JS
 * (not captured); letters/digits/space/._- matches every live name and
 * rejects markup characters.
 */
export const MESH_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

/** Build the create scaffold from the /default record (gap 9). */
export function seedMeshpoint(def: Meshpoint): Meshpoint {
  const seed = structuredClone(def);
  seed.name = '';
  seed.meshId = '';
  seed.status = seed.status ?? 'enabled';
  seed.root = seed.root ?? true;
  seed.neighborTimeout = seed.neighborTimeout ?? 120;
  seed.canDelete = true;
  seed.canEdit = true;
  return seed;
}

export function hasPrivacy(form: Meshpoint): boolean {
  return !!(form.privacy && form.privacy.PskElement);
}

/**
 * Neighbour Timeout must be a natural number, max 6 digits (gap 10). Only
 * validated when distributed support is available (the row is otherwise
 * hidden, gap 12).
 */
function validTimeout(v: unknown): boolean {
  if (v === '' || v == null) return false;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && String(v).replace('-', '').length <= 6;
}

export interface MeshValidationCtx {
  supportDistributed: boolean;
}

export function validateMeshpoint(
  form: Meshpoint,
  ctx: MeshValidationCtx
): Record<string, string> {
  const errs: Record<string, string> = {};
  const name = String(form.name ?? '').trim();
  if (!name) errs.name = 'Meshpoint name is required';
  else if (!MESH_NAME_RE.test(form.name)) errs.name = 'Name contains invalid characters';
  if (!String(form.meshId ?? '').trim()) errs.meshId = 'Mesh ID is required';
  if (ctx.supportDistributed && !validTimeout(form.neighborTimeout))
    errs.neighborTimeout = 'Must be a natural number (max 6 digits)';
  const psk = form.privacy?.PskElement?.presharedKey;
  if (form.privacy?.PskElement && psk != null && String(psk).length > 63)
    errs.psk = 'Maximum 63 characters';
  return errs;
}
