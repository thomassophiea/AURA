/**
 * ResolutionPreview — Preview how a template resolves at different scope levels.
 *
 * Shows the resolved config payload side-by-side with the inheritance chain.
 */

import { useState, useMemo } from 'react';
import { Eye, AlertTriangle, CheckCircle2, ChevronRight, Rocket } from 'lucide-react';
import { DeployButton } from './DeployButton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { useAppContext } from '../../contexts/AppContext';
import { useResolvedTemplate } from '../../hooks/useGlobalElements';
import { templateResolver } from '../../services/templateResolver';
import type {
  GlobalElementTemplate,
  PersistedVariableDefinition,
  VariableValue,
  ResolutionContext,
} from '../../types/globalElements';

interface Props {
  templates: GlobalElementTemplate[];
  definitions: PersistedVariableDefinition[];
  values: VariableValue[];
}

export function ResolutionPreview({ templates, definitions, values }: Props) {
  const { organization, siteGroups } = useAppContext();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedSiteGroupId, setSelectedSiteGroupId] = useState<string>('');

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) ?? null;

  const context = useMemo<ResolutionContext | null>(() => {
    if (!organization) return null;
    const sg = siteGroups.find(g => g.id === selectedSiteGroupId);
    return {
      org_id: organization.id,
      org_name: organization.name,
      site_group_id: sg?.id,
      site_group_name: sg?.name,
    };
  }, [organization, siteGroups, selectedSiteGroupId]);

  const resolved = useResolvedTemplate(selectedTemplate, definitions, values, context);

  const validation = useMemo(() => {
    if (!resolved) return null;
    return templateResolver.validateResolution(resolved, definitions);
  }, [resolved, definitions]);

  if (!organization) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No organization selected</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Scope Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Template</label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <ChevronRight className="h-5 w-5 text-muted-foreground mb-2.5" />
            </div>

            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Resolve at Site Group</label>
              <Select value={selectedSiteGroupId} onValueChange={setSelectedSiteGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Organization level (no override)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Organization level only</SelectItem>
                  {siteGroups.map(sg => (
                    <SelectItem key={sg.id} value={sg.id}>
                      {sg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectedTemplate && (
        <div className="text-center py-12 text-muted-foreground">
          <Eye className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Select a template to preview resolution</p>
        </div>
      )}

      {resolved && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Resolved Config */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Resolved Configuration</CardTitle>
                <div className="flex items-center gap-2">
                  {selectedTemplate && resolved && context && selectedSiteGroupId && selectedSiteGroupId !== '__none__' && (
                    (() => {
                      const sg = siteGroups.find(g => g.id === selectedSiteGroupId);
                      return sg ? (
                        <DeployButton
                          template={selectedTemplate}
                          resolved={resolved}
                          definitions={definitions}
                          values={values}
                          context={context}
                          siteGroup={sg}
                          disabled={!validation?.valid}
                        />
                      ) : null;
                    })()
                  )}
                {validation && (
                  <Badge variant={validation.valid ? 'success' : 'warning'}>
                    {validation.valid ? (
                      <><CheckCircle2 className="h-3 w-3 mr-1" /> Valid</>
                    ) : (
                      <><AlertTriangle className="h-3 w-3 mr-1" /> {validation.errors.length} issue{validation.errors.length !== 1 ? 's' : ''}</>
                    )}
                  </Badge>
                )}
                </div>
              </div>
              <CardDescription>
                {resolved.is_fully_resolved
                  ? 'All variables resolved successfully'
                  : `${resolved.unresolved_tokens.length} unresolved token${resolved.unresolved_tokens.length !== 1 ? 's' : ''}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted rounded-lg p-4 text-sm font-mono overflow-x-auto max-h-[500px] whitespace-pre-wrap">
                {JSON.stringify(resolved.resolved_payload, null, 2)}
              </pre>

              {validation && !validation.valid && (
                <div className="mt-4 space-y-1">
                  {validation.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Inheritance Chain */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Variable Resolution</CardTitle>
              <CardDescription>Where each variable value comes from</CardDescription>
            </CardHeader>
            <CardContent>
              {resolved.variables.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No variables used in this template
                </p>
              ) : (
                <div className="space-y-4">
                  {resolved.variables.map(rv => (
                    <div key={rv.token} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">
                          {`{{${rv.token}}}`}
                        </code>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {rv.resolved_from}
                          </Badge>
                          <span className="text-sm font-medium">{rv.value}</span>
                        </div>
                      </div>

                      {/* Chain visualization */}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {rv.chain.map((entry, i) => (
                          <span key={i} className="flex items-center gap-1">
                            {i > 0 && <ChevronRight className="h-3 w-3" />}
                            <span className={entry.is_override ? 'text-primary font-medium' : ''}>
                              {entry.scope_name}: {entry.value ?? '—'}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}

                  {resolved.unresolved_tokens.length > 0 && (
                    <div className="border border-destructive/30 rounded-lg p-3">
                      <p className="text-sm font-medium text-destructive mb-2">Unresolved Tokens</p>
                      <div className="flex flex-wrap gap-1">
                        {resolved.unresolved_tokens.map(token => (
                          <Badge key={token} variant="destructive" className="text-xs">
                            {`{{${token}}}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
