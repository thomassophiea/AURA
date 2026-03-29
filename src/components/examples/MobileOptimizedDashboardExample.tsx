/**
 * Mobile-Optimized Dashboard Example
 *
 * Demonstrates all 9 mobile optimization patterns:
 * 1. Tables → Cards on mobile
 * 2. Touch-friendly buttons (44px min)
 * 3. Simplified navigation
 * 4. Responsive grid layouts
 * 5. Lazy loading for performance
 * 6. Mobile-optimized modals (sheets)
 * 7. Hide non-essential info on mobile
 * 8. Mobile-optimized charts
 * 9. Swipe gesture support
 */

import { useState, lazy, Suspense } from 'react';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';
import { ResponsiveTable } from '@/components/ResponsiveTable';
import { ResponsiveDialog } from '@/components/ResponsiveDialog';
import { ResponsiveChart, useChartConfig } from '@/components/ResponsiveChart';
import { TouchButton } from '@/components/TouchButton';
import { MobileOnly, DesktopOnly } from '@/components/MobileOptimized';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  RefreshCw,
  Wifi,
  Users,
  Activity,
  Settings,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

// Pattern #5: Lazy loading for heavy components on mobile
const HeavyAnalyticsPanel = lazy(() => import('./HeavyAnalyticsPanel'));

interface AccessPoint {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'warning';
  clients: number;
  model: string;
  firmware: string;
  uptime: string;
  ipAddress: string;
}

const mockAccessPoints: AccessPoint[] = [
  {
    id: '1',
    name: 'AP-Building-A-Floor-1',
    status: 'online',
    clients: 24,
    model: 'AP510',
    firmware: '10.5.1',
    uptime: '45d 12h',
    ipAddress: '192.168.1.10',
  },
  {
    id: '2',
    name: 'AP-Building-A-Floor-2',
    status: 'online',
    clients: 18,
    model: 'AP510',
    firmware: '10.5.1',
    uptime: '45d 11h',
    ipAddress: '192.168.1.11',
  },
  {
    id: '3',
    name: 'AP-Building-B-Floor-1',
    status: 'warning',
    clients: 5,
    model: 'AP410',
    firmware: '10.4.9',
    uptime: '12d 3h',
    ipAddress: '192.168.1.20',
  },
];

const chartData = [
  { time: '00:00', clients: 45, throughput: 120 },
  { time: '04:00', clients: 23, throughput: 60 },
  { time: '08:00', clients: 89, throughput: 250 },
  { time: '12:00', clients: 125, throughput: 380 },
  { time: '16:00', clients: 98, throughput: 290 },
  { time: '20:00', clients: 67, throughput: 180 },
];

