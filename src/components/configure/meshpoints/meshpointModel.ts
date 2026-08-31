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
 * PLM 2026-08-26: the API is the source of truth for validation semantics.
 * MeshpointElement.neighborTimeout is 60-86400 in the OpenAPI spec (v1.25.1);
 * the Gateway template's looser natural-number-max-6-digits rule is
 * superseded. Only validated when distributed support is available (the row
 * is otherwise hidden, gap 12).
 */
function validTimeout(v: unknown): boolean {
  if (v === '' || v == null) return false;
  const n = Number(v);
  return Number.isInteger(n) && n >= 60 && n <= 86400;
}

/** MeshpointElement.meshId: number, minimum 1, maximum 32 (OpenAPI v1.25.1). */
function validMeshId(v: unknown): boolean {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 32;
}

export interface MeshValidationCtx {
  supportDistributed: boolean;
}

export function validateMeshpoint(form: Meshpoint, ctx: MeshValidationCtx): Record<string, string> {
  const errs: Record<string, string> = {};
  const name = String(form.name ?? '').trim();
  if (!name) errs.name = 'Meshpoint name is required';
  else if (!MESH_NAME_RE.test(form.name)) errs.name = 'Name contains invalid characters';
  if (!String(form.meshId ?? '').trim()) errs.meshId = 'Mesh ID is required';
  else if (!validMeshId(form.meshId)) errs.meshId = 'Valid range 1 to 32';
  if (ctx.supportDistributed && !validTimeout(form.neighborTimeout))
    errs.neighborTimeout = 'Valid range 60 to 86400';
  const psk = form.privacy?.PskElement?.presharedKey;
  if (form.privacy?.PskElement && psk != null && String(psk).length > 63)
    errs.psk = 'Maximum 63 characters';
  return errs;
}
