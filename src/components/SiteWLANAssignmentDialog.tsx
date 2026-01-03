import { useState, useEffect } from 'react';
import { DetailSlideOut } from './DetailSlideOut';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { Alert, AlertDescription } from './ui/alert';
import {
  Wifi,
  Users,
  Network,
  Shield,
  Radio,
  AlertCircle,
  Loader2,
  Building2,
  RefreshCw,
  AlertTriangle,
  QrCode
} from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';
import { ReconciliationDialog } from './wlans/ReconciliationDialog';
import { WifiQRCodeDialog } from './WifiQRCodeDialog';
import { assignmentStorageService } from '../services/assignmentStorage';
import { wlanDeploymentStatusService } from '../services/wlanDeploymentStatus';
import type { SiteWLANInventory } from '../types/network';

interface SiteWLANAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  siteName: string;
}

export function SiteWLANAssignmentDialog({
  open,
  onOpenChange,
  siteId,
  siteName
}: SiteWLANAssignmentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [inventory, setInventory] = useState<SiteWLANInventory | null>(null);
  const [reconcileDialogOpen, setReconcileDialogOpen] = useState(false);
  const [selectedWLAN, setSelectedWLAN] = useState<{ id: string; name: string } | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrWLAN, setQrWLAN] = useState<any>(null);

  useEffect(() => {
    if (open && siteId) {
      loadAssignmentSummary();
    }
  }, [open, siteId]);

  const loadAssignmentSummary = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log(`[SiteWLANDialog] Loading WLAN assignment summary for site ${siteId}`);
      const data = await apiService.getSiteWLANAssignmentSummary(siteId);
      setSummary(data);
      console.log('[SiteWLANDialog] Assignment summary loaded successfully:', data);
      console.log('[SiteWLANDialog] Summary breakdown:');
      console.log(`  - Device Groups: ${data.deviceGroupCount}`);
      console.log(`  - Profiles: ${data.profileCount}`);
      console.log(`  - WLANs: ${data.wlanCount}`);
      console.log('[SiteWLANDialog] Device Groups:', data.deviceGroups);
      console.log('[SiteWLANDialog] Profiles:', data.profiles);
      console.log('[SiteWLANDialog] WLANs:', data.wlans);

      // Create comprehensive inventory with deployment status
      const siteInventory = await wlanDeploymentStatusService.createSiteInventory(
        siteId,
        siteName,
        data.wlans || [],
        data.profiles || [],
        [] // TODO: Add observed WLANs when API endpoint available
      );

      setInventory(siteInventory);
      console.log('[SiteWLANDialog] Site inventory created:', siteInventory);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load WLAN assignments';
      setError(errorMessage);
      console.error('[SiteWLANDialog] Error loading WLAN assignments:', err);
      toast.error('Failed to load WLAN assignments', {
        description: errorMessage
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReconcileWLAN = (wlanId: string, wlanName: string) => {
    setSelectedWLAN({ id: wlanId, name: wlanName });
    setReconcileDialogOpen(true);
  };

  const handleShowQRCode = (wlan: any) => {
    setQrWLAN(wlan);
    setQrDialogOpen(true);
  };

  const handleReconcileDialogClose = () => {
    setReconcileDialogOpen(false);
    // Reload data after reconciliation to show updated state
    loadAssignmentSummary();
  };

  const getSecurityBadge = (security?: string) => {
    const securityType = security?.toLowerCase() || 'unknown';

    if (securityType.includes('open')) {
      return <Badge variant="outline" className="gap-1"><Shield className="h-3 w-3" /> Open</Badge>;
    } else if (securityType.includes('wpa3')) {
      return <Badge variant="default" className="gap-1"><Shield className="h-3 w-3" /> WPA3</Badge>;
    } else if (securityType.includes('wpa2-enterprise') || securityType.includes('enterprise')) {
      return <Badge variant="secondary" className="gap-1"><Shield className="h-3 w-3" /> WPA2-Enterprise</Badge>;
    } else if (securityType.includes('wpa2')) {
      return <Badge variant="secondary" className="gap-1"><Shield className="h-3 w-3" /> WPA2</Badge>;
    } else {
      return <Badge variant="outline">{security || 'Unknown'}</Badge>;
    }
  };

  const getBandBadge = (band?: string) => {
    if (!band) return null;

    return (
      <Badge variant="outline" className="gap-1">
        <Radio className="h-3 w-3" />
        {band}
      </Badge>
    );
  };

  return (
    <DetailSlideOut
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title={`WLAN Assignments - ${siteName}`}
      description="View WLANs and their profile assignments for this site"
      width="xl"
    >
      {loading ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : !summary ? (
          <div className="text-center py-8 text-muted-foreground">
            No data available
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Network className="h-4 w-4" />
                    Device Groups
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.deviceGroupCount}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Profiles
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.profileCount}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wifi className="h-4 w-4" />
                    WLANs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.wlanCount}</div>
                </CardContent>
              </Card>
            </div>

            {/* WLANs Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Wifi className="h-4 w-4" />
                  WLANs in this Site
                </CardTitle>
                <CardDescription>
                  Wireless networks and their deployment status
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Mismatch Alert */}
                {inventory && inventory.mismatches.length > 0 && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {inventory.mismatches.length} mismatch{inventory.mismatches.length !== 1 ? 'es' : ''} detected.
                      Review WLANs below for details.
                    </AlertDescription>
                  </Alert>
                )}

                {summary.wlans.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No WLANs found in this site
                  </div>
                ) : (
                  <div className="space-y-2">
                    {inventory?.intendedWLANs.map((item) => {
                      const wlan = item.wlan;
                      const hasMismatch = item.mismatchReason !== null;
                      const deploymentStatus = item.deploymentStatus;

                      return (
                        <div
                          key={wlan.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <Wifi className="h-5 w-5 text-muted-foreground" />
                            <div className="flex-1">
                              <div className="font-medium flex items-center gap-2">
                                {wlan.ssid || wlan.name || wlan.serviceName || wlan.id}
                                {hasMismatch && (
                                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                                )}
                                {deploymentStatus === 'NOT_DEPLOYED' && (
                                  <Badge variant="destructive" className="text-xs">
                                    Not Deployed
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                {wlan.vlan && <span>VLAN {wlan.vlan}</span>}
                                {item.expectedProfiles > 0 && (
                                  <>
                                    {wlan.vlan && <span className="text-muted-foreground">•</span>}
                                    <span>
                                      Expected: {item.expectedProfiles} profile{item.expectedProfiles !== 1 ? 's' : ''}
                                    </span>
                                    <span className="text-muted-foreground">•</span>
                                    <span className={hasMismatch ? 'text-orange-500 font-medium' : ''}>
                                      Actual: {item.actualProfiles} profile{item.actualProfiles !== 1 ? 's' : ''}
                                    </span>
                                  </>
                                )}
                                {hasMismatch && item.mismatchReason && (
                                  <>
                                    <span className="text-muted-foreground">•</span>
                                    <Badge variant={wlanDeploymentStatusService.getMismatchBadgeVariant(item.mismatchReason)} className="text-xs">
                                      {wlanDeploymentStatusService.getMismatchDescription(item.mismatchReason)}
                                    </Badge>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {getSecurityBadge(wlan.security)}
                            {getBandBadge(wlan.band)}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleShowQRCode(wlan)}
                              className="gap-1"
                              title="Download WiFi QR Code"
                            >
                              <QrCode className="h-3 w-3" />
                              QR Code
                            </Button>
                            {item.expectedProfiles > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleReconcileWLAN(
                                  wlan.id,
                                  wlan.ssid || wlan.name || wlan.serviceName || wlan.id
                                )}
                                className="gap-1"
                              >
                                <RefreshCw className="h-3 w-3" />
                                Reconcile
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Profiles and their WLAN Assignments */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Profile WLAN Assignments
                </CardTitle>
                <CardDescription>
                  Which WLANs are assigned to each profile
                </CardDescription>
              </CardHeader>
              <CardContent>
                {summary.profiles.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No profiles found in this site
                  </div>
                ) : (
                  <div className="space-y-4">
                    {summary.profiles.map((profile: any) => (
                      <div
                        key={profile.id}
                        className="border rounded-lg p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              {profile.name || profile.profileName || profile.id}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Device Group: {profile.deviceGroupName}
                            </div>
                          </div>
                          <Badge variant="secondary">
                            {profile.wlans?.length || 0} WLAN{profile.wlans?.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>

                        {profile.wlans && profile.wlans.length > 0 ? (
                          <div className="space-y-2 pl-6">
                            {profile.wlans.map((wlan: any) => (
                              <div
                                key={wlan.id}
                                className="flex items-center gap-2 text-sm p-2 bg-secondary/5 rounded border border-secondary/10"
                              >
                                <Wifi className="h-3 w-3 text-secondary" />
                                <span className="flex-1">
                                  {wlan.ssid || wlan.name || wlan.serviceName || wlan.id}
                                </span>
                                <div className="flex items-center gap-1">
                                  {getSecurityBadge(wlan.security)}
                                  {wlan.band && (
                                    <Badge variant="outline" className="text-xs">
                                      {wlan.band}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground pl-6">
                            No WLANs assigned to this profile
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

      {/* Reconciliation Dialog */}
      {selectedWLAN && (
        <ReconciliationDialog
          open={reconcileDialogOpen}
          onOpenChange={handleReconcileDialogClose}
          wlanId={selectedWLAN.id}
          wlanName={selectedWLAN.name}
        />
      )}

      {/* WiFi QR Code Dialog */}
      {qrWLAN && (
        <WifiQRCodeDialog
          open={qrDialogOpen}
          onOpenChange={setQrDialogOpen}
          wlan={qrWLAN}
        />
      )}
    </DetailSlideOut>
  );
}
