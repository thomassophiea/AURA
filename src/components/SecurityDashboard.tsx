import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  Shield,
  Wifi,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Scan,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { TouchButton } from './TouchButton';
import { DesktopOnly } from './MobileOptimized';
import { apiService } from '../services/api';

export function SecurityDashboard() {
  const [rogueAPs, setRogueAPs] = useState<any[]>([]);
  const [threats, setThreats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rogueList, threatList] = await Promise.all([
        apiService.getRogueAPList(),
        apiService.getSecurityThreats()
      ]);
      setRogueAPs(rogueList);
      setThreats(threatList);
    } catch (error) {
      console.error('Failed to load security data:', error);
      toast.error('Failed to load security information');
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      await apiService.detectRogueAPs();
      toast.success('Rogue AP scan initiated');
      setTimeout(loadData, 3000); // Refresh after 3 seconds
    } catch (error) {
      console.error('Failed to initiate scan:', error);
      toast.error('Failed to start rogue AP scan');
    } finally {
      setScanning(false);
    }
  };

  const handleClassify = async (macAddress: string, classification: 'friendly' | 'malicious' | 'unknown') => {
    try {
      await apiService.classifyRogueAP(macAddress, classification);
      toast.success(`Rogue AP classified as ${classification}`);
      await loadData();
    } catch (error) {
      console.error('Failed to classify rogue AP:', error);
      toast.error('Failed to classify rogue AP');
    }
  };

  const getRogueClassBadge = (classification?: string) => {
    switch (classification?.toLowerCase()) {
      case 'malicious':
        return <Badge variant="destructive">Malicious</Badge>;
      case 'friendly':
        return <Badge className="bg-green-500">Friendly</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getThreatSeverityBadge = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'high':
        return <Badge className="bg-orange-500">High</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500">Medium</Badge>;
      case 'low':
        return <Badge variant="secondary">Low</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const stats = {
    totalRogueAPs: rogueAPs.length,
    malicious: rogueAPs.filter(ap => ap.classification?.toLowerCase() === 'malicious').length,
    friendly: rogueAPs.filter(ap => ap.classification?.toLowerCase() === 'friendly').length,
    unknown: rogueAPs.filter(ap => !ap.classification || ap.classification?.toLowerCase() === 'unknown').length,
    threats: threats.length
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
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Security Dashboard
          </h2>
          <p className="text-muted-foreground">
            Rogue AP detection and security threat monitoring
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData} aria-label="Refresh security data">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleScan} disabled={scanning} aria-label="Scan for rogue access points">
            {scanning ? (
              <>
                <Scan className="h-4 w-4 mr-2 animate-pulse" />
                Scanning...
              </>
            ) : (
              <>
                <Scan className="h-4 w-4 mr-2" />
                Scan for Rogue APs
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Rogue APs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{stats.totalRogueAPs}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Malicious
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <span className="text-2xl font-bold">{stats.malicious}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Friendly
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">{stats.friendly}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unknown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-yellow-500" />
              <span className="text-2xl font-bold">{stats.unknown}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Threats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <span className="text-2xl font-bold">{stats.threats}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rogue Access Points */}
      <Card>
        <CardHeader>
          <CardTitle>Detected Rogue Access Points</CardTitle>
          <CardDescription>
            Unauthorized access points detected in the wireless environment
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rogueAPs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50 text-green-500" />
              <p>No rogue access points detected</p>
              <p className="text-sm mt-2">Your wireless environment is secure</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rogueAPs.map((ap) => (
                <div
                  key={ap.macAddress}
                  className="flex items-start justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-start gap-3">
                    <Wifi className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{ap.ssid || 'Hidden SSID'}</h3>
                        {getRogueClassBadge(ap.classification)}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        MAC: {ap.macAddress}
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {ap.channel && (
                          <div>
                            <span className="text-muted-foreground">Channel:</span>{' '}
                            <span className="font-medium">{ap.channel}</span>
                          </div>
                        )}
                        {ap.signal && (
                          <div>
                            <span className="text-muted-foreground">Signal:</span>{' '}
                            <span className="font-medium">{ap.signal} dBm</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <Select
                      defaultValue={ap.classification || 'unknown'}
                      onValueChange={(value) =>
                        handleClassify(ap.macAddress, value as any)
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="friendly">Friendly</SelectItem>
                        <SelectItem value="malicious">Malicious</SelectItem>
                        <SelectItem value="unknown">Unknown</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Threats */}
      <Card>
        <CardHeader>
          <CardTitle>Security Threats</CardTitle>
          <CardDescription>
            Detected security threats and anomalies
          </CardDescription>
        </CardHeader>
        <CardContent>
          {threats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50 text-green-500" />
              <p>No security threats detected</p>
            </div>
          ) : (
            <div className="space-y-2">
              {threats.map((threat, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-4 border rounded-lg"
                >
                  <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{threat.type || 'Security Threat'}</h3>
                      {getThreatSeverityBadge(threat.severity)}
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {threat.description || threat.message}
                    </p>
                    {threat.affectedDevices && (
                      <p className="text-xs text-muted-foreground">
                        Affected devices: {threat.affectedDevices.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
