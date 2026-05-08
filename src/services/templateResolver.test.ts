import { describe, it, expect } from 'vitest';
import { templateResolver } from './templateResolver';
import type {
  GlobalElementTemplate,
  PersistedVariableDefinition,
  VariableValue,
  ResolutionContext,
} from '../types/globalElements';

const def = (
  token: string,
  overrides: Partial<PersistedVariableDefinition> = {}
): PersistedVariableDefinition =>
  ({
    id: `def-${token}`,
    org_id: 'org-1',
    name: token,
    token,
    type: 'string',
    ...overrides,
  }) as PersistedVariableDefinition;

const value = (
  variableId: string,
  scopeType: 'organization' | 'site_group' | 'site',
  scopeId: string,
  v: string
): VariableValue =>
  ({
    id: `val-${variableId}-${scopeType}-${scopeId}`,
    org_id: 'org-1',
    variable_id: variableId,
    scope_type: scopeType,
    scope_id: scopeId,
    value: v,
    source_type: 'manual',
  }) as unknown as VariableValue;

const tmpl = (payload: Record<string, unknown>): GlobalElementTemplate =>
  ({
    id: 't-1',
    org_id: 'org-1',
    name: 't',
    element_type: 'wlan',
    config_payload: payload,
    version: 1,
    is_active: true,
    tags: [],
  }) as unknown as GlobalElementTemplate;

const ctx = (overrides: Partial<ResolutionContext> = {}): ResolutionContext => ({
  org_id: 'org-1',
  org_name: 'Org',
  ...overrides,
});

describe('templateResolver.extractTokens', () => {
  it('returns unique tokens found anywhere in nested string values', () => {
    const tokens = templateResolver.extractTokens({
      ssid: 'corp-{{site}}',
      vlan: '{{vlan_id}}',
      nested: { passphrase: '{{psk}}', list: ['{{psk}}', 'literal'] },
    });
    expect(tokens.sort()).toEqual(['psk', 'site', 'vlan_id']);
  });

  it('returns an empty array when no tokens present', () => {
    expect(templateResolver.extractTokens({ ssid: 'corp', vlan: 100 })).toEqual([]);
  });

  it('ignores tokens inside non-string primitives', () => {
    expect(templateResolver.extractTokens({ x: 42, y: true, z: null })).toEqual([]);
  });

  it('handles empty payload', () => {
    expect(templateResolver.extractTokens({})).toEqual([]);
  });
});

describe('templateResolver.resolveVariables — precedence', () => {
  it('site value beats site_group beats organization beats default', () => {
    const d = def('vlan', { default_value: '100' });
    const values = [
      value('def-vlan', 'organization', 'org-1', '200'),
      value('def-vlan', 'site_group', 'sg-1', '300'),
      value('def-vlan', 'site', 's-1', '400'),
    ];
    const out = templateResolver.resolveVariables(
      [d],
      values,
      ctx({ site_group_id: 'sg-1', site_id: 's-1' })
    );
    expect(out.get('vlan')!.value).toBe('400');
    expect(out.get('vlan')!.resolved_from).toBe('site');
  });

  it('falls back to site_group when site has no override', () => {
    const d = def('vlan', { default_value: '100' });
    const values = [
      value('def-vlan', 'organization', 'org-1', '200'),
      value('def-vlan', 'site_group', 'sg-1', '300'),
    ];
    const out = templateResolver.resolveVariables(
      [d],
      values,
      ctx({ site_group_id: 'sg-1', site_id: 's-1' })
    );
    expect(out.get('vlan')!.value).toBe('300');
    expect(out.get('vlan')!.resolved_from).toBe('site_group');
  });

  it('falls back to organization when neither site nor site_group has an override', () => {
    const d = def('vlan', { default_value: '100' });
    const values = [value('def-vlan', 'organization', 'org-1', '200')];
    const out = templateResolver.resolveVariables([d], values, ctx({ site_id: 's-1' }));
    expect(out.get('vlan')!.value).toBe('200');
    expect(out.get('vlan')!.resolved_from).toBe('organization');
  });

  it('falls back to definition default when no value at any scope', () => {
    const d = def('vlan', { default_value: '100' });
    const out = templateResolver.resolveVariables([d], [], ctx({ site_id: 's-1' }));
    expect(out.get('vlan')!.value).toBe('100');
  });

  it('produces a chain showing every checked scope (overrides + non-overrides)', () => {
    const d = def('vlan', { default_value: '100' });
    const values = [value('def-vlan', 'site', 's-1', '500')];
    const out = templateResolver.resolveVariables(
      [d],
      values,
      ctx({ site_group_id: 'sg-1', site_id: 's-1' })
    );
    const chain = out.get('vlan')!.chain;
    expect(chain.map((c) => c.scope)).toEqual(['organization', 'site_group', 'site']);
    expect(chain[0].is_override).toBe(false);
    expect(chain[2].is_override).toBe(true);
  });
});

