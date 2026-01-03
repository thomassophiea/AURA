/**
 * Reconciliation Dialog Component
 *
 * Shows reconciliation results, detects mismatches, and provides remediation actions.
 * Compares expected WLAN assignments with actual API state.
 */

import { useState } from 'react';
import { DetailSlideOut } from '../DetailSlideOut';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { ScrollArea } from '../ui/scroll-area';
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  XCircle,
  RefreshCw,
  Wrench,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { wlanReconciliationService } from '../../services/wlanReconciliation';
import type { ReconciliationResult, RemediationAction } from '../../types/network';

interface ReconciliationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wlanId: string;
  wlanName: string;
}

export function ReconciliationDialog({
  open,
  onOpenChange,
  wlanId,
  wlanName
}: ReconciliationDialogProps) {
  const [reconciling, setReconciling] = useState(false);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [remediating, setRemediating] = useState(false);
  const [remediationActions, setRemediationActions] = useState<RemediationAction[]>([]);

  const runReconciliation = async () => {
    setReconciling(true);
    setResult(null);
    try {
      const reconciliationResult = await wlanReconciliationService.reconcileWLAN(wlanId);
      setResult(reconciliationResult);

      if (reconciliationResult.mismatched === 0) {
        toast.success('Reconciliation Complete', {
          description: `All ${reconciliationResult.totalExpected} profile assignments match expectations`
        });
      } else {
        toast.warning('Mismatches Detected', {
          description: `Found ${reconciliationResult.mismatched} mismatch(es) that need attention`
        });

        // Generate remediation actions
        const actions = wlanReconciliationService.generateRemediationActions(
          reconciliationResult.mismatches
        );
        setRemediationActions(actions);
      }
    } catch (error) {
      console.error('[ReconciliationDialog] Reconciliation failed:', error);
      toast.error('Reconciliation Failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setReconciling(false);
    }
  };

  const executeRemediation = async () => {
    if (remediationActions.length === 0) return;

    setRemediating(true);
    try {
      const { successful, failed } = await wlanReconciliationService.executeRemediation(
        remediationActions
      );

      if (failed === 0) {
        toast.success('Remediation Complete', {
          description: `Fixed ${successful} mismatch(es) successfully`
        });
        // Re-run reconciliation to verify
        await runReconciliation();
      } else {
        toast.warning('Remediation Partially Complete', {
          description: `Fixed ${successful}, failed ${failed}`
        });
        // Re-run reconciliation to see updated state
        await runReconciliation();
      }
    } catch (error) {
      console.error('[ReconciliationDialog] Remediation failed:', error);
      toast.error('Remediation Failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setRemediating(false);
    }
  };

  const getMismatchBadge = (mismatch: string) => {
    switch (mismatch) {
      case 'MISSING_ASSIGNMENT':
        return <Badge variant="destructive" className="text-xs">Missing</Badge>;
      case 'UNEXPECTED_ASSIGNMENT':
        return <Badge variant="outline" className="text-xs">Unexpected</Badge>;
      case 'SYNC_FAILED':
        return <Badge variant="secondary" className="text-xs">Sync Failed</Badge>;
      case 'PROFILE_DELETED':
        return <Badge variant="outline" className="text-xs">Deleted</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">{mismatch}</Badge>;
    }
  };

  return (
    <DetailSlideOut
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title={`WLAN Reconciliation - ${wlanName}`}
      description="Compare expected vs actual WLAN assignments and fix mismatches"
      width="xl"
    >
      <div className="space-y-6">
          {/* Run Reconciliation Button */}
          {!result && (
            <div className="text-center py-8">
              <Button
                onClick={runReconciliation}
                disabled={reconciling}
                size="lg"
              >
                {reconciling ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Running Reconciliation...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Run Reconciliation
                  </>
                )}
              </Button>
              <p className="text-sm text-muted-foreground mt-2">
                This will check all profile assignments against actual API state
              </p>
            </div>
          )}

          {/* Loading State */}
          {reconciling && (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Checking profile assignments...</p>
            </div>
          )}

          {/* Results */}
          {result && !reconciling && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-muted-foreground">Expected</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{result.totalExpected}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-muted-foreground">Actual</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{result.totalActual}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-green-600">Matched</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{result.matched}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-destructive">Mismatched</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-destructive">{result.mismatched}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Status Alert */}
              {result.mismatched === 0 ? (
                <Alert className="border-green-600/20 bg-green-50 dark:bg-green-900/10">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800 dark:text-green-200">
                    All profile assignments match expectations. No action needed.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Found {result.mismatched} mismatch(es) that need attention.
                    {remediationActions.length > 0 && (
                      <span className="ml-1">
                        {remediationActions.length} remediation action(s) available.
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Mismatch List */}
              {result.mismatches.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Mismatches Detected
                    </CardTitle>
                    <CardDescription>
                      Profiles with incorrect assignment state
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-[300px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Profile</TableHead>
                            <TableHead>Expected</TableHead>
                            <TableHead>Actual</TableHead>
                            <TableHead>Reason</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.mismatches.map((mismatch) => (
                            <TableRow key={mismatch.profileId}>
                              <TableCell className="font-medium">
                                {mismatch.profileName}
                              </TableCell>
                              <TableCell>
                                <Badge variant={mismatch.expectedState === 'ASSIGNED' ? "default" : "outline"}>
                                  {mismatch.expectedState}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant={mismatch.actualState === 'ASSIGNED' ? "default" : "outline"}>
                                  {mismatch.actualState}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {mismatch.mismatch && getMismatchBadge(mismatch.mismatch)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Remediation Actions */}
              {remediationActions.length > 0 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    {remediationActions.length} remediation action(s) ready
                  </div>
                  <Button
                    onClick={executeRemediation}
                    disabled={remediating}
                    variant="default"
                  >
                    {remediating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Fixing...
                      </>
                    ) : (
                      <>
                        <Wrench className="h-4 w-4 mr-2" />
                        Fix All Mismatches
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Re-run Reconciliation */}
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={runReconciliation}
                  disabled={reconciling}
                  size="sm"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Re-run Reconciliation
                </Button>
              </div>
            </>
          )}
      </div>
    </DetailSlideOut>
  );
}
