import { Users, Wifi, AppWindow, Menu, ArrowLeft } from 'lucide-react';
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
const ServiceLevelsEnhanced = lazy(() => import('./ServiceLevelsEnhanced').then(m => ({ default: m.ServiceLevelsEnhanced })));

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

  useEffect(() => {
    const loadSites = async () => {
      try {
        const sitesData = await apiService.getSites();
        setSites([{ id: 'all', name: 'All Sites' }, ...sitesData]);
      } catch (error) {
        console.error('Failed to load sites:', error);
      } finally {
        setLoading(false);
      }
    };
    loadSites();
  }, []);

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
  const isHome = !['connected-clients', 'access-points', 'app-insights', 'service-levels'].includes(currentPage);
  const showBackButton = !isHome;

  const renderPageContent = () => {
    switch (currentPage) {
      case 'connected-clients':
        return <TrafficStatsConnectedClients />;
      case 'access-points':
        return <AccessPoints />;
      case 'app-insights':
        return <AppInsights />;
      case 'service-levels':
        return <ServiceLevelsEnhanced />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
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
            <h1 className="text-xl font-bold">EDGE Controller</h1>
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

      {/* Main Content */}
      {isHome ? (
        /* Dashboard - Large Buttons */
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-muted-foreground mb-2">Quick Access</h2>

          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className="w-full p-6 bg-card border-2 border-border rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-95 text-left"
              >
                <div className="flex items-center gap-4">
                  <div className={`${item.color} p-4 rounded-xl`}>
                    <Icon className="h-8 w-8 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                  </div>
                </div>
              </button>
            );
          })}

          {/* More Options Button */}
          <button
            onClick={() => onNavigate('service-levels')}
            className="w-full p-4 border-2 border-dashed border-border rounded-xl text-center hover:bg-muted/50 transition-colors"
          >
            <Menu className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">More Options</p>
          </button>
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
