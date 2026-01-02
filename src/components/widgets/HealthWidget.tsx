import React from 'react';
import { CheckCircle, XCircle, AlertCircle, Activity, Server, Wifi } from 'lucide-react';

interface HealthMetric {
  label: string;
  value: number;
  total?: number;
  status?: 'good' | 'warning' | 'critical';
  icon?: React.ReactNode;
}

interface NetworkHealthData {
  primaryActiveAPs: number;
  backupActiveAPs: number;
  inactiveAPs: number;
  lowPowerAPs: number;
  globalSyncStatus: string;
  mobilityStatus: boolean;
  linkStatus: string;
  activeSWs: number;
  inactiveSWs: number;
  troubleSWs: number;
}

interface HealthWidgetProps {
  title: string;
  metrics: HealthMetric[];
}

export const HealthWidget: React.FC<HealthWidgetProps> = ({ title, metrics }) => {
  if (!metrics || metrics.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 text-foreground">{title}</h3>
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          No data available
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4 text-foreground">{title}</h3>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {metrics.map((metric, index) => {
          const StatusIcon = getStatusIcon(metric.status);
          const statusColor = getStatusColor(metric.status);

          return (
            <div key={index} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {metric.icon || <StatusIcon className={`w-4 h-4 ${statusColor}`} />}
                <span className="text-xs text-muted-foreground">{metric.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${statusColor}`}>
                  {metric.value}
                </span>
                {metric.total !== undefined && (
                  <span className="text-sm text-muted-foreground">/ {metric.total}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface NetworkHealthWidgetProps {
  title?: string;
  data: NetworkHealthData;
}

export const NetworkHealthWidget: React.FC<NetworkHealthWidgetProps> = ({
  title = 'Network Health',
  data
}) => {
  const totalAPs = data.primaryActiveAPs + data.backupActiveAPs + data.inactiveAPs;
  const activeAPs = data.primaryActiveAPs + data.backupActiveAPs;
  const totalSWs = data.activeSWs + data.inactiveSWs + data.troubleSWs;

  const apHealthStatus = data.inactiveAPs > totalAPs * 0.2 ? 'critical' :
                        data.inactiveAPs > 0 ? 'warning' : 'good';

  const swHealthStatus = data.troubleSWs > 0 ? 'critical' :
                        data.inactiveSWs > 0 ? 'warning' : 'good';

  const metrics: HealthMetric[] = [
    {
      label: 'Active APs',
      value: activeAPs,
      total: totalAPs,
      status: apHealthStatus,
      icon: <Wifi className={`w-4 h-4 ${getStatusColor(apHealthStatus)}`} />
    },
    {
      label: 'Inactive APs',
      value: data.inactiveAPs,
      status: data.inactiveAPs > 0 ? 'warning' : 'good',
      icon: <XCircle className={`w-4 h-4 ${getStatusColor(data.inactiveAPs > 0 ? 'warning' : 'good')}`} />
    },
    {
      label: 'Low Power APs',
      value: data.lowPowerAPs,
      status: data.lowPowerAPs > 0 ? 'warning' : 'good',
      icon: <AlertCircle className={`w-4 h-4 ${getStatusColor(data.lowPowerAPs > 0 ? 'warning' : 'good')}`} />
    },
    {
      label: 'Active Switches',
      value: data.activeSWs,
      total: totalSWs > 0 ? totalSWs : undefined,
      status: swHealthStatus,
      icon: <Server className={`w-4 h-4 ${getStatusColor(swHealthStatus)}`} />
    }
  ];

  if (data.troubleSWs > 0) {
    metrics.push({
      label: 'Trouble Switches',
      value: data.troubleSWs,
      status: 'critical',
      icon: <XCircle className="w-4 h-4 text-red-500" />
    });
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4 text-foreground">{title}</h3>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        {metrics.map((metric, index) => {
          const StatusIcon = getStatusIcon(metric.status);
          const statusColor = getStatusColor(metric.status);

          return (
            <div key={index} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {metric.icon}
                <span className="text-xs text-muted-foreground">{metric.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${statusColor}`}>
                  {metric.value}
                </span>
                {metric.total !== undefined && (
                  <span className="text-sm text-muted-foreground">/ {metric.total}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Additional Status Info */}
      <div className="space-y-2 pt-4 border-t border-border">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Global Sync Status:</span>
          <span className={`font-semibold ${
            data.globalSyncStatus === 'Synchronized' ? 'text-green-500' : 'text-amber-500'
          }`}>
            {data.globalSyncStatus}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Mobility Status:</span>
          <span className={`font-semibold ${
            data.mobilityStatus ? 'text-green-500' : 'text-muted-foreground'
          }`}>
            {data.mobilityStatus ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Link Status:</span>
          <span className="font-semibold text-foreground">{data.linkStatus}</span>
        </div>
      </div>
    </div>
  );
};

function getStatusIcon(status?: 'good' | 'warning' | 'critical') {
  switch (status) {
    case 'good':
      return CheckCircle;
    case 'warning':
      return AlertCircle;
    case 'critical':
      return XCircle;
    default:
      return Activity;
  }
}

function getStatusColor(status?: 'good' | 'warning' | 'critical') {
  switch (status) {
    case 'good':
      return 'text-green-500';
    case 'warning':
      return 'text-amber-500';
    case 'critical':
      return 'text-red-500';
    default:
      return 'text-blue-500';
  }
}
