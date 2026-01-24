import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { Separator } from './ui/separator';
import {
  Key,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  Plus,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface LicenseInfo {
  licenses: Array<{
    type: string;
    status: string;
    expirationDate?: string;
    capacity?: number;
    features?: string[];
  }>;
  totalLicenses: number;
  activeLicenses: number;
  expiringLicenses: number;
}

interface LicenseUsage {
  totalDevices: number;
  licensedDevices: number;
  unlicensedDevices: number;
  utilizationPercentage: number;
}

export function LicenseDashboard() {
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [licenseUsage, setLicenseUsage] = useState<LicenseUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    loadLicenseData();
  }, []);

  const loadLicenseData = async () => {
    setLoading(true);
    try {
      const [info, usage] = await Promise.all([
        apiService.getLicenseInfo(),
        apiService.getLicenseUsage()
      ]);
      setLicenseInfo(info);
      setLicenseUsage(usage);
    } catch (error) {
      console.error('Failed to load license data:', error);
      toast.error('Failed to load license information');
    } finally {
      setLoading(false);
    }
  };

  const handleInstallLicense = async () => {
    if (!licenseKey.trim()) {
      toast.error('Please enter a license key');
      return;
    }

    setInstalling(true);
    try {
      await apiService.installLicense(licenseKey);
      toast.success('License installed successfully');
      setShowInstallDialog(false);
      setLicenseKey('');
      await loadLicenseData();
    } catch (error) {
      console.error('Failed to install license:', error);
      toast.error('Failed to install license. Please check the license key.');
    } finally {
      setInstalling(false);
    }
  };

  const isExpiringSoon = (expirationDate?: string): boolean => {
    if (!expirationDate) return false;
    const daysUntilExpiration = Math.ceil(
      (new Date(expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiration > 0 && daysUntilExpiration <= 30;
  };

  const isExpired = (expirationDate?: string): boolean => {
    if (!expirationDate) return false;
    return new Date(expirationDate).getTime() < Date.now();
  };

  const formatExpirationDate = (expirationDate?: string): string => {
    if (!expirationDate) return 'Never';
    const date = new Date(expirationDate);
    const daysUntil = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) return 'Expired';
    if (daysUntil === 0) return 'Expires today';
    if (daysUntil === 1) return 'Expires tomorrow';
    if (daysUntil <= 7) return `Expires in ${daysUntil} days`;
    if (daysUntil <= 30) return `Expires in ${daysUntil} days`;

    return date.toLocaleDateString();
  };

  const getLicenseStatusIcon = (status: string, expirationDate?: string) => {
    if (isExpired(expirationDate)) {
      return <XCircle className="h-5 w-5 text-red-500" />;
    }
    if (isExpiringSoon(expirationDate)) {
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    }
    if (status === 'active') {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
    return <Clock className="h-5 w-5 text-muted-foreground" />;
  };

  const getLicenseStatusBadge = (status: string, expirationDate?: string) => {
    if (isExpired(expirationDate)) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    if (isExpiringSoon(expirationDate)) {
      return <Badge className="bg-yellow-500">Expiring Soon</Badge>;
    }
    if (status === 'active') {
      return <Badge className="bg-green-500">Active</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Key className="h-6 w-6" />
            License Management
          </h2>
          <p className="text-muted-foreground">
            Manage and monitor system licenses
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadLicenseData}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setShowInstallDialog(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Install License
          </Button>
        </div>
      </div>

      {/* License Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Licenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">
                {licenseInfo?.totalLicenses || 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Licenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">
                {licenseInfo?.activeLicenses || 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Expiring Soon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <span className="text-2xl font-bold">
                {licenseInfo?.expiringLicenses || 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Utilization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">
                {licenseUsage?.utilizationPercentage.toFixed(0) || 0}%
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* License Usage Statistics */}
      {licenseUsage && (
        <Card>
          <CardHeader>
            <CardTitle>License Usage</CardTitle>
            <CardDescription>Device licensing status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Licensed Devices</span>
                  <span className="text-sm text-muted-foreground">
                    {licenseUsage.licensedDevices} / {licenseUsage.totalDevices}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-4">
                  <div
                    className={`h-4 rounded-full transition-all ${
                      licenseUsage.utilizationPercentage > 90
                        ? 'bg-red-500'
                        : licenseUsage.utilizationPercentage > 70
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${licenseUsage.utilizationPercentage}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4">
                <div className="text-center p-4 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold">{licenseUsage.totalDevices}</div>
                  <div className="text-sm text-muted-foreground">Total Devices</div>
                </div>
                <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{licenseUsage.licensedDevices}</div>
                  <div className="text-sm text-muted-foreground">Licensed</div>
                </div>
                <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{licenseUsage.unlicensedDevices}</div>
                  <div className="text-sm text-muted-foreground">Unlicensed</div>
                </div>
              </div>

              {licenseUsage.unlicensedDevices > 0 && (
                <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    {licenseUsage.unlicensedDevices} device(s) require licensing
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* License Details */}
      <Card>
        <CardHeader>
          <CardTitle>Installed Licenses</CardTitle>
          <CardDescription>
            Detailed information about installed licenses
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!licenseInfo || licenseInfo.licenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No licenses installed</p>
              <p className="text-sm mt-2">Install a license to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {licenseInfo.licenses.map((license, index) => (
                <div key={index}>
                  <div className="flex items-start justify-between p-4 border rounded-lg">
                    <div className="flex items-start gap-3 flex-1">
                      {getLicenseStatusIcon(license.status, license.expirationDate)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">{license.type}</h3>
                          {getLicenseStatusBadge(license.status, license.expirationDate)}
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{formatExpirationDate(license.expirationDate)}</span>
                          </div>

                          {license.capacity && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Shield className="h-3 w-3" />
                              <span>Capacity: {license.capacity} devices</span>
                            </div>
                          )}

                          {license.features && license.features.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground mb-1">Features:</p>
                              <div className="flex flex-wrap gap-1">
                                {license.features.map((feature, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">
                                    {feature}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {index < licenseInfo.licenses.length - 1 && <Separator className="my-4" />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Install License Dialog */}
      <Dialog open={showInstallDialog} onOpenChange={setShowInstallDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install License</DialogTitle>
            <DialogDescription>
              Enter the license key provided by Extreme Networks
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>License Key</Label>
              <Input
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                onKeyPress={(e) => e.key === 'Enter' && handleInstallLicense()}
              />
              <p className="text-xs text-muted-foreground">
                Enter the complete license key including dashes
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowInstallDialog(false)}
              disabled={installing}
            >
              Cancel
            </Button>
            <Button onClick={handleInstallLicense} disabled={installing}>
              {installing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Installing...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Install License
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
