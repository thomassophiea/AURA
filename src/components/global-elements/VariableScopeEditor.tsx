/**
 * VariableScopeEditor — Set variable values at different scope levels.
 *
 * Shows the inheritance chain: org → siteGroup → site, with the ability
 * to set or clear overrides at each level.
 */

import { useState, useMemo } from 'react';
import { Check, ArrowDown, Building2, Server, MapPin } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import type { PersistedVariableDefinition, VariableValue } from '../../types/globalElements';
import type { SiteGroup, Site } from '../../types/domain';

interface Props {
  variable: PersistedVariableDefinition;
  values: VariableValue[];
  orgId: string;
  orgName: string;
  siteGroups: SiteGroup[];
  sites: Site[];
  onSetValue: (value: Omit<VariableValue, 'id' | 'updated_at'>) => Promise<unknown>;
  onDeleteValue: (id: string) => Promise<unknown>;
}

interface ScopeRow {
  scope_type: 'organization' | 'site_group' | 'site';
  scope_id: string;
  scope_name: string;
  icon: typeof Building2;
  indent: number;
  currentValue?: VariableValue;
}

export function VariableScopeEditor({
  variable,
  values,
  orgId,
  orgName,
  siteGroups,
  sites,
  onSetValue,
  onDeleteValue,
}: Props) {
  const [editingScope, setEditingScope] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Build scope rows: org → each siteGroup → each site under that siteGroup
  const scopeRows = useMemo<ScopeRow[]>(() => {
    const rows: ScopeRow[] = [];
    const valMap = new Map(values.map(v => [`${v.scope_type}:${v.scope_id}`, v]));

    // Org level
    rows.push({
      scope_type: 'organization',
      scope_id: orgId,
      scope_name: orgName,
      icon: Building2,
      indent: 0,
      currentValue: valMap.get(`organization:${orgId}`),
    });

    for (const sg of siteGroups) {
      rows.push({
        scope_type: 'site_group',
        scope_id: sg.id,
        scope_name: sg.name,
        icon: Server,
        indent: 1,
        currentValue: valMap.get(`site_group:${sg.id}`),
      });

      const sgSites = sites.filter(s => s.site_group_id === sg.id);
      for (const site of sgSites) {
        rows.push({
          scope_type: 'site',
          scope_id: site.id,
          scope_name: site.name,
          icon: MapPin,
          indent: 2,
          currentValue: valMap.get(`site:${site.id}`),
        });
      }
    }

    return rows;
  }, [values, orgId, orgName, siteGroups, sites]);

  const startEdit = (row: ScopeRow) => {
    const key = `${row.scope_type}:${row.scope_id}`;
    setEditingScope(key);
    setEditValue(row.currentValue?.value ?? '');
  };

  const saveValue = async (row: ScopeRow) => {
    setSaving(true);
    try {
      if (editValue.trim()) {
        await onSetValue({
          org_id: orgId,
          variable_id: variable.id,
          scope_type: row.scope_type,
          scope_id: row.scope_id,
          value: editValue.trim(),
          source_type: 'override',
        });
      } else if (row.currentValue) {
        await onDeleteValue(row.currentValue.id);
      }
      setEditingScope(null);
    } catch (err) {
      console.error('Failed to save variable value:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, row: ScopeRow) => {
    if (e.key === 'Enter') saveValue(row);
    if (e.key === 'Escape') setEditingScope(null);
  };

  // Resolve the "effective" value at each scope level
  const resolveEffective = (row: ScopeRow): { value: string; from: string } => {
    if (row.currentValue) {
      return { value: row.currentValue.value, from: row.scope_name };
    }

    // Walk up the hierarchy
    if (row.scope_type === 'site') {
      const parentSg = scopeRows.find(
        r => r.scope_type === 'site_group' && sites.find(s => s.id === row.scope_id)?.site_group_id === r.scope_id
      );
      if (parentSg?.currentValue) return { value: parentSg.currentValue.value, from: parentSg.scope_name };
    }
    if (row.scope_type === 'site' || row.scope_type === 'site_group') {
      const orgRow = scopeRows.find(r => r.scope_type === 'organization');
      if (orgRow?.currentValue) return { value: orgRow.currentValue.value, from: orgRow.scope_name };
    }

    if (variable.default_value) return { value: variable.default_value, from: 'default' };
    return { value: '', from: '' };
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <code className="text-sm bg-muted px-2 py-1 rounded font-mono">{`{{${variable.token}}}`}</code>
        <span className="text-sm text-muted-foreground">—</span>
        <span className="text-sm text-muted-foreground">{variable.description || variable.name}</span>
        <Badge variant="secondary" className="ml-auto">{variable.type}</Badge>
      </div>

      {variable.default_value && (
        <div className="text-xs text-muted-foreground mb-2">
          Default value: <code className="bg-muted px-1 rounded">{variable.default_value}</code>
        </div>
      )}

      <div className="border rounded-lg divide-y">
        {scopeRows.map((row) => {
          const key = `${row.scope_type}:${row.scope_id}`;
          const isEditing = editingScope === key;
          const effective = resolveEffective(row);
          const Icon = row.icon;
          const hasOwnValue = !!row.currentValue;

          return (
            <div key={key} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
              style={{ paddingLeft: `${16 + row.indent * 24}px` }}
            >
              {row.indent > 0 && (
                <ArrowDown className="h-3 w-3 text-muted-foreground/40 -ml-4" />
              )}
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm min-w-[120px]">{row.scope_name}</span>

              {isEditing ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => handleKeyDown(e, row)}
                    placeholder={effective.value || 'Enter value...'}
                    className="h-7 text-sm flex-1 max-w-[200px]"
                    autoFocus
                    disabled={saving}
                  />
                  <Button size="sm" className="h-7 px-2" onClick={() => saveValue(row)} disabled={saving}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingScope(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div
                  className="flex items-center gap-2 flex-1 cursor-pointer group"
                  onClick={() => startEdit(row)}
                >
                  {hasOwnValue ? (
                    <code className="text-sm bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                      {row.currentValue!.value}
                    </code>
                  ) : effective.value ? (
                    <span className="text-sm text-muted-foreground italic">
                      {effective.value}
                      <span className="text-xs ml-1">← {effective.from}</span>
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground/50 group-hover:text-muted-foreground">
                      Click to set value...
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
