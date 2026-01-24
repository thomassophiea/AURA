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
import { TouchButton } from './TouchButton';
import { ResponsiveDialog } from './ResponsiveDialog';
import { DesktopOnly } from './MobileOptimized';

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

  const validateLicenseKey = (key: string): boolean => {
    // Basic validation: should contain alphanumeric characters and dashes
    const licenseKeyRegex = /^[A-Z0-9\-]+$/i;
    return key.trim().length >= 10 && licenseKeyRegex.test(key);
  };

  const handleInstallLicense = async () => {
    if (!licenseKey.trim()) {
      toast.error('Please enter a license key');
      return;
    }

    if (!validateLicenseKey(licenseKey)) {
      toast.error('Invalid license key format. Please check and try again.');
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
    <div className="space-y-6 p-4 md:p-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-3 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            <Key className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            License Management
          </h2>
          <DesktopOnly>
            <p className="text-muted-foreground mt-2 text-base">
              Manage and monitor system licenses
            </p>
          </DesktopOnly>
        </div>
        <div className="flex gap-2">
          <TouchButton
            variant="outline"
            size="sm"
            onClick={loadLicenseData}
            aria-label="Refresh license data"
          >
            <RefreshCw className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Refresh</span>
          </TouchButton>
          <TouchButton
            size="sm"
            onClick={() => setShowInstallDialog(true)}
            aria-label="Install new license"
          >
            <Plus className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Install License</span>
          </TouchButton>
        </div>
      </div>

      {/* License Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-2 hover:shadow-lg transition-all duration-300 hover:border-primary/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Licenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary/10 rounded-xl">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <span className="text-3xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                {licenseInfo?.totalLicenses || 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 hover:shadow-lg transition-all duration-300 hover:border-green-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Licenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-green-100 rounded-xl">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <span className="text-3xl font-bold text-green-600">
                {licenseInfo?.activeLicenses || 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 hover:shadow-lg transition-all duration-300 hover:border-yellow-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Expiring Soon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-yellow-100 rounded-xl">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
              <span className="text-3xl font-bold text-yellow-600">
                {licenseInfo?.expiringLicenses || 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 hover:shadow-lg transition-all duration-300 hover:border-blue-300 bg-gradient-to-br from-blue-50/30 to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Utilization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 rounded-xl">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
              <span className="text-3xl font-bold text-blue-600">
                {licenseUsage?.utilizationPercentage.toFixed(0) || 0}%
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* License Usage Statistics */}
      {licenseUsage && (
        <Card className="border-2 shadow-lg hover:shadow-xl transition-shadow duration-300">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl flex items-center gap-2">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
              License Usage
            </CardTitle>
            <CardDescription className="mt-1">Device licensing status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-blue-50/80 to-purple-50/40 p-5 rounded-2xl border-2 border-blue-100/50">
                <div className="flex justify-between mb-4">
                  <span className="text-sm font-bold text-gray-700">Device Licensing Status</span>
                  <span className="text-sm font-mono font-bold text-blue-700">
                    {licenseUsage.licensedDevices} / {licenseUsage.totalDevices}
                  </span>
                </div>
                <div className="w-full bg-white/80 rounded-full h-4 overflow-hidden shadow-inner border border-gray-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={licenseUsage.utilizationPercentage} aria-label="License utilization percentage">
                  <div
                    className={`h-4 rounded-full transition-all duration-700 ease-out shadow-sm ${
                      licenseUsage.utilizationPercentage > 90
                        ? 'bg-gradient-to-r from-red-500 via-red-600 to-red-700'
                        : licenseUsage.utilizationPercentage > 70
                        ? 'bg-gradient-to-r from-yellow-500 via-orange-500 to-orange-600'
                        : 'bg-gradient-to-r from-green-500 via-emerald-500 to-green-600'
                    }`}
                    style={{ width: `${licenseUsage.utilizationPercentage}%` }}
                  />
                </div>
                <div className="flex justify-between mt-3">
                  <span className="text-xs font-semibold text-gray-600">
                    {licenseUsage.utilizationPercentage.toFixed(1)}% utilized
                  </span>
                  <span className="text-xs font-semibold text-gray-600">
                    {licenseUsage.totalDevices - licenseUsage.licensedDevices} remaining
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-gray-200 hover:border-gray-300 transition-all shadow-sm hover:shadow-md">
                  <div className="text-3xl font-bold bg-gradient-to-br from-gray-700 to-gray-600 bg-clip-text text-transparent">{licenseUsage.totalDevices}</div>
                  <div className="text-sm font-medium text-gray-600 mt-1">Total Devices</div>
                </div>
                <div className="text-center p-5 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border-2 border-green-200 hover:border-green-300 transition-all shadow-sm hover:shadow-md">
                  <div className="text-3xl font-bold text-green-600">{licenseUsage.licensedDevices}</div>
                  <div className="text-sm font-medium text-green-700 mt-1">Licensed</div>
                </div>
                <div className="text-center p-5 bg-gradient-to-br from-red-50 to-rose-50 rounded-xl border-2 border-red-200 hover:border-red-300 transition-all shadow-sm hover:shadow-md">
                  <div className="text-3xl font-bold text-red-600">{licenseUsage.unlicensedDevices}</div>
                  <div className="text-sm font-medium text-red-700 mt-1">Unlicensed</div>
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
      <ResponsiveDialog
        open={showInstallDialog}
        onOpenChange={setShowInstallDialog}
        title="Install License"
        description="Enter the license key provided by Extreme Networks"
      >
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="license-key">License Key</Label>
            <Input
              id="license-key"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
              onKeyPress={(e) => e.key === 'Enter' && handleInstallLicense()}
              aria-describedby="license-key-hint"
              aria-label="Enter license key"
            />
            <p id="license-key-hint" className="text-xs text-muted-foreground">
              Enter the complete license key including dashes
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-4 border-t">
          <TouchButton
            variant="outline"
            onClick={() => setShowInstallDialog(false)}
            disabled={installing}
            aria-label="Cancel license installation"
          >
            Cancel
          </TouchButton>
          <TouchButton
            onClick={handleInstallLicense}
            disabled={installing}
            aria-label="Install license key"
          >
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
          </TouchButton>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
