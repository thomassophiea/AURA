/**
 * VariableManagement — Two-panel layout for managing variable definitions and values.
 *
 * Left panel: variable definitions table with CRUD.
 * Right panel: scope-aware value editor for the selected variable.
 */

import { useState, useCallback } from 'react';
import { Upload, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { VariableDefinitionTable } from './VariableDefinitionTable';
import { VariableScopeEditor } from './VariableScopeEditor';
import { useVariableDefinitions, useVariableValues } from '../../hooks/useGlobalElements';
import { useAppContext } from '../../contexts/AppContext';
import { globalElementsService } from '../../services/globalElementsService';
import type { PersistedVariableDefinition } from '../../types/globalElements';
import { apiService } from '../../services/api';

export function VariableManagement() {
  const { organization, siteGroups, siteGroup } = useAppContext();
  const orgId = organization?.id;
  const {
    definitions, createDefinition, updateDefinition, deleteDefinition,
  } = useVariableDefinitions(orgId);
  const {
    values, setValue, deleteValue,
  } = useVariableValues(orgId);

  const [selectedVariable, setSelectedVariable] = useState<PersistedVariableDefinition | null>(null);

  // Fetch sites from the active controller
  const [sites, setSites] = useState<{ id: string; name: string; site_group_id: string }[]>([]);
  const [sitesLoaded, setSitesLoaded] = useState(false);

  const loadSites = useCallback(async () => {
    if (sitesLoaded || !siteGroup) return;
    try {
      const siteData = await apiService.getSites();
      setSites(
        (siteData || []).map((s: Record<string, unknown>) => ({
          id: String(s.id ?? s.siteId ?? ''),
          name: String(s.name ?? s.siteName ?? ''),
          site_group_id: siteGroup.id,
        }))
      );
    } catch {
      // Sites not available — scope editor will just show org + siteGroup levels
    }
    setSitesLoaded(true);
  }, [siteGroup, sitesLoaded]);

  // Load sites when a variable is selected
  const handleSelectVariable = (def: PersistedVariableDefinition) => {
    setSelectedVariable(def);
    loadSites();
  };

  // CSV export
  const handleExport = () => {
    const csv = globalElementsService.exportVariablesCsv(definitions, values);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'variables.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // CSV import
  const handleImport = () => {
    if (!orgId) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const result = globalElementsService.parseCsvImport(
        text,
        definitions,
        orgId,
        'organization',
        orgId
      );
      if (result.errors.length > 0) {
        alert(`Import warnings:\n${result.errors.join('\n')}`);
      }
      if (result.values.length > 0) {
        await globalElementsService.bulkSetVariableValues(result.values);
        // Trigger refresh in the values hook by setting a value (will cause refetch)
        window.location.reload();
      }
    };
    input.click();
  };

  if (!orgId) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No organization selected</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Left Panel: Variable Definitions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Variable Definitions</CardTitle>
              <CardDescription>Define variables for use in configuration templates</CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={handleImport} title="Import CSV">
                <Upload className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleExport} title="Export CSV" disabled={definitions.length === 0}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <VariableDefinitionTable
            definitions={definitions}
            orgId={orgId}
            onCreateDefinition={createDefinition}
            onUpdateDefinition={updateDefinition}
            onDeleteDefinition={deleteDefinition}
            onSelectVariable={handleSelectVariable}
            selectedVariableId={selectedVariable?.id}
          />
        </CardContent>
      </Card>

      {/* Right Panel: Scope Value Editor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scope Values</CardTitle>
          <CardDescription>
            {selectedVariable
              ? `Set values for {{${selectedVariable.token}}} at each scope level`
              : 'Select a variable to configure scope values'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedVariable ? (
            <VariableScopeEditor
              variable={selectedVariable}
              values={values.filter(v => v.variable_id === selectedVariable.id)}
              orgId={orgId}
              orgName={organization?.name ?? 'Organization'}
              siteGroups={siteGroups}
              sites={sites}
              onSetValue={setValue}
              onDeleteValue={deleteValue}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Select a variable from the left panel</p>
              <p className="text-xs mt-1">Then set values at org, site group, or site level</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
