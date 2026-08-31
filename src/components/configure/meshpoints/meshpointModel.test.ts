/**
 * Meshpoint model validation — the API-is-truth ranges (PLM 2026-08-26,
 * OpenAPI v1.25.1): meshId 1-32, neighborTimeout 60-86400; PSK max 63 with
 * keyHexEncoded preserved by the editor (masked input caps length).
 */
import { describe, expect, it } from 'vitest';
import type { Meshpoint } from '../../../types/configure';
import { hasPrivacy, seedMeshpoint, validateMeshpoint } from './meshpointModel';

const base = (over: Partial<Meshpoint> = {}): Meshpoint =>
  ({
    id: 'mp-1',
    canEdit: true,
    canDelete: true,
    name: 'Mesh One',
    status: 'enabled',
    meshId: '5',
    root: true,
    neighborTimeout: 120,
    controlVlan: null,
    privacy: { PskElement: { presharedKey: 'secret123', keyHexEncoded: false } },
    ...over,
  }) as Meshpoint;

const ctx = { supportDistributed: true };

describe('validateMeshpoint — API-is-truth ranges', () => {
  it('accepts a controller-valid record', () => {
    expect(validateMeshpoint(base(), ctx)).toEqual({});
  });

  it('enforces meshId 1-32 (OpenAPI MeshpointElement.meshId)', () => {
    expect(validateMeshpoint(base({ meshId: '' }), ctx).meshId).toBe('Mesh ID is required');
    expect(validateMeshpoint(base({ meshId: '0' }), ctx).meshId).toBe('Valid range 1 to 32');
    expect(validateMeshpoint(base({ meshId: '33' }), ctx).meshId).toBe('Valid range 1 to 32');
    expect(validateMeshpoint(base({ meshId: '1' }), ctx).meshId).toBeUndefined();
    expect(validateMeshpoint(base({ meshId: '32' }), ctx).meshId).toBeUndefined();
  });

  it('enforces neighborTimeout 60-86400, superseding the template 6-digit rule', () => {
    expect(validateMeshpoint(base({ neighborTimeout: 59 }), ctx).neighborTimeout).toBe(
      'Valid range 60 to 86400'
    );
    expect(validateMeshpoint(base({ neighborTimeout: 86401 }), ctx).neighborTimeout).toBe(
      'Valid range 60 to 86400'
    );
    expect(validateMeshpoint(base({ neighborTimeout: 60 }), ctx).neighborTimeout).toBeUndefined();
    expect(
      validateMeshpoint(base({ neighborTimeout: 86400 }), ctx).neighborTimeout
    ).toBeUndefined();
  });

  it('skips the timeout check when distributed support is absent (row hidden)', () => {
    expect(
      validateMeshpoint(base({ neighborTimeout: 1 }), { supportDistributed: false }).neighborTimeout
    ).toBeUndefined();
  });

  it('caps the PSK at 63 characters', () => {
    const long = base({
      privacy: { PskElement: { presharedKey: 'x'.repeat(64), keyHexEncoded: true } },
    });
    expect(validateMeshpoint(long, ctx).psk).toBe('Maximum 63 characters');
  });
});

describe('seedMeshpoint / hasPrivacy', () => {
  it('seeds a blank create scaffold with controller defaults', () => {
    const seed = seedMeshpoint(base({ name: 'template', meshId: '9' }));
    expect(seed.name).toBe('');
    expect(seed.meshId).toBe('');
    expect(seed.root).toBe(true);
    expect(seed.neighborTimeout).toBe(120);
  });

  it('binds the single auth type to privacy.PskElement presence', () => {
    expect(hasPrivacy(base())).toBe(true);
    expect(hasPrivacy(base({ privacy: null }))).toBe(false);
  });
});
