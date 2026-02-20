import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { RefreshCw, Shield, Server, Network, AlertCircle, CheckCircle2 } from 'lucide-react';
import { apiService } from '../services/api';

interface HAStatus {
  availabilityEnabled: boolean;
  availabilityRole: 'PRIMARY' | 'SECONDARY' | 'STANDALONE';
  availabilityPairAddr: string;
  balanceAps: boolean;
  secureConnection: boolean;
  staticMtu: number;
}

export function HighAvailabilityWidget() {
  const [haStatus, setHAStatus] = useState<HAStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const loadHAStatus = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);

      const response = await apiService.makeAuthenticatedRequest(
        '/platformmanager/v1/availability',
        { method: 'GET' },
        10000
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch HA status: ${response.status}`);
      }

      const data = await response.json();
      console.log('[HighAvailabilityWidget] Loaded HA status:', data);
      setHAStatus(data);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('[HighAvailabilityWidget] Error loading HA status:', err);
      setError(err instanceof Error ? err.message : 'Failed to load HA status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHAStatus();
    // Auto-refresh every 60 seconds
    const interval = setInterval(() => loadHAStatus(true), 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    loadHAStatus(true);
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'PRIMARY':
        return 'text-green-500 dark:text-green-400';
      case 'SECONDARY':
        return 'text-blue-600 dark:text-blue-400';
      case 'STANDALONE':
        return 'text-gray-600 dark:text-gray-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getRoleBadgeVariant = (role: string): 'default' | 'secondary' | 'outline' | 'destructive' => {
    switch (role) {
      case 'PRIMARY':
        return 'default';
      case 'SECONDARY':
        return 'secondary';
      case 'STANDALONE':
        return 'outline';
      default:
        return 'outline';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            High Availability Status
          </CardTitle>
          <CardDescription>Controller redundancy and clustering</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !haStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            High Availability Status
          </CardTitle>
          <CardDescription>Controller redundancy and clustering</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-4">{error || 'No HA data available'}</p>
            <Button onClick={handleRefresh} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              High Availability Status
            </CardTitle>
            <CardDescription>
              Controller redundancy and clustering
              {lastUpdate && (
                <span className="ml-2">• Updated {lastUpdate.toLocaleTimeString()}</span>
              )}
            </CardDescription>
          </div>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* HA Status */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2 mb-2">
              {haStatus.availabilityEnabled ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-500" />
              )}
              <h3 className="font-semibold text-sm">HA Configuration</h3>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold">
                {haStatus.availabilityEnabled ? 'Enabled' : 'Disabled'}
              </p>
              <Badge variant={haStatus.availabilityEnabled ? 'default' : 'outline'}>
                {haStatus.availabilityEnabled ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>

          {/* Role */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2 mb-2">
              <Server className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Role</h3>
            </div>
            <div className="space-y-1">
              <p className={`text-2xl font-bold ${getRoleColor(haStatus.availabilityRole)}`}>
                {haStatus.availabilityRole}
              </p>
              <Badge variant={getRoleBadgeVariant(haStatus.availabilityRole)}>
                {haStatus.availabilityRole === 'PRIMARY' ? 'Active' :
                 haStatus.availabilityRole === 'SECONDARY' ? 'Standby' :
                 'Standalone Mode'}
              </Badge>
            </div>
          </div>

          {/* Pair Address */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2 mb-2">
              <Network className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Paired Node</h3>
            </div>
            <div className="space-y-1">
              {haStatus.availabilityPairAddr ? (
                <>
                  <p className="text-sm font-mono break-all">{haStatus.availabilityPairAddr}</p>
                  <Badge variant="outline">
                    {haStatus.secureConnection ? 'Secure' : 'Unsecure'}
                  </Badge>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No paired node</p>
              )}
            </div>
          </div>

          {/* AP Load Balancing */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2 mb-2">
              <Wifi className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold text-sm">AP Load Balancing</h3>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold">
                {haStatus.balanceAps ? 'Enabled' : 'Disabled'}
              </p>
              <p className="text-xs text-muted-foreground">
                {haStatus.balanceAps
                  ? 'APs distributed across nodes'
                  : 'No AP distribution'}
              </p>
            </div>
          </div>

          {/* Network Configuration */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2 mb-2">
              <Network className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Network Settings</h3>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">MTU Size</span>
                <span className="text-sm font-medium">{haStatus.staticMtu} bytes</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Connection</span>
                <Badge variant={haStatus.secureConnection ? 'default' : 'outline'} className="text-xs">
                  {haStatus.secureConnection ? 'TLS' : 'Plain'}
                </Badge>
              </div>
            </div>
          </div>

          {/* Status Summary */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Redundancy Status</h3>
            </div>
            <div className="space-y-2">
              {haStatus.availabilityEnabled ? (
                <>
                  {haStatus.availabilityPairAddr ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <p className="text-xs">HA pair configured</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      <p className="text-xs">No pair address set</p>
                    </div>
                  )}
                  {haStatus.secureConnection && (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <p className="text-xs">Secure connection active</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-gray-600" />
                  <p className="text-xs">HA not configured</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Additional Info */}
        {!haStatus.availabilityEnabled && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>Note:</strong> High Availability is currently disabled. Configure HA to enable
              redundancy and automatic failover for improved network resilience.
            </p>
          </div>
        )}

        {haStatus.availabilityEnabled && !haStatus.availabilityPairAddr && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              <strong>Warning:</strong> HA is enabled but no paired node address is configured.
              Set the pair address to complete the HA setup.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
