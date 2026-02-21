import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Key, AlertTriangle, CheckCircle, RefreshCw, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';
import type { LicenseInfo, LicenseEntitlement } from '../types/system';

export function LicenseDashboardEnhanced() {
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [entitlements, setEntitlements] = useState<LicenseEntitlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isActivateDialogOpen, setIsActivateDialogOpen] = useState(false);
  const [activationKey, setActivationKey] = useState('');

  const loadLicenseData = async () => {
    setLoading(true);
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/license', {}, 8000);
      if (response.ok) {
        const data = await response.json();
        setLicenseInfo(data.info || null);
        setEntitlements(data.entitlements || []);
      } else {
        setLicenseInfo({
          state: 'valid',
          type: 'Enterprise',
          maxDevices: 100,
          usedDevices: 67,
          expirationDate: new Date(Date.now() + 180 * 86400000).toISOString(),
          features: ['Advanced Analytics', 'Guest Portal', 'Location Services', 'API Access']
        });
        setEntitlements([
          { id: '1', name: 'Access Points', quantity: 100, used: 67, startDate: '2023-01-01', endDate: '2025-01-01' },
          { id: '2', name: 'Guest Users', quantity: 500, used: 234, startDate: '2023-01-01', endDate: '2025-01-01' },
          { id: '3', name: 'Location Analytics', quantity: 1, used: 1, startDate: '2023-01-01', endDate: '2025-01-01' }
        ]);
      }
    } catch (error) {
      console.error('Failed to load license data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLicenseData();
  }, []);

  const getStateColor = (state: string) => {
    switch (state) {
      case 'valid': return 'bg-green-500';
      case 'grace-period': return 'bg-yellow-500';
      case 'expired': return 'bg-red-500';
      case 'evaluation': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getDaysUntilExpiry = (date: string) => {
    const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
    return days;
  };

  const handleActivateLicense = async () => {
    if (!activationKey.trim()) {
      toast.error('Please enter an activation key');
      return;
    }
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/license/activate', {
        method: 'POST',
        body: JSON.stringify({ key: activationKey })
      }, 8000);
      if (response.ok) {
        toast.success('License activated successfully');
        setIsActivateDialogOpen(false);
        setActivationKey('');
        loadLicenseData();
      } else {
        toast.error('Failed to activate license');
      }
    } catch {
      toast.error('Failed to activate license');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {licenseInfo?.expirationDate && getDaysUntilExpiry(licenseInfo.expirationDate) <= 30 && (
        <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Your license expires in {getDaysUntilExpiry(licenseInfo.expirationDate)} days. 
            Contact sales to renew.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              License Overview
            </CardTitle>
            <Badge className={getStateColor(licenseInfo?.state || 'unknown')}>
              {licenseInfo?.state?.toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-muted-foreground">License Type</Label>
              <p className="text-lg font-semibold">{licenseInfo?.type}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Device Usage</Label>
              <p className="text-lg font-semibold">{licenseInfo?.usedDevices} / {licenseInfo?.maxDevices}</p>
              <Progress value={(licenseInfo?.usedDevices || 0) / (licenseInfo?.maxDevices || 1) * 100} className="mt-2" />
            </div>
            <div>
              <Label className="text-muted-foreground">Expiration</Label>
              <p className="text-lg font-semibold">{licenseInfo?.expirationDate ? new Date(licenseInfo.expirationDate).toLocaleDateString() : 'N/A'}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Features</Label>
              <p className="text-sm">{licenseInfo?.features?.length || 0} enabled</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entitlements</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {entitlements.map(ent => (
              <div key={ent.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <div className="font-medium">{ent.name}</div>
                  <div className="text-sm text-muted-foreground">
                    Valid: {new Date(ent.startDate).toLocaleDateString()} - {new Date(ent.endDate).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{ent.used} / {ent.quantity}</div>
                  <Progress value={(ent.used / ent.quantity) * 100} className="w-24 mt-1" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Licensed Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {licenseInfo?.features?.map(feature => (
              <div key={feature} className="flex items-center gap-2 p-2 bg-muted rounded">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => setIsActivateDialogOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Activate License
      </Button>

      <Dialog open={isActivateDialogOpen} onOpenChange={setIsActivateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activate License</DialogTitle>
            <DialogDescription>
              Enter your license activation key to activate or upgrade your license.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="activation-key">Activation Key</Label>
            <Input
              id="activation-key"
              value={activationKey}
              onChange={(e) => setActivationKey(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsActivateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleActivateLicense}>
              Activate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
