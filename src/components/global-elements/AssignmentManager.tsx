/**
 * AssignmentManager — Manage template-to-scope assignments.
 *
 * Shows all assignments for the org with create/delete/toggle controls.
 */

import { useState, useCallback } from 'react';
import { Plus, Trash2, Link2, Building2, Server, MapPin } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Label } from '../ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { useTemplateAssignments, useTemplates } from '../../hooks/useGlobalElements';
import { useAppContext } from '../../contexts/AppContext';
import { apiService } from '../../services/api';
import { GLOBAL_ELEMENT_TYPE_LABELS } from '../../types/globalElements';
import type { VariableScope } from '../../types/siteVariables';

const SCOPE_ICONS: Record<string, typeof Building2> = {
  organization: Building2,
  site_group: Server,
  site: MapPin,
};

export function AssignmentManager() {
  const { organization, siteGroups } = useAppContext();
  const orgId = organization?.id;
  const { templates } = useTemplates(orgId);
  const { assignments, assign, unassign, toggleActive } = useTemplateAssignments(orgId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [scopeType, setScopeType] = useState<VariableScope>('site_group');
  const [scopeId, setScopeId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sites fetched on demand when scope is 'site'
  const [sites, setSites] = useState<{ id: string; name: string; site_group_id: string }[]>([]);
  const [selectedSgForSites, setSelectedSgForSites] = useState('');

  const loadSitesForSg = useCallback(async (sgId: string) => {
    setSelectedSgForSites(sgId);
    setScopeId('');
    try {
      const sg = siteGroups.find(g => g.id === sgId);
      if (sg) {
        apiService.setBaseUrl(`${sg.controller_url}/management`);
        const data = await apiService.getSites();
        setSites((data || []).map((s: Record<string, unknown>) => ({
          id: String(s.id ?? s.siteId ?? ''),
          name: String(s.name ?? s.siteName ?? ''),
          site_group_id: sgId,
        })));
      }
    } catch {
      setSites([]);
    }
  }, [siteGroups]);

  const handleCreate = async () => {
    if (!orgId || !selectedTemplateId || !scopeId) return;
    setSubmitting(true);
    try {
      await assign({
        template_id: selectedTemplateId,
        scope_type: scopeType,
        scope_id: scopeId,
        is_active: true,
      });
      setDialogOpen(false);
      setSelectedTemplateId('');
      setScopeId('');
    } catch (err) {
      console.error('Failed to create assignment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this assignment?')) return;
    await unassign(id);
  };

  const getScopeName = (type: string, id: string): string => {
    if (type === 'organization') return organization?.name ?? id;
    if (type === 'site_group') return siteGroups.find(g => g.id === id)?.name ?? id;
    if (type === 'site') return sites.find(s => s.id === id)?.name ?? id;
    return id;
  };

  if (!orgId) {
    return <div className="text-center py-12 text-muted-foreground">No organization selected</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {assignments.length} assignment{assignments.length !== 1 ? 's' : ''}
        </h3>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Assign Template
        </Button>
      </div>

      {assignments.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Link2 className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No templates assigned yet</p>
          <p className="text-xs mt-1">Assign templates to site groups or sites for deployment</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.map(a => {
              const Icon = SCOPE_ICONS[a.scope_type] ?? Building2;
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.template_name ?? a.template_id}</TableCell>
                  <TableCell>
                    {a.element_type && (
                      <Badge variant="secondary">
                        {GLOBAL_ELEMENT_TYPE_LABELS[a.element_type as keyof typeof GLOBAL_ELEMENT_TYPE_LABELS] ?? a.element_type}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{a.scope_type.replace('_', ' ')}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{getScopeName(a.scope_type, a.scope_id)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={a.is_active}
                      onCheckedChange={(checked) => toggleActive(a.id, checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"
                      onClick={() => handleDelete(a.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Create Assignment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Template</DialogTitle>
            <DialogDescription>Assign a template to a scope for deployment</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({GLOBAL_ELEMENT_TYPE_LABELS[t.element_type]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Scope Level</Label>
              <Select value={scopeType} onValueChange={(v) => { setScopeType(v as VariableScope); setScopeId(''); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="organization">Organization</SelectItem>
                  <SelectItem value="site_group">Site Group</SelectItem>
                  <SelectItem value="site">Site</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scopeType === 'organization' && orgId && (
              <div className="text-sm text-muted-foreground">
                Scope: <strong>{organization?.name}</strong>
                {!scopeId && setScopeId(orgId) === undefined && null}
              </div>
            )}

            {scopeType === 'site_group' && (
              <div className="space-y-2">
                <Label>Site Group</Label>
                <Select value={scopeId} onValueChange={setScopeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select site group..." />
                  </SelectTrigger>
                  <SelectContent>
                    {siteGroups.map(sg => (
                      <SelectItem key={sg.id} value={sg.id}>{sg.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scopeType === 'site' && (
              <>
                <div className="space-y-2">
                  <Label>Site Group</Label>
                  <Select value={selectedSgForSites} onValueChange={loadSitesForSg}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select site group first..." />
                    </SelectTrigger>
                    <SelectContent>
                      {siteGroups.map(sg => (
                        <SelectItem key={sg.id} value={sg.id}>{sg.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedSgForSites && (
                  <div className="space-y-2">
                    <Label>Site</Label>
                    <Select value={scopeId} onValueChange={setScopeId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select site..." />
                      </SelectTrigger>
                      <SelectContent>
                        {sites.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={submitting || !selectedTemplateId || !scopeId}
              >
                {submitting ? 'Assigning...' : 'Assign'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
