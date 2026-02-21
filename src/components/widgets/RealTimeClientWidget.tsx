import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Users, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { apiService } from '../../services/api';

interface RealTimeClientWidgetProps {
  refreshInterval?: number;
  siteId?: string;
}

export function RealTimeClientWidget({ refreshInterval = 30, siteId }: RealTimeClientWidgetProps) {
  const [stats, setStats] = useState({
    totalClients: 0,
    clientsByBand: { '2.4GHz': 0, '5GHz': 0, '6GHz': 0 },
    signalDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 },
    recentConnections: 0,
    recentDisconnections: 0
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [previousTotal, setPreviousTotal] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStats = async () => {
    try {
      const clients = await apiService.getStations();

      const total = clients.length;
      const byBand = { '2.4GHz': 0, '5GHz': 0, '6GHz': 0 };
      const signalDist = { excellent: 0, good: 0, fair: 0, poor: 0 };

      clients.forEach(client => {
        const channel = client.channel || client.radioChannel || 0;
        if (channel <= 14) byBand['2.4GHz']++;
        else if (channel <= 177) byBand['5GHz']++;
        else byBand['6GHz']++;

        const rssi = client.rssi || client.signalStrength || -100;
        if (rssi >= -50) signalDist.excellent++;
        else if (rssi >= -60) signalDist.good++;
        else if (rssi >= -70) signalDist.fair++;
        else signalDist.poor++;
      });

      setPreviousTotal(stats.totalClients);
      setStats({
        totalClients: total,
        clientsByBand: byBand,
        signalDistribution: signalDist,
        recentConnections: Math.max(0, total - previousTotal),
        recentDisconnections: Math.max(0, previousTotal - total)
      });
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch client stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    intervalRef.current = setInterval(fetchStats, refreshInterval * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refreshInterval, siteId]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Real-Time Clients
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchStats} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        {lastUpdate && (
          <CardDescription>Updated {lastUpdate.toLocaleTimeString()}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="text-center mb-4">
          <div className="text-4xl font-bold">{stats.totalClients}</div>
          <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
            {stats.recentConnections > 0 && <span className="text-green-500 flex items-center"><TrendingUp className="h-3 w-3" />+{stats.recentConnections}</span>}
            {stats.recentDisconnections > 0 && <span className="text-red-500 flex items-center ml-2"><TrendingDown className="h-3 w-3" />-{stats.recentDisconnections}</span>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center p-2 bg-muted rounded">
            <div className="text-lg font-semibold">{stats.clientsByBand['2.4GHz']}</div>
            <div className="text-xs text-muted-foreground">2.4 GHz</div>
          </div>
          <div className="text-center p-2 bg-muted rounded">
            <div className="text-lg font-semibold">{stats.clientsByBand['5GHz']}</div>
            <div className="text-xs text-muted-foreground">5 GHz</div>
          </div>
          <div className="text-center p-2 bg-muted rounded">
            <div className="text-lg font-semibold">{stats.clientsByBand['6GHz']}</div>
            <div className="text-xs text-muted-foreground">6 GHz</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Signal Quality</div>
          <div className="flex gap-1">
            <div className="flex-1 h-2 bg-green-500 rounded" style={{flex: stats.signalDistribution.excellent}} title={`Excellent: ${stats.signalDistribution.excellent}`} />
            <div className="flex-1 h-2 bg-blue-500 rounded" style={{flex: stats.signalDistribution.good}} title={`Good: ${stats.signalDistribution.good}`} />
            <div className="flex-1 h-2 bg-yellow-500 rounded" style={{flex: stats.signalDistribution.fair}} title={`Fair: ${stats.signalDistribution.fair}`} />
            <div className="flex-1 h-2 bg-red-500 rounded" style={{flex: stats.signalDistribution.poor}} title={`Poor: ${stats.signalDistribution.poor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