describe('templateResolver.substituteTokens', () => {
  it('substitutes single-token-only strings with the resolved value', () => {
    const resolved = templateResolver.resolveVariables(
      [def('site_name', { default_value: 'HQ' })],
      [],
      ctx()
    );
    const { resolved: out } = templateResolver.substituteTokens(
      { ssid: '{{site_name}}' },
      resolved,
      [def('site_name', { default_value: 'HQ' })]
    );
    expect(out).toEqual({ ssid: 'HQ' });
  });

  it('coerces single-token numeric types (number, vlan) to numbers', () => {
    const d = def('vlan_id', { type: 'vlan', default_value: '42' });
    const resolved = templateResolver.resolveVariables([d], [], ctx());
    const { resolved: out } = templateResolver.substituteTokens({ vlan: '{{vlan_id}}' }, resolved, [
      d,
    ]);
    expect(out.vlan).toBe(42);
    expect(typeof out.vlan).toBe('number');
  });

  it('keeps mixed strings as strings', () => {
    const d = def('site', { default_value: 'HQ' });
    const resolved = templateResolver.resolveVariables([d], [], ctx());
    const { resolved: out } = templateResolver.substituteTokens(
      { ssid: 'corp-{{site}}-wifi' },
      resolved,
      [d]
    );
    expect(out.ssid).toBe('corp-HQ-wifi');
  });

  it('preserves {{token}} and reports it in unresolvedTokens when no value found', () => {
    const resolved = templateResolver.resolveVariables([], [], ctx());
    const { resolved: out, unresolvedTokens } = templateResolver.substituteTokens(
      { ssid: '{{missing}}' },
      resolved,
      []
    );
    expect(out.ssid).toBe('{{missing}}');
    expect(unresolvedTokens).toEqual(['missing']);
  });

  it('walks arrays and nested objects recursively', () => {
    const d = def('site', { default_value: 'HQ' });
    const resolved = templateResolver.resolveVariables([d], [], ctx());
    const payload = {
      arr: ['{{site}}-1', '{{site}}-2'],
      nested: { ssid: '{{site}}', deep: { name: 'static-{{site}}' } },
    };
    const { resolved: out } = templateResolver.substituteTokens(payload, resolved, [d]);
    expect(out).toEqual({
      arr: ['HQ-1', 'HQ-2'],
      nested: { ssid: 'HQ', deep: { name: 'static-HQ' } },
    });
  });

  it('passes through non-string primitives unchanged', () => {
    const resolved = templateResolver.resolveVariables([], [], ctx());
    const { resolved: out } = templateResolver.substituteTokens(
      { num: 42, bool: true, none: null },
      resolved,
      []
    );
    expect(out).toEqual({ num: 42, bool: true, none: null });
  });
});

describe('templateResolver.resolveTemplate (end-to-end)', () => {
  it('returns is_fully_resolved=true when every token has a value', () => {
    const result = templateResolver.resolveTemplate(
      tmpl({ ssid: '{{site}}', vlan: '{{vlan_id}}' }),
      [def('site', { default_value: 'HQ' }), def('vlan_id', { type: 'vlan', default_value: '10' })],
      [],
      ctx()
    );
    expect(result.is_fully_resolved).toBe(true);
    expect(result.unresolved_tokens).toEqual([]);
    expect(result.resolved_payload.ssid).toBe('HQ');
    expect(result.resolved_payload.vlan).toBe(10);
  });

  it('returns is_fully_resolved=false when tokens remain', () => {
    const result = templateResolver.resolveTemplate(
      tmpl({ a: '{{undefined_token}}' }),
      [],
      [],
      ctx()
    );
    expect(result.is_fully_resolved).toBe(false);
    expect(result.unresolved_tokens).toContain('undefined_token');
  });

  it('only returns the resolved variables actually used in the template', () => {
    const result = templateResolver.resolveTemplate(
      tmpl({ ssid: '{{site}}' }),
      [def('site', { default_value: 'HQ' }), def('unused', { default_value: 'x' })],
      [],
      ctx()
    );
    expect(result.variables.map((v) => v.token)).toEqual(['site']);
  });
});

