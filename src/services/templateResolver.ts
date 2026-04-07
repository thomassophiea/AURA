/**
 * Template Resolution Engine
 *
 * Takes a GlobalElementTemplate + variable definitions/values + a ResolutionContext
 * and produces a fully-resolved config payload with all {{tokens}} substituted.
 *
 * Resolution precedence (most-specific wins):
 *   1. Site-level value
 *   2. SiteGroup-level value
 *   3. Organization-level value
 *   4. Variable default_value
 *   5. Unresolved — token left as {{token}} and flagged
 */

import type {
  GlobalElementTemplate,
  PersistedVariableDefinition,
  VariableValue,
  ResolvedVariable,
  ResolutionContext,
  ResolvedTemplate,
  ResolutionChainEntry,
} from '../types/globalElements';
import type { VariableScope } from '../types/siteVariables';

// Matches {{token_name}} where token contains letters, numbers, underscores.
const TOKEN_REGEX = /\{\{([a-zA-Z0-9_]+)\}\}/g;

class TemplateResolverService {
  // -------------------------------------------------------------------------
  // Token extraction
  // -------------------------------------------------------------------------

  /**
   * Extract all unique {{token}} names from a config payload.
   * Recursively walks the JSON tree, finding tokens in string values.
   */
  extractTokens(payload: Record<string, unknown>): string[] {
    const tokens = new Set<string>();
    this._walkAndCollect(payload, tokens);
    return Array.from(tokens);
  }

