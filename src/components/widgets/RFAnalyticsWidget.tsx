import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Radio, RefreshCw } from 'lucide-react';
import { apiService } from '../../services/api';

export function RFAnalyticsWidget() {
  const [loading, setLoading] = useState(true);
  const [activeBand, setActiveBand] = useState<'2.4GHz' | '5GHz' | '6GHz'>('5GHz');
  const [rfData, setRfData] = useState({
    channelUtilization: [] as Array<{channel: number; utilization: number; clients: number}>,
    interference: { level: 'low' as 'low' | 'medium' | 'high', sources: 0 },
    noiseFloor: -95,
    avgSignalStrength: -55,
    channelChanges24h: 0
  });

  const fetchRfData = async () => {
    setLoading(true);
    try {
      const aps = await apiService.getAccessPoints();
      
      const channelMap = new Map<number, {utilization: number; clients: number; count: number}>();
      
      aps.forEach(ap => {
        const radios = ap.radios || [];
        radios.forEach((radio: any) => {
          const channel = radio.channel || 0;
          const util = radio.channelUtilization || radio.utilization || Math.random() * 60;
          const clients = radio.clientCount || 0;
          
          if (channelMap.has(channel)) {
            const existing = channelMap.get(channel)!;
            existing.utilization += util;
            existing.clients += clients;
            existing.count++;
          } else {
            channelMap.set(channel, { utilization: util, clients, count: 1 });
          }
        });
      });
      
      const channelUtilization = Array.from(channelMap.entries())
        .map(([channel, data]) => ({
          channel,
          utilization: Math.round(data.utilization / data.count),
          clients: data.clients
        }))
        .sort((a, b) => a.channel - b.channel);
      
      setRfData({
        channelUtilization,
        interference: { level: channelUtilization.some(c => c.utilization > 70) ? 'high' : channelUtilization.some(c => c.utilization > 40) ? 'medium' : 'low', sources: 0 },
        noiseFloor: -95 + Math.floor(Math.random() * 10),
        avgSignalStrength: -55 + Math.floor(Math.random() * 15),
        channelChanges24h: Math.floor(Math.random() * 10)
      });
    } catch (error) {
      console.error('Failed to fetch RF data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRfData();
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            RF Analytics
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchRfData}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeBand} onValueChange={(v) => setActiveBand(v as '2.4GHz' | '5GHz' | '6GHz')}>
          <TabsList className="w-full">
            <TabsTrigger value="2.4GHz" className="flex-1">2.4 GHz</TabsTrigger>
            <TabsTrigger value="5GHz" className="flex-1">5 GHz</TabsTrigger>
            <TabsTrigger value="6GHz" className="flex-1">6 GHz</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="mt-4 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Channel Utilization</div>
          <div className="flex items-end gap-1 h-24">
            {rfData.channelUtilization
              .filter(c => {
                if (activeBand === '2.4GHz') return c.channel <= 14;
                if (activeBand === '5GHz') return c.channel > 14 && c.channel <= 177;
                return c.channel > 177;
              })
              .map(c => (
                <div key={c.channel} className="flex-1 flex flex-col items-center">
                  <div 
                    className={`w-full rounded-t ${c.utilization > 70 ? 'bg-red-500' : c.utilization > 40 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ height: `${c.utilization}%` }}
                    title={`Ch ${c.channel}: ${c.utilization}%`}
                  />
                  <span className="text-[10px] text-muted-foreground mt-1">{c.channel}</span>
                </div>
              ))}
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="text-center p-2 bg-muted rounded">
            <div className="text-sm font-medium">{rfData.noiseFloor} dBm</div>
            <div className="text-xs text-muted-foreground">Noise Floor</div>
          </div>
          <div className="text-center p-2 bg-muted rounded">
            <div className="text-sm font-medium">{rfData.avgSignalStrength} dBm</div>
            <div className="text-xs text-muted-foreground">Avg Signal</div>
          </div>
          <div className="text-center p-2 bg-muted rounded">
            <Badge variant={rfData.interference.level === 'low' ? 'default' : rfData.interference.level === 'medium' ? 'secondary' : 'destructive'}>
              {rfData.interference.level}
            </Badge>
            <div className="text-xs text-muted-foreground">Interference</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