export function MobileOptimizedDashboardExample() {
  const { isMobile, isTablet } = useDeviceDetection();
  const chartConfig = useChartConfig();
  const [selectedAP, setSelectedAP] = useState<AccessPoint | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleRefresh = () => {
    toast.success('Refreshed data');
  };

  const handleSwipeLeft = (ap: AccessPoint) => {
    toast.info(`Swiped left on ${ap.name}`);
  };

  const handleSwipeRight = (ap: AccessPoint) => {
    setSelectedAP(ap);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header - responsive padding */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Mobile-Optimized Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Demonstrating all 9 mobile optimization patterns
          </p>
        </div>

        {/* Pattern #2: Touch-friendly buttons */}
        <div className="flex gap-2">
          <TouchButton onClick={handleRefresh} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </TouchButton>
          <TouchButton onClick={() => setIsDialogOpen(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </TouchButton>
        </div>
      </div>

      {/* Pattern #4: Responsive grid layouts - 1 col mobile, 2 tablet, 4 desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-2 hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total APs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 rounded-xl">
                <Wifi className="h-6 w-6 text-blue-600" />
              </div>
              <span className="text-3xl font-bold">248</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Connected Clients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-green-100 rounded-xl">
                <Users className="h-6 w-6 text-green-600" />
              </div>
              <span className="text-3xl font-bold">1,234</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Network Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-green-100 rounded-xl">
                <Activity className="h-6 w-6 text-green-600" />
              </div>
              <span className="text-3xl font-bold text-green-600">98%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Throughput
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-100 rounded-xl">
                <Activity className="h-6 w-6 text-purple-600" />
              </div>
              <span className="text-3xl font-bold">285 Mbps</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pattern #8: Mobile-optimized charts */}
      <Card>
        <CardHeader>
          <CardTitle>Network Activity - Last 24 Hours</CardTitle>
          {/* Pattern #7: Hide non-essential info on mobile */}
          <DesktopOnly>
            <p className="text-sm text-muted-foreground">
              Real-time monitoring of client connections and network throughput
            </p>
          </DesktopOnly>
        </CardHeader>
        <CardContent>
          <ResponsiveChart mobileHeight={200} desktopHeight={350}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                fontSize={chartConfig.fontSize}
                height={chartConfig.axisHeight}
              />
              <YAxis
                width={chartConfig.axisWidth}
                fontSize={chartConfig.fontSize}
              />
              <Tooltip />
              {/* Pattern #7: Hide legend on mobile */}
              {chartConfig.showLegend && <Legend />}
              <Line
                type="monotone"
                dataKey="clients"
                stroke="#3b82f6"
                strokeWidth={chartConfig.strokeWidth}
                dot={{ r: chartConfig.dotRadius }}
                animationDuration={chartConfig.animationDuration}
              />
              <Line
                type="monotone"
                dataKey="throughput"
                stroke="#10b981"
                strokeWidth={chartConfig.strokeWidth}
                dot={{ r: chartConfig.dotRadius }}
                animationDuration={chartConfig.animationDuration}
              />
            </LineChart>
          </ResponsiveChart>
        </CardContent>
      </Card>

      {/* Pattern #1: Tables → Cards on mobile, Pattern #9: Swipe gestures */}
      <Card>
        <CardHeader>
          <CardTitle>Access Points</CardTitle>
          <MobileOnly>
            <p className="text-xs text-muted-foreground">
              Swipe left to delete, right to configure
            </p>
          </MobileOnly>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            data={mockAccessPoints}
            getKey={(ap) => ap.id}
            onSwipeLeft={handleSwipeLeft}
            onSwipeRight={handleSwipeRight}
            mobileCardRender={(ap) => (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-base">{ap.name}</span>
                  <Badge
                    variant={
                      ap.status === 'online'
                        ? 'default'
                        : ap.status === 'warning'
                        ? 'secondary'
                        : 'destructive'
                    }
                  >
                    {ap.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {ap.clients} clients
                  </span>
                  <span>{ap.model}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    {ap.ipAddress}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            )}
            columns={[
              {
                key: 'name',
                header: 'Name',
                cell: (ap) => <span className="font-medium">{ap.name}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                cell: (ap) => (
                  <Badge
                    variant={
                      ap.status === 'online'
                        ? 'default'
                        : ap.status === 'warning'
                        ? 'secondary'
                        : 'destructive'
                    }
                  >
                    {ap.status}
                  </Badge>
                ),
              },
              {
                key: 'clients',
                header: 'Clients',
                cell: (ap) => (
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {ap.clients}
                  </span>
                ),
              },
              {
                key: 'model',
                header: 'Model',
                cell: (ap) => <span>{ap.model}</span>,
              },
              {
                key: 'firmware',
                header: 'Firmware',
                cell: (ap) => <span className="font-mono text-sm">{ap.firmware}</span>,
              },
              {
                key: 'uptime',
                header: 'Uptime',
                cell: (ap) => <span className="text-sm text-muted-foreground">{ap.uptime}</span>,
              },
              {
                key: 'ip',
                header: 'IP Address',
                cell: (ap) => (
                  <span className="font-mono text-sm">{ap.ipAddress}</span>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* Pattern #5: Lazy loading for heavy components */}
      <Card>
        <CardHeader>
          <CardTitle>Advanced Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          {isMobile || isTablet ? (
            <Suspense
              fallback={
                <div className="space-y-2">
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              }
            >
              <HeavyAnalyticsPanel />
            </Suspense>
          ) : (
            <div className="text-muted-foreground">
              Advanced analytics displayed on desktop
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pattern #6: Mobile-optimized modals (sheets on mobile, dialogs on desktop) */}
      <ResponsiveDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={selectedAP ? `Configure ${selectedAP.name}` : 'Settings'}
        description="Adjust your preferences and configuration"
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">AP Name</label>
              <input
                type="text"
                value={selectedAP?.name || ''}
                className="w-full mt-1 p-2 border rounded"
                readOnly
              />
            </div>
            <div>
              <label className="text-sm font-medium">Model</label>
              <input
                type="text"
                value={selectedAP?.model || 'N/A'}
                className="w-full mt-1 p-2 border rounded"
                readOnly
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <TouchButton onClick={() => setIsDialogOpen(false)}>
              Save Changes
            </TouchButton>
          </div>
        </div>
      </ResponsiveDialog>

      {/* Pattern #3: Simplified navigation hint */}
      <MobileOnly>
        <Card className="bg-[color:var(--status-info-bg)] border-[color:var(--status-info)]/30">
          <CardContent className="pt-6">
            <p className="text-sm text-[color:var(--status-info)]">
              💡 <strong>Tip:</strong> Use the menu button in the top-left to navigate between sections
            </p>
          </CardContent>
        </Card>
      </MobileOnly>
    </div>
  );
}
