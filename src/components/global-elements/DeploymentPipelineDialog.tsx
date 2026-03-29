/**
 * DeploymentPipelineDialog — Multi-step batch deployment dialog.
 *
 * Steps: Target Selection → Options → Execution → Results
 */

import { useState, useCallback } from 'react';
import { Rocket, CheckCircle2, XCircle, AlertTriangle, Loader2, SkipForward } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Progress } from '../ui/progress';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { useAppContext } from '../../contexts/AppContext';
import { deploymentPipeline } from '../../services/deploymentPipeline';
import type {
  GlobalElementTemplate,
  PersistedVariableDefinition,
  VariableValue,
} from '../../types/globalElements';
import type {
  DeploymentTarget,
  PipelineProgress,
  PipelineResult,
} from '../../types/deployment';

interface Props {
  template: GlobalElementTemplate;
  definitions: PersistedVariableDefinition[];
  values: VariableValue[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

type Step = 'targets' | 'options' | 'running' | 'results';

const STATUS_ICONS = {
  success: CheckCircle2,
  failed: XCircle,
  skipped: SkipForward,
  pending: Loader2,
  in_progress: Loader2,
};

const STATUS_COLORS = {
  success: 'text-green-600',
  failed: 'text-destructive',
  skipped: 'text-muted-foreground',
  pending: 'text-muted-foreground',
  in_progress: 'text-primary animate-spin',
};

export function DeploymentPipelineDialog({
  template,
  definitions,
  values,
  open,
  onOpenChange,
  onComplete,
}: Props) {
  const { siteGroups } = useAppContext();

  const [step, setStep] = useState<Step>('targets');
  const [selectedSgIds, setSelectedSgIds] = useState<Set<string>>(new Set());
  const [stopOnFailure, setStopOnFailure] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);

  const toggleSg = (id: string) => {
    setSelectedSgIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedSgIds.size === siteGroups.length) {
      setSelectedSgIds(new Set());
    } else {
      setSelectedSgIds(new Set(siteGroups.map(sg => sg.id)));
    }
  };

  const handleRun = useCallback(async () => {
    setStep('running');
    setProgress(null);
    setResult(null);

    const targets: DeploymentTarget[] = siteGroups
      .filter(sg => selectedSgIds.has(sg.id))
      .map(sg => ({
        scope_type: 'site_group' as const,
        scope_id: sg.id,
        scope_name: sg.name,
        site_group: sg,
      }));

    const pipelineResult = await deploymentPipeline.executePipeline(
      template,
      definitions,
      values,
      targets,
      { stop_on_failure: stopOnFailure, dry_run: dryRun },
      (p) => setProgress({ ...p })
    );

    setResult(pipelineResult);
    setStep('results');
    onComplete?.();
  }, [template, definitions, values, siteGroups, selectedSgIds, stopOnFailure, dryRun, onComplete]);

  const handleClose = () => {
    if (step === 'running') {
      deploymentPipeline.cancel();
    }
    setStep('targets');
    setResult(null);
    setProgress(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'targets' && 'Select Targets'}
            {step === 'options' && 'Deployment Options'}
            {step === 'running' && (dryRun ? 'Dry Run in Progress...' : 'Deploying...')}
            {step === 'results' && 'Deployment Complete'}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Target Selection */}
        {step === 'targets' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Deploy <strong>{template.name}</strong> to selected site groups.
            </p>

            <div className="flex items-center gap-2 pb-2 border-b">
              <Checkbox
                checked={selectedSgIds.size === siteGroups.length}
                onCheckedChange={selectAll}
              />
              <span className="text-sm font-medium">Select All ({siteGroups.length})</span>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {siteGroups.map(sg => (
                <label key={sg.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer">
                  <Checkbox
                    checked={selectedSgIds.has(sg.id)}
                    onCheckedChange={() => toggleSg(sg.id)}
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium">{sg.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">{sg.controller_url}</span>
                  </div>
                  <Badge variant={sg.connection_status === 'connected' ? 'success' : 'secondary'} className="text-xs">
                    {sg.connection_status}
                  </Badge>
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => setStep('options')} disabled={selectedSgIds.size === 0}>
                Next ({selectedSgIds.size} selected)
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Options */}
        {step === 'options' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Stop on Failure</Label>
                <p className="text-xs text-muted-foreground">Skip remaining targets if one fails</p>
              </div>
              <Switch checked={stopOnFailure} onCheckedChange={setStopOnFailure} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Dry Run</Label>
                <p className="text-xs text-muted-foreground">Validate without pushing to controllers</p>
              </div>
              <Switch checked={dryRun} onCheckedChange={setDryRun} />
            </div>

            <div className="border rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Template</span>
                <span className="font-medium">{template.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Targets</span>
                <span>{selectedSgIds.size} site group{selectedSgIds.size !== 1 ? 's' : ''}</span>
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep('targets')}>Back</Button>
              <Button onClick={handleRun}>
                <Rocket className="h-4 w-4 mr-2" />
                {dryRun ? 'Start Dry Run' : 'Deploy'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Running */}
        {step === 'running' && progress && (
          <div className="space-y-4">
            <Progress value={(progress.completed / progress.total) * 100} />
            <p className="text-sm text-center">
              {progress.completed} / {progress.total} completed
              {progress.current_target && (
                <span className="text-muted-foreground"> — {progress.current_target.scope_name}</span>
              )}
            </p>

            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {progress.results.map((r, i) => {
                const Icon = STATUS_ICONS[r.status];
                return (
                  <div key={i} className="flex items-center gap-2 text-sm py-1">
                    <Icon className={`h-4 w-4 ${STATUS_COLORS[r.status]}`} />
                    <span>{r.scope_name}</span>
                    {r.error_message && (
                      <span className="text-xs text-destructive truncate ml-auto max-w-[200px]">{r.error_message}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 4: Results */}
        {step === 'results' && result && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="border rounded-lg p-3">
                <div className="text-2xl font-bold text-green-600">{result.succeeded}</div>
                <div className="text-xs text-muted-foreground">Succeeded</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-2xl font-bold text-destructive">{result.failed}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-2xl font-bold text-muted-foreground">{result.skipped}</div>
                <div className="text-xs text-muted-foreground">Skipped</div>
              </div>
            </div>

            {/* Per-target results */}
            <div className="space-y-1 max-h-[250px] overflow-y-auto">
              {result.results.map((r, i) => {
                const Icon = STATUS_ICONS[r.status];
                return (
                  <div key={i} className="flex items-start gap-2 text-sm py-1.5 border-b last:border-0">
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${STATUS_COLORS[r.status]}`} />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{r.scope_name}</span>
                      {r.error_message && (
                        <p className="text-xs text-destructive mt-0.5">{r.error_message}</p>
                      )}
                    </div>
                    <Badge variant={r.status === 'success' ? 'success' : r.status === 'failed' ? 'destructive' : 'secondary'} className="text-xs shrink-0">
                      {r.status}
                    </Badge>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleClose}>Close</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