describe('templateResolver.validateResolution', () => {
  const resolveAndValidate = (
    payload: Record<string, unknown>,
    defs: PersistedVariableDefinition[],
    values: VariableValue[]
  ) => {
    const result = templateResolver.resolveTemplate(tmpl(payload), defs, values, ctx());
    return templateResolver.validateResolution(result, defs);
  };

  it('valid: vlan in 1..4094', () => {
    const r = resolveAndValidate(
      { vlan: '{{v}}' },
      [def('v', { type: 'vlan', default_value: '1000' })],
      []
    );
    expect(r.valid).toBe(true);
  });

  it('invalid: vlan above 4094', () => {
    const r = resolveAndValidate(
      { vlan: '{{v}}' },
      [def('v', { type: 'vlan', default_value: '5000' })],
      []
    );
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/VLAN must be 1.+4094/);
  });

  it('invalid: number below validation_rules.min', () => {
    const r = resolveAndValidate(
      { x: '{{v}}' },
      [def('v', { type: 'number', default_value: '5', validation_rules: { min: 10 } })],
      []
    );
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/below minimum 10/);
  });

  it('invalid: number above validation_rules.max', () => {
    const r = resolveAndValidate(
      { x: '{{v}}' },
      [def('v', { type: 'number', default_value: '50', validation_rules: { max: 20 } })],
      []
    );
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/above maximum 20/);
  });

  it('invalid: ip with malformed format', () => {
    const r = resolveAndValidate(
      { ip: '{{v}}' },
      [def('v', { type: 'ip', default_value: 'not-an-ip' })],
      []
    );
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/invalid IP address/);
  });

  it('valid: ip with dotted-quad format', () => {
    const r = resolveAndValidate(
      { ip: '{{v}}' },
      [def('v', { type: 'ip', default_value: '10.0.0.1' })],
      []
    );
    expect(r.valid).toBe(true);
  });

  it('invalid: subnet without CIDR mask', () => {
    const r = resolveAndValidate(
      { net: '{{v}}' },
      [def('v', { type: 'subnet', default_value: '10.0.0.0' })],
      []
    );
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/invalid subnet/);
  });

  it('valid: subnet with CIDR mask', () => {
    const r = resolveAndValidate(
      { net: '{{v}}' },
      [def('v', { type: 'subnet', default_value: '10.0.0.0/24' })],
      []
    );
    expect(r.valid).toBe(true);
  });

  it('invalid: hostname with spaces', () => {
    const r = resolveAndValidate(
      { h: '{{v}}' },
      [def('v', { type: 'hostname', default_value: 'bad host' })],
      []
    );
    expect(r.valid).toBe(false);
  });

  it('valid: regex pattern match', () => {
    const r = resolveAndValidate(
      { x: '{{v}}' },
      [
        def('v', {
          type: 'string',
          default_value: 'hello',
          validation_rules: { pattern: '^[a-z]+$' },
        }),
      ],
      []
    );
    expect(r.valid).toBe(true);
  });

  it('invalid: regex pattern mismatch', () => {
    const r = resolveAndValidate(
      { x: '{{v}}' },
      [
        def('v', {
          type: 'string',
          default_value: 'has spaces',
          validation_rules: { pattern: '^[a-z]+$' },
        }),
      ],
      []
    );
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/does not match pattern/);
  });

  it('invalid: required variable without value', () => {
    const r = resolveAndValidate(
      { x: '{{v}}' },
      [def('v', { type: 'string', validation_rules: { required: true } })],
      []
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /required/i.test(e))).toBe(true);
  });

  it('flags unresolved tokens as errors', () => {
    const r = resolveAndValidate({ x: '{{nope}}' }, [], []);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/unresolved/);
  });

  it('does not crash on a malformed regex pattern (silently skips)', () => {
    const r = resolveAndValidate(
      { x: '{{v}}' },
      [
        def('v', {
          type: 'string',
          default_value: 'x',
          validation_rules: { pattern: '[malformed regex' },
        }),
      ],
      []
    );
    // Just shouldn't throw — and the bad pattern doesn't add an error.
    expect(typeof r.valid).toBe('boolean');
  });
});
