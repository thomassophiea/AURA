import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Skeleton } from './ui/skeleton';
import { Alert, AlertDescription } from './ui/alert';
import {
  Key,
  Upload,
  Download,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Calendar,
  Users,
  Wifi,
  Shield
} from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';

interface LicenseInfo {
  licenseKey: string;
  type: 'trial' | 'standard' | 'professional' | 'enterprise';
  status: 'active' | 'expiring_soon' | 'expired' | 'invalid';
  issuedTo: string;
  issuedDate: string;
  expirationDate: string;
  daysRemaining: number;
  features: {
    maxAccessPoints: number;
    maxClients: number;
    maxSites: number;
    advancedSecurity: boolean;
    guestPortal: boolean;
    apiAccess: boolean;
    technicalSupport: boolean;
  };
  usage: {
    accessPoints: number;
    clients: number;
    sites: number;
  };
}

export function LicenseManagement() {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newLicenseKey, setNewLicenseKey] = useState('');
  const [apiNotAvailable, setApiNotAvailable] = useState(false);

  useEffect(() => {
    loadLicenseInfo();
  }, []);

  const loadLicenseInfo = async () => {
    setLoading(true);
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/system/license', {
        method: 'GET'
      });

      if (response.ok) {
        const data = await response.json();
        setLicense(data);
        setApiNotAvailable(false);
      } else if (response.status === 404) {
        setApiNotAvailable(true);
        console.warn('License API endpoint not available on Extreme Platform ONE');
      }
    } catch (error) {
      console.error('Failed to load license info:', error);
      setApiNotAvailable(true);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadLicense = async () => {
    if (!newLicenseKey.trim()) {
      toast.error('Please enter a license key');
      return;
    }

    setUploading(true);
    try {
      toast.info('Validating license key...');

      const response = await apiService.makeAuthenticatedRequest('/v1/system/license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: newLicenseKey })
      });

      if (response.ok) {
        toast.success('License updated successfully');
        setNewLicenseKey('');
        await loadLicenseInfo();
      } else {
        throw new Error('Invalid license key');
      }
    } catch (error) {
      toast.error('Invalid license key');
    } finally {
      setUploading(false);
    }
  };

  const handleExportLicense = () => {
    if (!license) return;

    const licenseData = {
      ...license,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(licenseData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `license-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('License information exported');
  };

  const getStatusBadge = (status: LicenseInfo['status']) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500">Active</Badge>;
      case 'expiring_soon':
        return <Badge className="bg-yellow-500">Expiring Soon</Badge>;
      case 'expired':
        return <Badge variant="destructive">Expired</Badge>;
      case 'invalid':
        return <Badge variant="destructive">Invalid</Badge>;
    }
  };

  const getTypeBadge = (type: LicenseInfo['type']) => {
    const colors: Record<LicenseInfo['type'], string> = {
      trial: 'bg-gray-500',
      standard: 'bg-blue-500',
      professional: 'bg-purple-500',
      enterprise: 'bg-orange-500'
    };

    const labels: Record<LicenseInfo['type'], string> = {
      trial: 'Trial',
      standard: 'Standard',
      professional: 'Professional',
      enterprise: 'Enterprise'
    };

    return (
      <Badge className={colors[type]}>
        {labels[type]}
      </Badge>
    );
  };

  const getUsagePercentage = (used: number, max: number) => {
    return Math.min(100, (used / max) * 100);
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
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
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Key className="h-6 w-6" />
          License Management
        </h2>
        <p className="text-muted-foreground">
          View and manage system license
        </p>
      </div>

      {apiNotAvailable && (
        <Alert className="border-yellow-500">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            License management API endpoints are not available on this Extreme Platform ONE version.
            This feature requires Extreme Platform ONE API v1/system/license support.
          </AlertDescription>
        </Alert>
      )}

      {license && !apiNotAvailable && (
        <>
          {/* License Status Alert */}
          {license.daysRemaining <= 30 && (
            <Alert className={license.daysRemaining <= 7 ? 'border-red-500' : 'border-yellow-500'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {license.daysRemaining <= 7 ? (
                  <span className="font-semibold">License expires in {license.daysRemaining} days!</span>
                ) : (
                  <span>License expiring in {license.daysRemaining} days. Please renew soon.</span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* License Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  License Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">License Type</p>
                  <div className="mt-1">
                    {getTypeBadge(license.type)}
                  </div>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="mt-1">
                    {getStatusBadge(license.status)}
                  </div>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">License Key</p>
                  <code className="text-sm bg-muted px-2 py-1 rounded mt-1 block">
                    {license.licenseKey}
                  </code>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Issued To</p>
                  <p className="font-medium">{license.issuedTo}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Issued Date</p>
                    <p className="text-sm">
                      {new Date(license.issuedDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Expiration Date</p>
                    <p className="text-sm font-semibold">
                      {new Date(license.expirationDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Days Remaining</p>
                  <p className="text-2xl font-bold">
                    {license.daysRemaining}
                  </p>
                </div>

                <Button onClick={handleExportLicense} variant="outline" className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  Export License Info
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Feature Entitlements</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Advanced Security</span>
                  {license.features.advancedSecurity ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-gray-400" />
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm">Guest Portal</span>
                  {license.features.guestPortal ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-gray-400" />
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm">API Access</span>
                  {license.features.apiAccess ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-gray-400" />
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm">Technical Support</span>
                  {license.features.technicalSupport ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Usage Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>License Usage</CardTitle>
              <CardDescription>Current usage against license limits</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Access Points */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Access Points</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {license.usage.accessPoints} / {license.features.maxAccessPoints}
                  </span>
                </div>
                <Progress
                  value={getUsagePercentage(license.usage.accessPoints, license.features.maxAccessPoints)}
                  className={getUsageColor(getUsagePercentage(license.usage.accessPoints, license.features.maxAccessPoints))}
                />
                <p className="text-xs text-muted-foreground">
                  {(getUsagePercentage(license.usage.accessPoints, license.features.maxAccessPoints)).toFixed(1)}% utilized
                </p>
              </div>

              {/* Clients */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Connected Clients</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {license.usage.clients} / {license.features.maxClients}
                  </span>
                </div>
                <Progress
                  value={getUsagePercentage(license.usage.clients, license.features.maxClients)}
                  className={getUsageColor(getUsagePercentage(license.usage.clients, license.features.maxClients))}
                />
                <p className="text-xs text-muted-foreground">
                  {(getUsagePercentage(license.usage.clients, license.features.maxClients)).toFixed(1)}% utilized
                </p>
              </div>

              {/* Sites */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Sites</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {license.usage.sites} / {license.features.maxSites}
                  </span>
                </div>
                <Progress
                  value={getUsagePercentage(license.usage.sites, license.features.maxSites)}
                  className={getUsageColor(getUsagePercentage(license.usage.sites, license.features.maxSites))}
                />
                <p className="text-xs text-muted-foreground">
                  {(getUsagePercentage(license.usage.sites, license.features.maxSites)).toFixed(1)}% utilized
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Upload New License */}
      <Card>
        <CardHeader>
          <CardTitle>Update License</CardTitle>
          <CardDescription>Upload a new license key to update or renew</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>License Key</Label>
            <Input
              value={newLicenseKey}
              onChange={(e) => setNewLicenseKey(e.target.value)}
              placeholder="EXTR-XXX-XXXX-XXXXXXXX"
              disabled={uploading}
            />
          </div>

          <Button
            onClick={handleUploadLicense}
            disabled={uploading || !newLicenseKey.trim() || apiNotAvailable}
            className="w-full"
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? 'Validating...' : 'Upload License'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
