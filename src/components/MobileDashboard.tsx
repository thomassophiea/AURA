import { Users, Wifi, AppWindow, ArrowLeft, Activity, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { UserMenu } from './UserMenu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { useEffect, useState, Suspense, lazy } from 'react';
import { apiService } from '@/services/api';

// Lazy load main pages
const TrafficStatsConnectedClients = lazy(() => import('./TrafficStatsConnectedClients').then(m => ({ default: m.TrafficStatsConnectedClients })));
const AccessPoints = lazy(() => import('./AccessPoints').then(m => ({ default: m.AccessPoints })));
const AppInsights = lazy(() => import('./AppInsights').then(m => ({ default: m.AppInsights })));

interface MobileDashboardProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
  theme: 'light' | 'dark' | 'system';
  onThemeToggle: () => void;
  currentSite: string;
  onSiteChange: (siteId: string) => void;
}

export function MobileDashboard({
  currentPage,
  onNavigate,
  onLogout,
  theme,
  onThemeToggle,
  currentSite,
  onSiteChange,
}: MobileDashboardProps) {
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ clients: 0, aps: { total: 0, online: 0 } });
  const [statsLoading, setStatsLoading] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSites = async () => {
      try {
        setError(null);
        const sitesData = await apiService.getSites();
        setSites([{ id: 'all', name: 'All Sites' }, ...sitesData]);
      } catch (error) {
        console.error('Failed to load sites:', error);
        setError('Unable to load sites. Please check your connection.');
        setSites([{ id: 'all', name: 'All Sites' }]);
      } finally {
        setLoading(false);
      }
    };
    loadSites();
  }, []);

  // Load basic stats
  useEffect(() => {
    const loadStats = async () => {
      if (!currentSite) return;

      setStatsLoading(true);
      try {
        const [clientsData, apsData] = await Promise.all([
          apiService.getStations(),
          apiService.getAccessPoints()
        ]);

        const filteredClients = currentSite === 'all'
          ? clientsData
          : clientsData.filter((c: any) => c.siteId === currentSite);

        const filteredAPs = currentSite === 'all'
          ? apsData
          : apsData.filter((ap: any) => ap.siteId === currentSite);

        // Use same logic as AccessPoints component to determine if AP is online
        const onlineAPs = filteredAPs.filter((ap: any) => {
          const status = (ap.status || ap.connectionState || ap.operationalState || ap.state || '').toLowerCase();
          const isUp = ap.isUp;
          const isOnline = ap.online;

          return (
            status === 'inservice' ||
            status.includes('up') ||
            status.includes('online') ||
            status.includes('connected') ||
            isUp === true ||
            isOnline === true ||
            (!status && isUp !== false && isOnline !== false)
          );
        }).length;

        setStats({
          clients: filteredClients.length,
          aps: { total: filteredAPs.length, online: onlineAPs }
        });
      } catch (error) {
        console.error('Failed to load stats:', error);
        setError('Unable to load network statistics. Retrying...');
        setStats({ clients: 0, aps: { total: 0, online: 0 } });

        // Auto-retry after 5 seconds
        setTimeout(() => {
          setError(null);
          loadStats();
        }, 5000);
      } finally {
        setStatsLoading(false);
      }
    };

    loadStats();

    // Auto-refresh stats every 30 seconds
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [currentSite]);

  // Pull-to-refresh functionality
  const handleTouchStart = (e: React.TouchEvent) => {
    // Only trigger on home page and when scrolled to top
    if (isHome && window.scrollY === 0) {
      setTouchStart(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isHome && touchStart > 0) {
      const currentTouch = e.touches[0].clientY;
      const distance = currentTouch - touchStart;

      if (distance > 0 && distance < 120) {
        setPullDistance(distance);
      }
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance > 80) {
      setIsPulling(true);
      setPullDistance(0);
      setTouchStart(0);

      // Refresh data
      try {
        const [sitesData, clientsData, apsData] = await Promise.all([
          apiService.getSites(),
          apiService.getStations(),
          apiService.getAccessPoints()
        ]);

        setSites([{ id: 'all', name: 'All Sites' }, ...sitesData]);

        const filteredClients = currentSite === 'all'
          ? clientsData
          : clientsData.filter((c: any) => c.siteId === currentSite);

        const filteredAPs = currentSite === 'all'
          ? apsData
          : apsData.filter((ap: any) => ap.siteId === currentSite);

        const onlineAPs = filteredAPs.filter((ap: any) => {
          const status = (ap.status || ap.connectionState || ap.operationalState || ap.state || '').toLowerCase();
          const isUp = ap.isUp;
          const isOnline = ap.online;

          return (
            status === 'inservice' ||
            status.includes('up') ||
            status.includes('online') ||
            status.includes('connected') ||
            isUp === true ||
            isOnline === true ||
            (!status && isUp !== false && isOnline !== false)
          );
        }).length;

        setStats({
          clients: filteredClients.length,
          aps: { total: filteredAPs.length, online: onlineAPs }
        });
      } catch (error) {
        console.error('Failed to refresh:', error);
      } finally {
        setTimeout(() => setIsPulling(false), 500);
      }
    } else {
      setPullDistance(0);
      setTouchStart(0);
    }
  };

  const menuItems = [
    {
      id: 'connected-clients',
      title: 'Clients',
      subtitle: 'View connected devices',
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      id: 'access-points',
      title: 'Access Points',
      subtitle: 'Manage APs',
      icon: Wifi,
      color: 'bg-green-500',
    },
    {
      id: 'app-insights',
      title: 'Applications',
      subtitle: 'App analytics',
      icon: AppWindow,
      color: 'bg-purple-500',
    },
  ];

  // Check if we're on the home dashboard or a specific page
  const isHome = !['connected-clients', 'access-points', 'app-insights'].includes(currentPage);
  const showBackButton = !isHome;

  const renderPageContent = () => {
    switch (currentPage) {
      case 'connected-clients':
        return <TrafficStatsConnectedClients />;
      case 'access-points':
        return <AccessPoints />;
      case 'app-insights':
        return <AppInsights api={apiService} />;
      default:
        return null;
    }
  };

  return (
    <div
      className="min-h-screen bg-background"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(pullDistance > 0 || isPulling) && (
        <div
          className="fixed top-0 left-0 right-0 flex items-center justify-center transition-all duration-200 z-50"
          style={{
            height: `${Math.min(pullDistance, 80)}px`,
            opacity: isPulling ? 1 : Math.min(pullDistance / 80, 1)
          }}
        >
          <div className={`ptr-spinner ${isPulling ? 'animate-spin' : ''}`}></div>
        </div>
      )}
      {/* Top Bar */}
      <div className="sticky top-0 z-50 bg-background border-b border-border p-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            {showBackButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate('mobile-home')}
                className="p-2"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <h1 className="text-xl font-bold">EDGE</h1>
          </div>
          <UserMenu
            onLogout={onLogout}
            theme={theme}
            onThemeToggle={onThemeToggle}
            userEmail={localStorage.getItem('user_email') || undefined}
          />
        </div>

        {/* Site Selector - Only show on home */}
        {isHome && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Select Site</label>
            <Select value={currentSite} onValueChange={onSiteChange} disabled={loading}>
              <SelectTrigger className="w-full h-12 text-base">
                <SelectValue placeholder={loading ? 'Loading sites...' : 'Select a site'} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id} className="text-base py-3">
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-yellow-500">{error}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setError(null);
              window.location.reload();
            }}
            className="p-1 h-auto"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Main Content */}
      {isHome ? (
        /* Dashboard - Stats + Large Buttons */
        <div className="p-6 space-y-6">
          {/* Status Overview */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">Network Status</h2>
            <div className="grid grid-cols-2 gap-3">
              {/* Clients Card */}
              <div className="bg-card border-2 border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Clients</span>
                </div>
                <div className="text-3xl font-bold">
                  {statsLoading ? '...' : stats.clients}
                </div>
              </div>

              {/* APs Card */}
              <div className="bg-card border-2 border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wifi className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Access Points</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold">
                    {statsLoading ? '...' : stats.aps.online}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    / {stats.aps.total}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  {stats.aps.online === stats.aps.total ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : (
                    <Activity className="h-3 w-3 text-yellow-500" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {stats.aps.online === stats.aps.total ? 'All Online' : 'Some Offline'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Access Buttons */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">Quick Access</h2>
            <div className="space-y-3">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className="w-full p-5 bg-card border-2 border-border rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-95 text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`${item.color} p-3 rounded-xl`}>
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold">{item.title}</h3>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Page Content */
        <div className="p-4">
          <Suspense fallback={
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]" role="status">
                  <span className="sr-only">Loading...</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
              </div>
            </div>
          }>
            {renderPageContent()}
          </Suspense>
        </div>
      )}
    </div>
  );
}