  private _walkAndCollect(value: unknown, tokens: Set<string>): void {
    if (typeof value === 'string') {
      let match: RegExpExecArray | null;
      TOKEN_REGEX.lastIndex = 0;
      while ((match = TOKEN_REGEX.exec(value)) !== null) {
        tokens.add(match[1]);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        this._walkAndCollect(item, tokens);
      }
    } else if (value !== null && typeof value === 'object') {
      for (const v of Object.values(value as Record<string, unknown>)) {
        this._walkAndCollect(v, tokens);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Variable resolution
  // -------------------------------------------------------------------------

  /**
   * Build the resolved variable map for a given context.
   * For each definition, walks the scope chain and picks the most-specific value.
   */
  resolveVariables(
    definitions: PersistedVariableDefinition[],
    values: VariableValue[],
    context: ResolutionContext
  ): Map<string, ResolvedVariable> {
    const result = new Map<string, ResolvedVariable>();

    // Index values by (variable_id, scope_type, scope_id) for fast lookup
    const valueIndex = new Map<string, VariableValue>();
    for (const v of values) {
      valueIndex.set(`${v.variable_id}:${v.scope_type}:${v.scope_id}`, v);
    }

    for (const def of definitions) {
      const chain: ResolutionChainEntry[] = [];
      let resolvedValue: string | undefined;
      let resolvedFrom: VariableScope = 'organization';

      // Org level
      const orgVal = valueIndex.get(`${def.id}:organization:${context.org_id}`);
      chain.push({
        scope: 'organization',
        scope_id: context.org_id,
        scope_name: context.org_name ?? context.org_id,
        value: orgVal?.value,
        is_override: !!orgVal,
      });
      if (orgVal) {
        resolvedValue = orgVal.value;
        resolvedFrom = 'organization';
      }

      // SiteGroup level
      if (context.site_group_id) {
        const sgVal = valueIndex.get(`${def.id}:site_group:${context.site_group_id}`);
        chain.push({
          scope: 'site_group',
          scope_id: context.site_group_id,
          scope_name: context.site_group_name ?? context.site_group_id,
          value: sgVal?.value,
          is_override: !!sgVal,
        });
        if (sgVal) {
          resolvedValue = sgVal.value;
          resolvedFrom = 'site_group';
        }
      }

      // Site level
      if (context.site_id) {
        const siteVal = valueIndex.get(`${def.id}:site:${context.site_id}`);
        chain.push({
          scope: 'site',
          scope_id: context.site_id,
          scope_name: context.site_name ?? context.site_id,
          value: siteVal?.value,
          is_override: !!siteVal,
        });
        if (siteVal) {
          resolvedValue = siteVal.value;
          resolvedFrom = 'site';
        }
      }

      // Fallback to definition default
      const finalValue = resolvedValue ?? def.default_value ?? '';

      result.set(def.token, {
        token: def.token,
        value: finalValue,
        resolved_from: resolvedFrom,
        chain,
      });
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Token substitution
  // -------------------------------------------------------------------------

  /**
   * Substitute {{tokens}} in a payload with resolved values.
   * Handles type coercion for numeric variable types (number, vlan).
   */
  substituteTokens(
    payload: Record<string, unknown>,
    resolvedVars: Map<string, ResolvedVariable>,
    definitions: PersistedVariableDefinition[]
  ): { resolved: Record<string, unknown>; unresolvedTokens: string[] } {
    const defByToken = new Map(definitions.map(d => [d.token, d]));
    const unresolvedTokens = new Set<string>();
    const resolved = this._walkAndSubstitute(payload, resolvedVars, defByToken, unresolvedTokens);
    return {
      resolved: resolved as Record<string, unknown>,
      unresolvedTokens: Array.from(unresolvedTokens),
    };
  }

  private _walkAndSubstitute(
    value: unknown,
    resolvedVars: Map<string, ResolvedVariable>,
    defByToken: Map<string, PersistedVariableDefinition>,
    unresolvedTokens: Set<string>
  ): unknown {
    if (typeof value === 'string') {
      return this._substituteString(value, resolvedVars, defByToken, unresolvedTokens);
    }

    if (Array.isArray(value)) {
      return value.map(item =>
        this._walkAndSubstitute(item, resolvedVars, defByToken, unresolvedTokens)
      );
    }

    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        result[k] = this._walkAndSubstitute(v, resolvedVars, defByToken, unresolvedTokens);
      }
      return result;
    }

    // Primitives (number, boolean, null) pass through unchanged
    return value;
  }

  private _substituteString(
    str: string,
    resolvedVars: Map<string, ResolvedVariable>,
    defByToken: Map<string, PersistedVariableDefinition>,
    unresolvedTokens: Set<string>
  ): unknown {
    // Check if the entire string is a single token (enables numeric coercion)
    const singleTokenMatch = str.match(/^\{\{([a-zA-Z0-9_]+)\}\}$/);
    if (singleTokenMatch) {
      const token = singleTokenMatch[1];
      const resolved = resolvedVars.get(token);
      if (!resolved || resolved.value === '') {
        unresolvedTokens.add(token);
        return str; // Leave as {{token}}
      }
      return this._coerceValue(resolved.value, defByToken.get(token));
    }

    // String contains tokens mixed with literal text — always returns string
    const result = str.replace(TOKEN_REGEX, (_match, token: string) => {
      const resolved = resolvedVars.get(token);
      if (!resolved || resolved.value === '') {
        unresolvedTokens.add(token);
        return `{{${token}}}`;
      }
      return resolved.value;
    });
    return result;
  }

  /**
   * Coerce a string value based on the variable's declared type.
   * Returns a number for numeric types, otherwise returns the string.
   */
  private _coerceValue(
    value: string,
    def?: PersistedVariableDefinition
  ): string | number {
    if (!def) return value;

    if (def.type === 'number' || def.type === 'vlan') {
      const num = Number(value);
      if (!isNaN(num)) return num;
    }

    return value;
  }

  // -------------------------------------------------------------------------
  // Full resolution pipeline
  // -------------------------------------------------------------------------

  /**
   * Resolve a template: extract tokens → resolve variables → substitute → return result.
   */
  resolveTemplate(
    template: GlobalElementTemplate,
    definitions: PersistedVariableDefinition[],
    values: VariableValue[],
    context: ResolutionContext
  ): ResolvedTemplate {
    const resolvedVars = this.resolveVariables(definitions, values, context);
    const { resolved, unresolvedTokens } = this.substituteTokens(
      template.config_payload,
      resolvedVars,
      definitions
    );

    // Only include variables that are actually used in this template
    const usedTokens = this.extractTokens(template.config_payload);
    const usedVariables = usedTokens
      .map(t => resolvedVars.get(t))
      .filter((v): v is ResolvedVariable => v !== undefined);

    return {
      template,
      context,
      resolved_payload: resolved,
      variables: usedVariables,
      unresolved_tokens: unresolvedTokens,
      is_fully_resolved: unresolvedTokens.length === 0,
    };
  }

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  /**
   * Validate resolved variable values against their type constraints.
   */
  validateResolution(
    resolved: ResolvedTemplate,
    definitions: PersistedVariableDefinition[]
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const defByToken = new Map(definitions.map(d => [d.token, d]));

    for (const rv of resolved.variables) {
      const def = defByToken.get(rv.token);
      if (!def) continue;

      const val = rv.value;

      // Type-specific validation
      switch (def.type) {
        case 'vlan': {
          const num = Number(val);
          if (isNaN(num) || num < 1 || num > 4094) {
            errors.push(`Variable {{${rv.token}}}: VLAN must be 1–4094, got "${val}"`);
          }
          break;
        }
        case 'number': {
          const num = Number(val);
          if (isNaN(num)) {
            errors.push(`Variable {{${rv.token}}}: expected a number, got "${val}"`);
          }
          if (def.validation_rules?.min !== undefined && num < def.validation_rules.min) {
            errors.push(`Variable {{${rv.token}}}: value ${num} below minimum ${def.validation_rules.min}`);
          }
          if (def.validation_rules?.max !== undefined && num > def.validation_rules.max) {
            errors.push(`Variable {{${rv.token}}}: value ${num} above maximum ${def.validation_rules.max}`);
          }
          break;
        }
        case 'ip': {
          if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(val)) {
            errors.push(`Variable {{${rv.token}}}: invalid IP address "${val}"`);
          }
          break;
        }
        case 'subnet': {
          if (!/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(val)) {
            errors.push(`Variable {{${rv.token}}}: invalid subnet "${val}" (expected CIDR notation)`);
          }
          break;
        }
        case 'hostname': {
          if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*$/.test(val)) {
            errors.push(`Variable {{${rv.token}}}: invalid hostname "${val}"`);
          }
          break;
        }
      }

      // Regex pattern validation
      if (def.validation_rules?.pattern) {
        try {
          const re = new RegExp(def.validation_rules.pattern);
          if (!re.test(val)) {
            errors.push(`Variable {{${rv.token}}}: value "${val}" does not match pattern ${def.validation_rules.pattern}`);
          }
        } catch {
          // Invalid regex in definition — skip
        }
      }

      // Required check
      if (def.validation_rules?.required && !val) {
        errors.push(`Variable {{${rv.token}}} is required but has no value`);
      }
    }

    // Flag unresolved tokens
    for (const token of resolved.unresolved_tokens) {
      errors.push(`Token {{${token}}} is unresolved — no matching variable definition or value`);
    }

    return { valid: errors.length === 0, errors };
  }
}

/** Singleton instance. */
export const templateResolver = new TemplateResolverService();
