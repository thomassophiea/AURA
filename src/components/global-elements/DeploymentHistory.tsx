/**
 * DeploymentHistory — Shows past deployments and provides access to the batch pipeline.
 */

import { useState } from 'react';
import { Rocket, History, CheckCircle2, XCircle, SkipForward, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { DeploymentPipelineDialog } from './DeploymentPipelineDialog';
import { useDeploymentHistory } from '../../hooks/useDeployment';
import { useAppContext } from '../../contexts/AppContext';
import { GLOBAL_ELEMENT_TYPE_LABELS } from '../../types/globalElements';
import type {
  GlobalElementTemplate,
  GlobalElementType,
  PersistedVariableDefinition,
  VariableValue,
} from '../../types/globalElements';

interface Props {
  templates: GlobalElementTemplate[];
  definitions: PersistedVariableDefinition[];
  values: VariableValue[];
}

const STATUS_ICONS = {
  success: CheckCircle2,
  failed: XCircle,
  skipped: SkipForward,
  pending: RefreshCw,
  in_progress: RefreshCw,
};

const STATUS_VARIANTS: Record<string, 'success' | 'destructive' | 'secondary'> = {
  success: 'success',
  failed: 'destructive',
  skipped: 'secondary',
  pending: 'secondary',
  in_progress: 'secondary',
};

export function DeploymentHistory({ templates, definitions, values }: Props) {
  const { organization } = useAppContext();
  const orgId = organization?.id;
  const { records, loading, refresh } = useDeploymentHistory(orgId);

  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  return (
    <div className="space-y-6">
      {/* Pipeline launcher */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Deployment</CardTitle>
          <CardDescription>Deploy a template to multiple site groups</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Template</label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select template to deploy..." />
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
            <Button
              onClick={() => setPipelineOpen(true)}
              disabled={!selectedTemplate}
            >
              <Rocket className="h-4 w-4 mr-2" />
              Deploy to Multiple
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Deployment History</CardTitle>
              <CardDescription>{records.length} deployment{records.length !== 1 ? 's' : ''}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No deployments yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Deployed By</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map(r => {
                  const Icon = STATUS_ICONS[r.status] ?? RefreshCw;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.template_name ?? r.template_id}
                      </TableCell>
                      <TableCell>
                        {r.element_type && (
                          <Badge variant="secondary">
                            {GLOBAL_ELEMENT_TYPE_LABELS[r.element_type as GlobalElementType] ?? r.element_type}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{r.scope_name ?? r.scope_id}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[r.status] ?? 'secondary'}>
                          <Icon className="h-3 w-3 mr-1" />
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.deployed_by ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatTime(r.deployed_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pipeline Dialog */}
      {selectedTemplate && (
        <DeploymentPipelineDialog
          template={selectedTemplate}
          definitions={definitions}
          values={values}
          open={pipelineOpen}
          onOpenChange={setPipelineOpen}
          onComplete={refresh}
        />
      )}
    </div>
  );
}
