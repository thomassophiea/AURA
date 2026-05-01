/**
 * Tests for the template resolution engine. The variable system has zero
 * coverage today, and several pieces of UX (post-promote → assign, deployment
 * preview, drift detection) all flow through it. Lock the contract in.
 */

import { describe, it, expect } from 'vitest';
import { templateResolver } from '../../services/templateResolver';
import type {
  GlobalElementTemplate,
  PersistedVariableDefinition,
  VariableValue,
  ResolutionContext,
} from '../../types/globalElements';

const ORG = 'org-1';
const SG = 'sg-1';
const SITE = 'site-1';

const ctx: ResolutionContext = {
  org_id: ORG,
  org_name: 'Acme',
  site_group_id: SG,
  site_group_name: 'East Region',
  site_id: SITE,
  site_name: 'East-DC1',
};

function def(overrides: Partial<PersistedVariableDefinition>): PersistedVariableDefinition {
  return {
    id: overrides.id ?? overrides.token ?? 'def',
    org_id: ORG,
    name: overrides.name ?? 'Variable',
    token: overrides.token ?? 'var',
    type: overrides.type ?? 'string',
    default_value: overrides.default_value,
    validation_rules: overrides.validation_rules,
    description: overrides.description,
  };
}

function val(
  variable_id: string,
  scope_type: VariableValue['scope_type'],
  scope_id: string,
  value: string
): VariableValue {
  return {
    id: `${variable_id}-${scope_type}-${scope_id}`,
    org_id: ORG,
    variable_id,
    scope_type,
    scope_id,
    value,
    source_type: 'override',
  };
}

function template(payload: Record<string, unknown>): GlobalElementTemplate {
  return {
    id: 't-1',
    org_id: ORG,
    name: 'Template',
    element_type: 'service',
    config_payload: payload,
    version: 1,
    is_active: true,
    tags: [],
  };
}

// ─── Token extraction ─────────────────────────────────────────────────────────

describe('extractTokens', () => {
  it('returns the unique set of {{tokens}} from a nested payload', () => {
    const tokens = templateResolver.extractTokens({
      ssid: '{{ssid_name}}',
      vlan: '{{employee_vlan}}',
      nested: { duplicate: '{{ssid_name}}', list: ['{{guest_vlan}}', 'literal'] },
    });
    expect(new Set(tokens)).toEqual(new Set(['ssid_name', 'employee_vlan', 'guest_vlan']));
  });

  it('returns an empty array when there are no tokens', () => {
    expect(templateResolver.extractTokens({ ssid: 'plain', vlan: 100 })).toEqual([]);
  });
});

// ─── Resolution precedence ────────────────────────────────────────────────────

describe('resolveVariables — site > site_group > org > default', () => {
  const d = def({ id: 'd1', token: 'vlan', type: 'vlan', default_value: '1' });

  it('uses the site-level value when present', () => {
    const map = templateResolver.resolveVariables(
      [d],
      [
        val('d1', 'organization', ORG, '10'),
        val('d1', 'site_group', SG, '20'),
        val('d1', 'site', SITE, '30'),
      ],
      ctx
    );
    expect(map.get('vlan')?.value).toBe('30');
    expect(map.get('vlan')?.resolved_from).toBe('site');
  });

  it('falls back to the site_group value when no site value exists', () => {
    const map = templateResolver.resolveVariables(
      [d],
      [val('d1', 'organization', ORG, '10'), val('d1', 'site_group', SG, '20')],
      ctx
    );
    expect(map.get('vlan')?.value).toBe('20');
    expect(map.get('vlan')?.resolved_from).toBe('site_group');
  });

  it('falls back to the organization value when no group/site values exist', () => {
    const map = templateResolver.resolveVariables([d], [val('d1', 'organization', ORG, '10')], ctx);
    expect(map.get('vlan')?.value).toBe('10');
    expect(map.get('vlan')?.resolved_from).toBe('organization');
  });

  it('falls back to the definition default_value when nothing else is set', () => {
    const map = templateResolver.resolveVariables([d], [], ctx);
    expect(map.get('vlan')?.value).toBe('1');
  });

  it('returns "" (empty) when neither value nor default exists — UI flags this as unresolved', () => {
    const noDefault = def({ id: 'd2', token: 'orphan', default_value: undefined });
    const map = templateResolver.resolveVariables([noDefault], [], ctx);
    expect(map.get('orphan')?.value).toBe('');
  });
});

// ─── Token substitution ───────────────────────────────────────────────────────

