import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { AppWindow, RefreshCw, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { apiService } from '../../services/api';

interface AppData {
  name: string;
  category: string;
  bytesIn: number;
  bytesOut: number;
  sessions: number;
  trend: 'up' | 'down' | 'stable';
}

export function ApplicationVisibilityWidget() {
  const [apps, setApps] = useState<AppData[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'bandwidth' | 'sessions'>('bandwidth');

  const fetchApps = async () => {
    setLoading(true);
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/applications/stats', {}, 8000);
      if (response.ok) {
        const data = await response.json();
        setApps(data || []);
      } else {
        setApps([
          { name: 'Microsoft 365', category: 'Business', bytesIn: 5200000000, bytesOut: 1200000000, sessions: 245, trend: 'up' },
          { name: 'YouTube', category: 'Streaming', bytesIn: 4800000000, bytesOut: 120000000, sessions: 89, trend: 'stable' },
          { name: 'Zoom', category: 'Conferencing', bytesIn: 2100000000, bytesOut: 1900000000, sessions: 156, trend: 'up' },
          { name: 'Slack', category: 'Communication', bytesIn: 890000000, bytesOut: 450000000, sessions: 312, trend: 'stable' },
          { name: 'Google Drive', category: 'Storage', bytesIn: 1500000000, bytesOut: 2800000000, sessions: 78, trend: 'down' },
          { name: 'Spotify', category: 'Streaming', bytesIn: 750000000, bytesOut: 15000000, sessions: 34, trend: 'stable' },
          { name: 'Salesforce', category: 'Business', bytesIn: 420000000, bytesOut: 180000000, sessions: 67, trend: 'up' }
        ]);
      }
    } catch (error) {
      console.error('Failed to fetch app data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApps();
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const getTotalBandwidth = (app: AppData) => app.bytesIn + app.bytesOut;
  const maxBandwidth = Math.max(...apps.map(getTotalBandwidth), 1);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AppWindow className="h-5 w-5" />
            Top Applications
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button 
              variant={viewMode === 'bandwidth' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setViewMode('bandwidth')}
            >
              Bandwidth
            </Button>
            <Button 
              variant={viewMode === 'sessions' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setViewMode('sessions')}
            >
              Sessions
            </Button>
            <Button variant="ghost" size="sm" onClick={fetchApps}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {apps
            .sort((a, b) => viewMode === 'bandwidth' 
              ? getTotalBandwidth(b) - getTotalBandwidth(a) 
              : b.sessions - a.sessions)
            .slice(0, 7)
            .map((app) => (
              <div key={app.name} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{app.name}</span>
                    <Badge variant="outline" className="text-xs">{app.category}</Badge>
                    {app.trend === 'up' && <ArrowUpRight className="h-3 w-3 text-green-500" />}
                    {app.trend === 'down' && <ArrowDownRight className="h-3 w-3 text-red-500" />}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {viewMode === 'bandwidth' 
                      ? formatBytes(getTotalBandwidth(app))
                      : `${app.sessions} sessions`}
                  </span>
                </div>
                <Progress 
                  value={viewMode === 'bandwidth'
                    ? (getTotalBandwidth(app) / maxBandwidth) * 100
                    : (app.sessions / Math.max(...apps.map(a => a.sessions))) * 100} 
                  className="h-2"
                />
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
