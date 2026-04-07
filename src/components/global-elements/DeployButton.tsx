/**
 * DeployButton — Confirmation dialog + deploy action for a resolved template.
 */

import { useState } from 'react';
import { Rocket, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { useDeployTemplate } from '../../hooks/useDeployment';
import type {
  GlobalElementTemplate,
  PersistedVariableDefinition,
  VariableValue,
  ResolutionContext,
  ResolvedTemplate,
} from '../../types/globalElements';
import type { SiteGroup } from '../../types/domain';

interface Props {
  template: GlobalElementTemplate;
  resolved: ResolvedTemplate;
  definitions: PersistedVariableDefinition[];
  values: VariableValue[];
  context: ResolutionContext;
  siteGroup: SiteGroup;
  disabled?: boolean;
}

export function DeployButton({
  template,
  resolved,
  definitions,
  values,
  context,
  siteGroup,
  disabled,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { deploy, isDeploying, result } = useDeployTemplate();

  const handleDeploy = async () => {
    await deploy(template, definitions, values, context, siteGroup, context.org_id);
  };

  const isSuccess = result?.status === 'success';
  const isFailed = result?.status === 'failed';

  return (
    <>
      <Button
        size="sm"
        onClick={() => setDialogOpen(true)}
        disabled={disabled || !resolved.is_fully_resolved}
      >
        <Rocket className="h-4 w-4 mr-2" />
        Deploy
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Deploy Template</DialogTitle>
            <DialogDescription>
              Push resolved configuration to the controller
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Summary */}
            <div className="border rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Template</span>
                <span className="font-medium">{template.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <Badge variant="secondary">{template.element_type}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Controller</span>
                <span className="font-mono text-xs">{siteGroup.controller_url}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Site Group</span>
                <span>{siteGroup.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Variables</span>
                <span>{resolved.variables.length} resolved</span>
              </div>
            </div>

            {/* Resolved preview */}
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Resolved Payload</span>
              <pre className="bg-muted rounded p-3 text-xs font-mono overflow-x-auto max-h-[200px]">
                {JSON.stringify(resolved.resolved_payload, null, 2)}
              </pre>
            </div>

            {/* Result */}
            {isSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
                <CheckCircle2 className="h-4 w-4" />
                Deployed successfully
              </div>
            )}

            {isFailed && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{result?.error_message ?? 'Deployment failed'}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {result ? 'Close' : 'Cancel'}
              </Button>
              {!result && (
                <Button onClick={handleDeploy} disabled={isDeploying}>
                  {isDeploying ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deploying...</>
                  ) : (
                    <><Rocket className="h-4 w-4 mr-2" /> Confirm Deploy</>
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