describe('substituteTokens', () => {
  const defs = [
    def({ id: 'd1', token: 'ssid_name', type: 'string' }),
    def({ id: 'd2', token: 'vlan_id', type: 'vlan' }),
  ];

  it('coerces single-token strings to numbers when the variable type is numeric', () => {
    const map = templateResolver.resolveVariables(
      defs,
      [val('d1', 'organization', ORG, 'corp'), val('d2', 'organization', ORG, '100')],
      ctx
    );
    const { resolved } = templateResolver.substituteTokens(
      { ssid: '{{ssid_name}}', dot1dPortNumber: '{{vlan_id}}' },
      map,
      defs
    );
    expect(resolved.ssid).toBe('corp');
    expect(resolved.dot1dPortNumber).toBe(100); // coerced to number
  });

  it('keeps mixed strings as strings even when the token resolves to a number', () => {
    const map = templateResolver.resolveVariables(
      defs,
      [val('d2', 'organization', ORG, '100')],
      ctx
    );
    const { resolved } = templateResolver.substituteTokens(
      { displayName: 'VLAN-{{vlan_id}}-net' },
      map,
      defs
    );
    expect(resolved.displayName).toBe('VLAN-100-net');
  });

  it('leaves unresolved tokens in place and reports them', () => {
    const map = templateResolver.resolveVariables(defs, [], ctx); // no values, no defaults
    const { resolved, unresolvedTokens } = templateResolver.substituteTokens(
      { ssid: '{{ssid_name}}', other: '{{vlan_id}}' },
      map,
      defs
    );
    expect(resolved.ssid).toBe('{{ssid_name}}');
    expect(resolved.other).toBe('{{vlan_id}}');
    expect(new Set(unresolvedTokens)).toEqual(new Set(['ssid_name', 'vlan_id']));
  });

  it('walks arrays and nested objects', () => {
    const map = templateResolver.resolveVariables(
      [def({ id: 'd1', token: 'name', type: 'string' })],
      [val('d1', 'organization', ORG, 'X')],
      ctx
    );
    const { resolved } = templateResolver.substituteTokens(
      {
        list: ['{{name}}', { nested: '{{name}}' }],
        scalar: 42, // primitives pass through unchanged
      },
      map,
      [def({ id: 'd1', token: 'name', type: 'string' })]
    );
    expect(resolved.list).toEqual(['X', { nested: 'X' }]);
    expect(resolved.scalar).toBe(42);
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe('validateResolution', () => {
  it('rejects VLAN values outside 1–4094', () => {
    const d = def({ id: 'd1', token: 'vlan', type: 'vlan' });
    const t = template({ vlan: '{{vlan}}' });
    const r = templateResolver.resolveTemplate(
      t,
      [d],
      [val('d1', 'organization', ORG, '5000')],
      ctx
    );
    const result = templateResolver.validateResolution(r, [d]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('VLAN must be 1–4094'))).toBe(true);
  });

  it('rejects an invalid IP', () => {
    const d = def({ id: 'd1', token: 'gw', type: 'ip' });
    const t = template({ gateway: '{{gw}}' });
    const r = templateResolver.resolveTemplate(
      t,
      [d],
      [val('d1', 'organization', ORG, 'not-an-ip')],
      ctx
    );
    const result = templateResolver.validateResolution(r, [d]);
    expect(result.errors.some((e) => e.includes('invalid IP'))).toBe(true);
  });

  it('rejects an invalid hostname', () => {
    const d = def({ id: 'd1', token: 'host', type: 'hostname' });
    const t = template({ name: '{{host}}' });
    const r = templateResolver.resolveTemplate(
      t,
      [d],
      [val('d1', 'organization', ORG, '-bad-')],
      ctx
    );
    const result = templateResolver.validateResolution(r, [d]);
    expect(result.errors.some((e) => e.includes('invalid hostname'))).toBe(true);
  });

  it('enforces validation_rules.min/max for numeric types', () => {
    const d = def({
      id: 'd1',
      token: 'count',
      type: 'number',
      validation_rules: { min: 1, max: 10 },
    });
    const t = template({ n: '{{count}}' });
    const r = templateResolver.resolveTemplate(t, [d], [val('d1', 'organization', ORG, '99')], ctx);
    const result = templateResolver.validateResolution(r, [d]);
    expect(result.errors.some((e) => e.includes('above maximum'))).toBe(true);
  });

  it('returns valid=true for a clean payload', () => {
    const d = def({ id: 'd1', token: 'vlan', type: 'vlan' });
    const t = template({ vlan: '{{vlan}}' });
    const r = templateResolver.resolveTemplate(
      t,
      [d],
      [val('d1', 'organization', ORG, '100')],
      ctx
    );
    const result = templateResolver.validateResolution(r, [d]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

// ─── End-to-end resolveTemplate ───────────────────────────────────────────────

describe('resolveTemplate — end-to-end', () => {
  it('produces a fully resolved payload with the chain populated and is_fully_resolved=true', () => {
    const defs = [
      def({ id: 'd1', token: 'ssid_name', type: 'string', default_value: 'corp' }),
      def({ id: 'd2', token: 'vlan_id', type: 'vlan', default_value: '100' }),
    ];
    const t = template({ ssid: '{{ssid_name}}', dot1dPortNumber: '{{vlan_id}}' });
    const r = templateResolver.resolveTemplate(t, defs, [], ctx);
    expect(r.resolved_payload).toEqual({ ssid: 'corp', dot1dPortNumber: 100 });
    expect(r.is_fully_resolved).toBe(true);
    expect(r.unresolved_tokens).toEqual([]);
    // Both used variables are reported, with chain entries for org/site_group/site
    expect(r.variables.map((v) => v.token).sort()).toEqual(['ssid_name', 'vlan_id']);
    expect(r.variables[0].chain.length).toBeGreaterThanOrEqual(1);
  });

  it('marks is_fully_resolved=false when at least one token has no value or default', () => {
    const defs = [def({ id: 'd1', token: 'orphan', type: 'string' })];
    const t = template({ x: '{{orphan}}' });
    const r = templateResolver.resolveTemplate(t, defs, [], ctx);
    expect(r.is_fully_resolved).toBe(false);
    expect(r.unresolved_tokens).toEqual(['orphan']);
    // The placeholder is preserved verbatim in the resolved payload
    expect(r.resolved_payload.x).toBe('{{orphan}}');
  });
});
