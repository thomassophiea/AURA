import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Users, Wifi, Activity, TrendingUp, Signal, Smartphone,
  WifiOff, CheckCircle, AlertCircle, ArrowUp, ArrowDown, Minus
} from 'lucide-react';
import type {
  ClientCountData,
  APHealthData,
  NetworkOverviewData,
  SiteRankingsData,
  ClientDistributionData,
  APRankingsData
} from '../../services/simplifiedWidgetService';

/**
 * Client Count Widget
 */
export function ClientCountWidget({ data }: { data: ClientCountData }) {
  const getTrendIcon = () => {
    if (data.trend === 'up') return <ArrowUp className="h-4 w-4 text-green-500" />;
    if (data.trend === 'down') return <ArrowDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-500" />;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
        <Users className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold flex items-center gap-2">
          {data.total}
          {getTrendIcon()}
        </div>
        <div className="mt-4 space-y-2">
          <p className="text-xs text-muted-foreground font-semibold">By Protocol</p>
          {data.byProtocol.slice(0, 3).map((item, index) => (
            <div key={index} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{item.protocol}</span>
              <span className="font-medium">{item.count}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * AP Health Widget
 */
export function APHealthWidget({ data }: { data: APHealthData }) {
  const getHealthColor = (uptime: number) => {
    if (uptime >= 95) return 'text-green-500';
    if (uptime >= 80) return 'text-amber-500';
    return 'text-red-500';
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Access Point Health</CardTitle>
        <Wifi className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="text-2xl font-bold">{data.total} APs</div>
            <p className="text-xs text-muted-foreground">Total access points</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <div>
                <div className="text-lg font-semibold">{data.online}</div>
                <p className="text-xs text-muted-foreground">Online</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <WifiOff className="h-4 w-4 text-red-500" />
              <div>
                <div className="text-lg font-semibold">{data.offline}</div>
                <p className="text-xs text-muted-foreground">Offline</p>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t">
            <div className={`text-xl font-bold ${getHealthColor(data.uptime)}`}>
              {data.uptime}%
            </div>
            <p className="text-xs text-muted-foreground">Uptime</p>
          </div>

          <div className="pt-2 border-t">
            <div className="text-lg font-semibold">{data.avgClientsPerAP}</div>
            <p className="text-xs text-muted-foreground">Avg clients per AP</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Network Overview Widget
 */
export function NetworkOverviewWidget({ data }: { data: NetworkOverviewData }) {
  const getHealthColor = (score: number) => {
    if (score >= 90) return 'text-green-500';
    if (score >= 70) return 'text-amber-500';
    return 'text-red-500';
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Network Overview</CardTitle>
        <Activity className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-bold">{data.totalSites}</div>
              <p className="text-xs text-muted-foreground">Sites</p>
            </div>
            <div>
              <div className="text-2xl font-bold">{data.totalAPs}</div>
              <p className="text-xs text-muted-foreground">APs</p>
            </div>
            <div>
              <div className="text-2xl font-bold">{data.totalClients}</div>
              <p className="text-xs text-muted-foreground">Clients</p>
            </div>
          </div>

          <div className="pt-2 border-t">
            <div className={`text-2xl font-bold ${getHealthColor(data.healthScore)}`}>
              {data.healthScore}%
            </div>
            <p className="text-xs text-muted-foreground">Health Score</p>
          </div>

          <div className="pt-2 border-t grid grid-cols-2 gap-4">
            <div>
              <div className="text-lg font-semibold flex items-center gap-1">
                <ArrowUp className="h-4 w-4 text-blue-500" />
                {data.throughput.upload} Mbps
              </div>
              <p className="text-xs text-muted-foreground">Upload</p>
            </div>
            <div>
              <div className="text-lg font-semibold flex items-center gap-1">
                <ArrowDown className="h-4 w-4 text-green-500" />
                {data.throughput.download} Mbps
              </div>
              <p className="text-xs text-muted-foreground">Download</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Site Rankings Widget
 */
export function SiteRankingsWidget({ data, title, metric }: {
  data: { name: string; value: number }[];
  title: string;
  metric: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data available</p>
          ) : (
            data.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold">
                    {index + 1}
                  </div>
                  <span className="text-sm font-medium truncate">{item.name}</span>
                </div>
                <span className="text-sm font-bold">{item.value} {metric}</span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Client Distribution Widget (Pie Chart Style)
 */
export function ClientDistributionWidget({ data, title, type }: {
  data: Array<{ label?: string; band?: string; ssid?: string; count: number; percentage: number }>;
  title: string;
  type: 'band' | 'ssid';
}) {
  const getColor = (index: number) => {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-amber-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500'
    ];
    return colors[index % colors.length];
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data available</p>
          ) : (
            data.slice(0, 6).map((item, index) => {
              const label = type === 'band' ? item.band : item.ssid;
              return (
                <div key={index} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${getColor(index)}`} />
                      <span className="font-medium truncate">{label}</span>
                    </div>
                    <span className="text-muted-foreground">{item.percentage}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${getColor(index)}`}
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * AP Rankings Widget
 */
export function APRankingsWidget({ data, title, metric, icon: Icon }: {
  data: Array<{ name: string; clients?: number; avgRssi?: number; site: string }>;
  title: string;
  metric: 'clients' | 'rssi';
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data available</p>
          ) : (
            data.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.site}</p>
                  </div>
                </div>
                <span className="text-sm font-bold flex-shrink-0 ml-2">
                  {metric === 'clients' ? `${item.clients} clients` : `${item.avgRssi} dBm`}
                </span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Manufacturer Distribution Widget
 */
export function ManufacturerWidget({ data }: { data: { manufacturer: string; count: number }[] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Top Manufacturers</CardTitle>
        <Smartphone className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {data.slice(0, 5).map((item, index) => {
            const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0;
            return (
              <div key={index} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground truncate flex-1">{item.manufacturer}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{item.count}</span>
                  <span className="text-xs text-muted-foreground">({percentage}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
