/**
 * DriftDetection — Shows drift status between org-level templates
 * and live controller state. Provides one-click re-deploy for drifted items.
 */

import { useState } from 'react';
import {
  CheckCircle2, AlertTriangle, XCircle, HelpCircle, RefreshCw, Rocket,
  ChevronDown, ChevronUp, Server,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { useDriftDetection } from '../../hooks/useDriftDetection';
import { GLOBAL_ELEMENT_TYPE_LABELS } from '../../types/globalElements';
import type {
  GlobalElementTemplate,
  PersistedVariableDefinition,
  VariableValue,
  TemplateAssignment,
} from '../../types/globalElements';
import type { SiteGroup } from '../../types/domain';
import type { DriftCheckResult, DriftStatus } from '../../types/deployment';

interface Props {
  templates: GlobalElementTemplate[];
  definitions: PersistedVariableDefinition[];
  values: VariableValue[];
  assignments: TemplateAssignment[];
  siteGroups: SiteGroup[];
  onRedeploy?: (templateId: string) => void;
}

const STATUS_CONFIG: Record<DriftStatus, { icon: typeof CheckCircle2; label: string; variant: 'success' | 'destructive' | 'secondary' | 'outline' }> = {
  in_sync: { icon: CheckCircle2, label: 'In Sync', variant: 'success' },
  drifted: { icon: AlertTriangle, label: 'Drifted', variant: 'destructive' },
  missing: { icon: XCircle, label: 'Missing', variant: 'destructive' },
  unknown: { icon: HelpCircle, label: 'Unknown', variant: 'secondary' },
  error: { icon: XCircle, label: 'Error', variant: 'outline' },
};

export function DriftDetection({ templates, definitions, values, assignments, siteGroups, onRedeploy }: Props) {
  const { summary, loading, error, checkAll } = useDriftDetection(
    templates, definitions, values, assignments, siteGroups
  );

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Drift Detection</CardTitle>
              <CardDescription>
                Compare deployed templates against live controller state
              </CardDescription>
            </div>
            <Button onClick={checkAll} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Checking...' : 'Run Drift Check'}
            </Button>
          </div>
        </CardHeader>
        {summary && (
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="In Sync" count={summary.in_sync} variant="success" />
              <StatCard label="Drifted" count={summary.drifted} variant="warning" />
              <StatCard label="Missing" count={summary.missing} variant="error" />
              <StatCard label="Errors" count={summary.errors} variant="muted" />
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Last checked: {new Date(summary.checked_at).toLocaleString()}
            </p>
          </CardContent>
        )}
      </Card>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Results */}
      {summary && summary.results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Results ({summary.total})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Site Group</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Diffs</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.results.map((result, idx) => (
                  <DriftResultRow
                    key={`${result.template_id}-${result.scope_id}-${idx}`}
                    result={result}
                    onRedeploy={onRedeploy}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!summary && !loading && (
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium">No drift data</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Click "Run Drift Check" to compare templates against live controller state.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, count, variant }: { label: string; count: number; variant: 'success' | 'warning' | 'error' | 'muted' }) {
  const colors = {
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
    muted: 'text-muted-foreground',
  };

  return (
    <div className="text-center p-3 rounded-lg bg-muted/30">
      <p className={`text-2xl font-bold ${colors[variant]}`}>{count}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function DriftResultRow({ result, onRedeploy }: { result: DriftCheckResult; onRedeploy?: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const config = STATUS_CONFIG[result.status];
  const StatusIcon = config.icon;

  return (
    <>
      <TableRow className={result.status === 'drifted' ? 'bg-destructive/5' : ''}>
        <TableCell className="font-medium">{result.template_name}</TableCell>
        <TableCell>
          <Badge variant="secondary" className="text-xs">
            {GLOBAL_ELEMENT_TYPE_LABELS[result.element_type] ?? result.element_type}
          </Badge>
        </TableCell>
        <TableCell>
          <span className="flex items-center gap-1 text-sm">
            <Server className="h-3 w-3" />
            {result.scope_name}
          </span>
        </TableCell>
        <TableCell>
          <Badge variant={config.variant} className="text-xs flex items-center gap-1 w-fit">
            <StatusIcon className="h-3 w-3" />
            {config.label}
          </Badge>
        </TableCell>
        <TableCell>
          {result.diffs.length > 0 ? (
            <Collapsible open={expanded} onOpenChange={setExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                  {result.diffs.length} field{result.diffs.length !== 1 ? 's' : ''}
                  {expanded ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          ) : result.error_message ? (
            <span className="text-xs text-muted-foreground">{result.error_message}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {(result.status === 'drifted' || result.status === 'missing') && onRedeploy && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onRedeploy(result.template_id)}>
              <Rocket className="h-3 w-3 mr-1" />
              Re-deploy
            </Button>
          )}
        </TableCell>
      </TableRow>
      {expanded && result.diffs.length > 0 && (
        <TableRow>
          <TableCell colSpan={6} className="p-0">
            <div className="bg-muted/20 p-3 space-y-1">
              {result.diffs.map((diff, i) => (
                <div key={i} className="font-mono text-xs flex flex-col sm:grid sm:grid-cols-3 gap-0.5 sm:gap-2 py-1.5 border-b border-border/50 last:border-0">
                  <span className="text-muted-foreground font-semibold sm:font-normal truncate">{diff.path}</span>
                  <span className="text-emerald-400 truncate">expected: {formatValue(diff.expected)}</span>
                  <span className="text-red-400 truncate">actual: {formatValue(diff.actual)}</span>
                </div>
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function formatValue(val: unknown): string {
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  if (typeof val === 'string') return `"${val}"`;
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}
