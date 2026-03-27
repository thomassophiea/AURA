import { useState, useEffect, lazy, Suspense, useMemo, startTransition } from 'react';
import { useGlobalFilters } from './hooks/useGlobalFilters';
import type { AssistantContext } from './components/NetworkChatbot';
import { LoginForm } from './components/LoginForm';
import { Sidebar } from './components/Sidebar';
import { MobileApp } from './components/mobile/MobileApp';
import { DetailSlideOut } from './components/DetailSlideOut';
import { PlaceholderPage } from './components/PlaceholderPage';
import { PerformanceAnalytics } from './components/PerformanceAnalytics';
import { ErrorBoundary } from './components/ErrorBoundary';

// Lazy load route components for better performance with prefetch
const DashboardEnhanced = lazy(() => import('./components/DashboardEnhanced').then(m => ({ default: m.DashboardEnhanced })));
const AccessPoints = lazy(() => import('./components/AccessPoints').then(m => ({ default: m.AccessPoints })));
const TrafficStatsConnectedClients = lazy(() => import('./components/TrafficStatsConnectedClients').then(m => ({ default: m.TrafficStatsConnectedClients })));

import { prefetchOnIdle } from './lib/prefetch';

const prefetchCriticalComponents = () => {
  prefetchOnIdle(() => import('./components/AccessPoints'));
  prefetchOnIdle(() => import('./components/TrafficStatsConnectedClients'));
  prefetchOnIdle(() => import('./components/ReportWidgets'));
  prefetchOnIdle(() => import('./components/ConfigureNetworks'));
};
const ServiceLevelsEnhanced = lazy(() => import('./components/ServiceLevelsEnhanced').then(m => ({ default: m.ServiceLevelsEnhanced })));
const SLEDashboard = lazy(() => import('./components/sle/SLEDashboard').then(m => ({ default: m.SLEDashboard })));
const AlertsEventsEnhanced = lazy(() => import('./components/AlertsEventsEnhanced').then(m => ({ default: m.AlertsEventsEnhanced })));
const ReportWidgets = lazy(() => import('./components/ReportWidgets').then(m => ({ default: m.ReportWidgets })));
const ConfigureNetworks = lazy(() => import('./components/ConfigureNetworks').then(m => ({ default: m.ConfigureNetworks })));
const ConfigureSites = lazy(() => import('./components/ConfigureSites').then(m => ({ default: m.ConfigureSites })));
const ConfigurePolicy = lazy(() => import('./components/ConfigurePolicy').then(m => ({ default: m.ConfigurePolicy })));
const ConfigureAAAPolicies = lazy(() => import('./components/ConfigureAAAPolicies').then(m => ({ default: m.ConfigureAAAPolicies })));
const ConfigureAdoptionRules = lazy(() => import('./components/ConfigureAdoptionRules').then(m => ({ default: m.ConfigureAdoptionRules })));
const ConfigureGuest = lazy(() => import('./components/ConfigureGuest').then(m => ({ default: m.ConfigureGuest })));
const ConfigureAdvanced = lazy(() => import('./components/ConfigureAdvanced').then(m => ({ default: m.ConfigureAdvanced })));
const Administration = lazy(() => import('./components/Administration').then(m => ({ default: m.Administration })));
const Tools = lazy(() => import('./components/Tools').then(m => ({ default: m.Tools })));
const ApiTestTool = lazy(() => import('./components/ApiTestTool').then(m => ({ default: m.ApiTestTool })));
const AccessPointDetail = lazy(() => import('./components/AccessPointDetail').then(m => ({ default: m.AccessPointDetail })));
const ClientDetail = lazy(() => import('./components/ClientDetail').then(m => ({ default: m.ClientDetail })));
const SiteDetail = lazy(() => import('./components/SiteDetail').then(m => ({ default: m.SiteDetail })));
const NetworkChatbot = lazy(() => import('./components/NetworkChatbot').then(m => ({ default: m.NetworkChatbot })));
const AppInsights = lazy(() => import('./components/AppInsights').then(m => ({ default: m.AppInsights })));
const PCIReport = lazy(() => import('./components/PCIReport').then(m => ({ default: m.PCIReport })));
const SystemBackupManager = lazy(() => import('./components/SystemBackupManager').then(m => ({ default: m.SystemBackupManager })));
const LicenseDashboard = lazy(() => import('./components/LicenseDashboard').then(m => ({ default: m.LicenseDashboard })));
const APFirmwareManager = lazy(() => import('./components/APFirmwareManager').then(m => ({ default: m.APFirmwareManager })));
const NetworkDiagnostics = lazy(() => import('./components/NetworkDiagnostics').then(m => ({ default: m.NetworkDiagnostics })));
const EventAlarmDashboard = lazy(() => import('./components/EventAlarmDashboard').then(m => ({ default: m.EventAlarmDashboard })));
const SecurityDashboard = lazy(() => import('./components/SecurityDashboard').then(m => ({ default: m.SecurityDashboard })));
const GuestManagement = lazy(() => import('./components/GuestManagement').then(m => ({ default: m.GuestManagement })));
const ApiDocumentation = lazy(() => import('./components/ApiDocumentation').then(m => ({ default: m.ApiDocumentation })));
const Workspace = lazy(() => import('./components/Workspace').then(m => ({ default: m.Workspace })));
const HelpPage = lazy(() => import('./components/HelpPage').then(m => ({ default: m.HelpPage })));
const SynthwaveMusicPlayer = lazy(() => import('./components/SynthwaveMusicPlayer').then(m => ({ default: m.SynthwaveMusicPlayer })));
import { apiService, ApiCallLog } from './services/api';
import { AppContextProvider } from './contexts/AppContext';
import { sleDataCollectionService } from './services/sleDataCollection';
import { Toaster } from './components/ui/sonner';
import { PageSkeleton, getSkeletonVariant } from './components/ui/PageSkeleton';
import { Button } from './components/ui/button';
import { Activity, Sun, Moon, Braces, Github, FlaskConical, BarChart3, Bell, LayoutGrid } from 'lucide-react';
import { AppsMenu } from './components/AppsMenu';
import { UserMenu } from './components/UserMenu';
import { NotificationsMenu } from './components/NotificationsMenu';
import { tenantService } from './services/tenantService';
import { DevModePanel } from './components/DevModePanel';
import { VersionDisplay } from './components/VersionDisplay';
import { toast } from 'sonner';
import { applyTheme as applyThemeColors } from './lib/themes';
import { useDeviceDetection } from './hooks/useDeviceDetection';

const pageInfo = {
  'workspace': { title: 'Workspace', description: 'Create custom widgets for Devices, Clients, Licensing, and Alerts' },
  'service-levels': { title: 'Contextual Insights', description: 'Context-aware network monitoring and analytics' },
  'sle-dashboard': { title: 'Service Levels', description: 'SLE metrics with drill-down classifier analysis' },
  'app-insights': { title: 'App Insights', description: 'Application visibility and traffic analytics' },
  'connected-clients': { title: 'Connected Clients', description: 'View and manage connected devices' },
  'access-points': { title: 'Access Points', description: 'Manage and monitor wireless access points' },
  'sites-overview': { title: 'Sites Overview', description: 'View and manage network sites' },
  'configure-aaa': { title: 'AAA Policies', description: 'Configure authentication, authorization, and accounting' },
  'configure-devices': { title: 'Devices', description: 'Configure switches and access points' },
  'configure-policy': { title: 'Policies', description: 'Configure network policies' },
  'configure-guest': { title: 'Guest Access', description: 'Configure guest network settings' },
  'performance-analytics': { title: 'Performance Analytics', description: 'Analyze network performance and trends' },
  'network-visualization': { title: 'Network Visualization', description: 'Visualize network topology and connections' },
  'report-widgets': { title: 'Report Widgets', description: 'Real-time analytics and monitoring widgets' },
  'pci-report': { title: 'PCI DSS Report', description: 'Generate PCI DSS compliance reports for cardholder data environments' },
  'system-backup': { title: 'Backup & Storage', description: 'Manage configuration backups and flash memory storage' },
  'license-dashboard': { title: 'License Management', description: 'View and manage system licenses' },
  'firmware-manager': { title: 'Firmware Manager', description: 'Manage AP firmware upgrades and schedules' },
  'network-diagnostics': { title: 'Network Diagnostics', description: 'Test network connectivity with ping, traceroute, and DNS' },
  'event-alarm-dashboard': { title: 'Events & Alarms', description: 'Monitor system events and manage alarms' },
  'security-dashboard': { title: 'Security Dashboard', description: 'Rogue AP detection and security threat monitoring' },
  'guest-management': { title: 'Guest Access', description: 'Manage guest wireless access accounts' },
  'administration': { title: 'Administration', description: 'System administration, users, applications, and licensing' },
  'api-test': { title: 'API Test Tool', description: 'Test and explore API endpoints' },
  'api-documentation': { title: 'API Documentation', description: 'AURA REST API reference' },
  'configure-sites': { title: 'Sites', description: 'Manage and configure network sites and locations' },
  'configure-networks': { title: 'Configure Networks', description: 'Set up and manage network configurations' },
  'configure-advanced': { title: 'Advanced Configuration', description: 'Topologies, QoS, AP Profiles, IoT, Mesh, Access Control, and Location Services' },
  'help': { title: 'Help & Support', description: 'Get assistance with the EDGE platform using AI' },
};

interface DetailPanelState {
  isOpen: boolean;
  type: 'access-point' | 'client' | 'site' | null;
  data: any;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentPage, setCurrentPage] = useState('sle-dashboard');
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [justLoggedIn, setJustLoggedIn] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'synthwave' | 'ep1' | 'system'>('system');
  const [detailPanel, setDetailPanel] = useState<DetailPanelState>({
    isOpen: false,
    type: null,
    data: null
  });
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [isMusicPlayerDismissed, setIsMusicPlayerDismissed] = useState(false);
  const [networkAssistantEnabled, setNetworkAssistantEnabled] = useState(() => {
    // Default to false - hidden by default
    return localStorage.getItem('networkAssistantEnabled') === 'true';
  });
  const [isDevModeOpen, setIsDevModeOpen] = useState(false);
  const [apiLogs, setApiLogs] = useState<ApiCallLog[]>([]);
  const [devPanelHeight, setDevPanelHeight] = useState(0);
  const [siteName, setSiteName] = useState<string>('');

  // Global filters for site context
  const { filters, updateFilter } = useGlobalFilters();

  // Device detection for responsive design
  const device = useDeviceDetection();

  // Compute assistant context based on current state
  const assistantContext = useMemo((): AssistantContext | undefined => {
    // If a detail panel is open, use that as context
    if (detailPanel.isOpen && detailPanel.type && detailPanel.data) {
      if (detailPanel.type === 'client') {
        return {
          type: 'client',
          entityId: detailPanel.data.macAddress,
          entityName: detailPanel.data.hostName || detailPanel.data.macAddress,
          siteId: filters.site !== 'all' ? filters.site : undefined,
          siteName: siteName || undefined,
          timeRange: filters.timeRange
        };
      }
      if (detailPanel.type === 'access-point') {
        return {
          type: 'access-point',
          entityId: detailPanel.data.serialNumber,
          entityName: detailPanel.data.displayName || detailPanel.data.serialNumber,
          siteId: filters.site !== 'all' ? filters.site : undefined,
          siteName: siteName || undefined,
          timeRange: filters.timeRange
        };
      }
      if (detailPanel.type === 'site') {
        return {
          type: 'site',
          entityId: detailPanel.data.siteId,
          entityName: detailPanel.data.siteName,
          siteId: detailPanel.data.siteId,
          siteName: detailPanel.data.siteName,
          timeRange: filters.timeRange
        };
      }
    }
    // If a site is selected in global filters, use site context
    if (filters.site && filters.site !== 'all') {
      return {
        type: 'site',
        siteId: filters.site,
        siteName: siteName || undefined,
        timeRange: filters.timeRange
      };
    }
    // No specific context
    return undefined;
  }, [detailPanel, filters, siteName]);

  useEffect(() => {
    // Initialize theme from localStorage or system preference
    const initializeTheme = () => {
      const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'synthwave' | 'ep1' | 'system' | null;
      const initialTheme = savedTheme || 'system';

      setTheme(initialTheme);
      applyThemeForMode(initialTheme);
    };

    // Check if user is already authenticated - trust stored tokens
    const initializeAuth = async () => {
      if (apiService.isAuthenticated()) {
        console.log('[App] ✅ Found valid session - restoring authentication');
        setIsAuthenticated(true);
        setAdminRole(apiService.getAdminRole());

        // Load site information — use first available site from the account
        try {
          const sites = await apiService.getSites();
          if (sites && sites.length > 0) {
            const firstSite = sites[0];
            const displayName = firstSite.displayName || firstSite.name || firstSite.siteName || 'Site';
            setSiteName(displayName);
          }
        } catch (error) {
          console.error('[App] Failed to load site name:', error);
          setSiteName('Site');
        }

        // Start SLE data collection automatically on successful authentication
        console.log('[App] Starting SLE data collection service');
        sleDataCollectionService.startCollection();
      } else {
        // No stored session - show login screen
        console.log('[App] No valid session found - showing login screen');
        setIsAuthenticated(false);
      }
    };

    initializeTheme();
    initializeAuth();

    // Subscribe to API logs for developer mode
    const unsubscribe = apiService.subscribeToApiLogs(() => {
      // Update logs whenever there's a new log entry
      setApiLogs(apiService.getApiLogs());
    });

    // Initialize with current logs
    setApiLogs(apiService.getApiLogs());

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      // Only auto-switch if user has selected system theme
      const savedTheme = localStorage.getItem('theme');
      if (!savedTheme || savedTheme === 'system') {
        const systemTheme = e.matches ? 'dark' : 'light';
        applyTheme(systemTheme);
      }
    };
    
    mediaQuery.addEventListener('change', handleSystemThemeChange);

    // Periodically check authentication status (very infrequently)
    // Only check if tokens are present - rely on API errors for actual session validation
    const authCheckInterval = setInterval(async () => {
      // Only check if we think we're authenticated
      if (isAuthenticated) {
        // Check if tokens are still present in localStorage
        const accessToken = localStorage.getItem('access_token');
        const refreshToken = localStorage.getItem('refresh_token');

        // If tokens are missing but we think we're authenticated, log out
        if (!accessToken || !refreshToken) {
          console.log('[Auth] Authentication tokens missing - logging out');
          handleSessionExpired();
          return;
        }
      }
    }, 300000); // Check every 5 minutes (reduced from 60 seconds)

    // Listen for session expiration errors
    const handleSessionExpired = () => {
      console.log('Session expired - logging out user');
      setIsAuthenticated(false);
      setAdminRole(null);
      setCurrentPage('service-levels');
      // Cancel any pending requests
      apiService.cancelAllRequests();
      toast.error('Session expired', {
        description: 'Please login again to continue.'
      });
    };

    // Set up API service session expiration handler
    apiService.setSessionExpiredHandler(handleSessionExpired);

    // Cancel requests when page becomes hidden (user switches tabs/minimizes)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('Page hidden, canceling pending requests');
        apiService.cancelAllRequests();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cancel requests when user is about to leave the page
    const handleBeforeUnload = () => {
      apiService.cancelAllRequests();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Enhanced error handling for API calls throughout the app
    // Global error handler for script errors and reference errors
    const handleGlobalError = (event: ErrorEvent) => {
      const errorMessage = event.message || '';
      
      // Suppress browser/development environment errors
      const suppressedPatterns = [
        'errorDetails is not defined',
        'Failed to parse error response',
        'Error reading response text',
        'ReferenceError: errorDetails is not defined',
        'Message getPage',
        'getPage (id:',
        'response timed out after',
        'SUPPRESSED_ANALYTICS_ERROR',
        'SUPPRESSED_NON_CRITICAL_ERROR',
        'Failed to load roles',
        'Network error for /v1/roles',
        'Network error for /v1/clients',
        '/v1/clients',
        '/v1/sites',
        'Network error for /v1/sites',
        '/v1/applications',
        'Network error for /v1/applications',
        'NetworkVisualization',
        'fetching topology',
        'Unable to connect to the controller',
        '/v1/system/time',
        '/v1/system/info',
        '/v1/system/logging',
        '/v1/system/maintenance',
        '/v3/topologies',
        'Network error for /v3/topologies',
        '/v3/cos',
        'Network error for /v3/cos',
        '/api/sle/metrics/timeseries',
        'Network error for /api/sle/metrics/timeseries',
        '/v1/dashboard',
        '/v1/reports/dashboard',
        '/v1/aps/reports/dashboard',
        '/v1/aps/report',
        'Dashboard endpoint not available',
        'Can not find AP',
        'All dashboard loading methods failed',
        'Dashboard endpoints unavailable',
        '[Dashboard]',
        '/v1/aps timed out',
        'Request to /v1/aps timed out',
        'Error loading filter options',
        'Error loading access points',
        'timeout',
        'timed out',
        '15000ms',
        '30000ms',
        '[SLE Collection]',
        'SLE Collection',
        'No access token available',
        'not authenticated',
        '/v1/notifications',
        'Network error for /v1/notifications',
        '/v1/services',
        'Network error for /v1/services',
        'Request to /v1/aps failed',
        'Request to /v1/notifications failed',
        'Request to /v1/services failed',
        'Session expired. Please login again.'
      ];
      
      if (suppressedPatterns.some(pattern => errorMessage.includes(pattern))) {
        event.preventDefault();
        return false;
      }
      
      // Log legitimate errors for debugging
      if (!errorMessage.toLowerCase().includes('timeout')) {
        console.log('Global error caught:', errorMessage);
      }
    };
    
    window.addEventListener('error', handleGlobalError);

    window.addEventListener('unhandledrejection', (event) => {
      if (event.reason) {
        const errorMessage = typeof event.reason === 'object' && event.reason.message 
          ? event.reason.message 
          : String(event.reason);
        
        // Don't suppress session expired errors for critical endpoints
        if (errorMessage.includes('Session expired') && 
            (errorMessage.includes('/v1/services') || 
             errorMessage.includes('/v1/roles') || 
             errorMessage.includes('/v1/networks') ||
             errorMessage.includes('Failed to load services') ||
             errorMessage.includes('Failed to load roles'))) {
          // Allow these to propagate so they trigger logout
          console.log('Critical session expiration detected:', errorMessage);
          return; // Don't prevent default, let it propagate
        }
        
        // Comprehensive suppression patterns - simplified approach
        const suppressedPatterns = [
          'timeout', 'TIMEOUT', 'timed out', 'TIMED OUT',
          'Message getPage', 'getPage (id:', 'response timed out after',
          'SUPPRESSED_ANALYTICS_ERROR', 'SUPPRESSED_NON_CRITICAL_ERROR', 'errorDetails is not defined',
          'Failed to parse error response', 'Error reading response text',
          'Countries API not available',
          '/v1/bestpractices', 'bestpractices', '/bestpractices/evaluate',
          '/v1/clients', 'Network error for /v1/clients',
          '/v1/sites', 'Network error for /v1/sites',
          '/v1/applications', 'Network error for /v1/applications',
          'NetworkVisualization', 'fetching topology',
          'Unable to connect to the controller',
          '6000ms', '30000ms', '15000ms',
          '/v1/system/time', '/v1/system/info', '/v1/system/logging', '/v1/system/maintenance',
          '/v3/topologies', 'Network error for /v3/topologies',
          '/v3/cos', 'Network error for /v3/cos',
          '/api/sle/metrics/timeseries', 'Network error for /api/sle/metrics/timeseries',
          '/v1/dashboard', '/v1/reports/dashboard', '/v1/aps/reports/dashboard',
          '/v1/aps/report', 'Dashboard endpoint not available', 'Can not find AP',
          'All dashboard loading methods failed', 'Dashboard endpoints unavailable',
          '[Dashboard]', '/v1/aps timed out', 'Request to /v1/aps timed out',
          'Error loading filter options', 'Error loading access points'
        ];
        
        if (suppressedPatterns.some(pattern => 
          errorMessage.toLowerCase().includes(pattern.toLowerCase())
        )) {
          event.preventDefault();
          return;
        }
      }

      // Handle session expiration for core endpoints only
      if (event.reason && typeof event.reason === 'object' && event.reason.message) {
        const errorMessage = event.reason.message;
        
        // Handle session expiration for critical endpoints
        if (errorMessage.includes('Session expired') || errorMessage.includes('Authentication required')) {
          const isCoreEndpoint = 
            (errorMessage.includes('/v1/aps') && !errorMessage.includes('/v1/aps/report')) ||
            errorMessage.includes('/v1/aps/query/columns') ||
            errorMessage.includes('/v1/services') ||
            errorMessage.includes('/v1/roles') ||
            errorMessage.includes('/v1/networks') ||
            errorMessage.includes('Error loading access points for site') ||
            errorMessage.includes('Failed to load services') ||
            errorMessage.includes('Failed to load roles');
          
          if (isCoreEndpoint) {
            console.log('Session expired for core endpoint - forcing logout:', errorMessage);
            handleSessionExpired();
            event.preventDefault();
            return;
          }
        }
        
        // Show legitimate timeout errors for user actions only
        if ((errorMessage.includes('timed out') || errorMessage.includes('timeout')) && 
            !errorMessage.includes('SUPPRESSED_ANALYTICS_ERROR') &&
            !errorMessage.includes('SUPPRESSED_NON_CRITICAL_ERROR') &&
            !errorMessage.includes('/v1/roles') &&
            !errorMessage.includes('/v1/events') &&
            !errorMessage.includes('/v1/countries') &&
            !errorMessage.includes('/v1/sites') &&
            !errorMessage.includes('/v1/applications') &&
            !errorMessage.includes('Message getPage')) {
          
          console.warn('Request timeout detected:', errorMessage);
          toast.error('Request timed out', {
            description: 'The controller took too long to respond.',
            duration: 4000
          });
          event.preventDefault();
          return;
        }
        
        // Handle network errors - suppress only analytics endpoints
        if ((errorMessage.includes('Network') || errorMessage.includes('Failed to fetch')) &&
            !errorMessage.includes('SUPPRESSED_ANALYTICS_ERROR') &&
            !errorMessage.includes('SUPPRESSED_NON_CRITICAL_ERROR') &&
            !errorMessage.includes('/v1/events') &&
            !errorMessage.includes('/v1/countries') &&
            !errorMessage.includes('/v1/bestpractices') &&
            !errorMessage.includes('/v1/clients') &&
            !errorMessage.includes('/v1/sites') &&
            !errorMessage.includes('/v1/applications') &&
            !errorMessage.includes('/v1/system/time') &&
            !errorMessage.includes('/v1/system/info') &&
            !errorMessage.includes('/v1/system/logging') &&
            !errorMessage.includes('/v1/system/maintenance') &&
            !errorMessage.includes('NetworkVisualization') &&
            !document.hidden) {
          
          // Don't show duplicate toasts - let component-level error handling display the error
          console.warn('Network error:', errorMessage);
          event.preventDefault();
          return;
        }
      }
      
      // Handle string-based errors
      if (event.reason && typeof event.reason === 'string') {
        const errorString = event.reason;
        
        // Handle core endpoint session expiration
        if (errorString.includes('Session expired') && 
            (errorString.includes('/v1/aps') || 
             errorString.includes('/v1/services') ||
             errorString.includes('/v1/roles') ||
             errorString.includes('/v1/networks'))) {
          console.log('Session expired for core endpoint - forcing logout:', errorString);
          handleSessionExpired();
          event.preventDefault();
          return;
        }
      }
    });

    // Simplified console override for suppressed errors
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    
    console.error = (...args) => {
      const errorString = args.join(' ');
      
      // Never suppress session expired errors for critical endpoints
      if (errorString.includes('Session expired') &&
          (errorString.includes('/v1/services') ||
           errorString.includes('/v1/roles') ||
           errorString.includes('/v1/networks') ||
           errorString.includes('Failed to load services') ||
           errorString.includes('Failed to load roles'))) {
        originalConsoleError.apply(console, args);
        return;
      }
      
      // Suppress development/browser environment errors only
      const suppressedPatterns = [
        'SUPPRESSED_ANALYTICS_ERROR', 'SUPPRESSED_NON_CRITICAL_ERROR', 'Message getPage', 'getPage (id:',
        'Countries API not available', '/v1/events', '/v1/countries',
        '/v1/bestpractices', 'errorDetails is not defined',
        '/v1/clients', 'Network error for /v1/clients',
        '/v1/sites', 'Network error for /v1/sites',
        '/v1/applications', 'Network error for /v1/applications',
        'NetworkVisualization', 'fetching topology',
        'Unable to connect to the controller',
        '/v1/system/time', '/v1/system/info', '/v1/system/logging', '/v1/system/maintenance',
        '/v3/topologies', 'Network error for /v3/topologies',
        '/v3/cos', 'Network error for /v3/cos',
        '/api/sle/metrics/timeseries', 'Network error for /api/sle/metrics/timeseries',
        '/v1/dashboard', '/v1/reports/dashboard', '/v1/aps/reports/dashboard',
        '/v1/aps/report', 'Dashboard endpoint not available', 'Can not find AP',
        'All dashboard loading methods failed', 'Dashboard endpoints unavailable',
        '[Dashboard]', '/v1/aps timed out', 'Request to /v1/aps timed out',
        'Error loading filter options', 'Error loading access points',
        'timeout', 'timed out', '15000ms', '30000ms'
      ];

      if (suppressedPatterns.some(pattern => errorString.includes(pattern))) {
        return; // Silently suppress
      }

      // Call original console.error for legitimate errors
      originalConsoleError.apply(console, args);
    };
    
    console.warn = (...args) => {
      const warnString = args.join(' ');
      
      // Never suppress session expired errors for critical endpoints
      if (warnString.includes('Session expired') &&
          (warnString.includes('/v1/services') ||
           warnString.includes('/v1/roles') ||
           warnString.includes('/v1/networks') ||
           warnString.includes('Failed to load services') ||
           warnString.includes('Failed to load roles'))) {
        originalConsoleWarn.apply(console, args);
        return;
      }
      
      // Suppress warnings for analytics endpoints
      const suppressedPatterns = [
        'SUPPRESSED_ANALYTICS_ERROR', 'SUPPRESSED_NON_CRITICAL_ERROR', '/v1/events', '/v1/countries',
        '/v1/bestpractices', 'Countries API not available',
        '/v1/clients', 'Network error for /v1/clients',
        '/v1/sites', 'Network error for /v1/sites',
        '/v1/applications', 'Network error for /v1/applications',
        'NetworkVisualization', 'fetching topology',
        'Unable to connect to the controller',
        '/v1/system/time', '/v1/system/info', '/v1/system/logging', '/v1/system/maintenance',
        '/v3/topologies', 'Network error for /v3/topologies',
        '/v3/cos', 'Network error for /v3/cos',
        '/api/sle/metrics/timeseries', 'Network error for /api/sle/metrics/timeseries',
        '/v1/dashboard', '/v1/reports/dashboard', '/v1/aps/reports/dashboard',
        '/v1/aps/report', 'Dashboard endpoint not available', 'Can not find AP',
        'All dashboard loading methods failed', 'Dashboard endpoints unavailable',
        '[Dashboard]', '/v1/aps timed out', 'Request to /v1/aps timed out',
        'Error loading filter options', 'Error loading access points',
        'timeout', 'timed out', '15000ms', '30000ms'
      ];
      
      if (suppressedPatterns.some(pattern => warnString.includes(pattern))) {
        return; // Silently suppress
      }
      
      // Call original console.warn for legitimate warnings
      originalConsoleWarn.apply(console, args);
    };

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Restore original console methods
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      // Remove window error listeners
      window.removeEventListener('error', handleGlobalError);
      // Remove system theme listener
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
      // Clear auth check interval
      clearInterval(authCheckInterval);
      // Cancel any pending requests on cleanup
      apiService.cancelAllRequests();
      // Unsubscribe from API logs
      unsubscribe();
    };
  }, []);

  // All special themes that layer on top of dark mode
  const DARK_OVERLAY_THEMES = ['synthwave', 'pirate', 'mi5', 'ep1'] as const;

  // Helper function to apply theme to document
  const applyTheme = (newTheme: string) => {
    const root = document.documentElement;

    // All overlay themes use dark as their base
    const isDarkOverlay = DARK_OVERLAY_THEMES.includes(newTheme as any);
    const baseTheme = newTheme === 'light' ? 'default' : newTheme === 'ep1' ? 'ep1' : 'dark';
    applyThemeColors(baseTheme);

    // Remove existing theme classes
    root.classList.remove('light', 'dark', 'synthwave', 'pirate', 'mi5', 'ep1');

    if (isDarkOverlay) {
      root.classList.add('dark', newTheme);
    } else {
      root.classList.add(newTheme);
    }

    // Set data attribute for theme as well (for compatibility)
    root.setAttribute('data-theme', newTheme);

    // Ensure body also gets the theme class
    document.body.classList.remove('light', 'dark', 'synthwave', 'pirate', 'mi5', 'ep1');
    if (isDarkOverlay) {
      document.body.classList.add('dark', newTheme);
    } else {
      document.body.classList.add(newTheme);
    }
  };

  // Helper function to apply theme based on mode (handles system detection)
  const applyThemeForMode = (mode: 'light' | 'dark' | 'synthwave' | 'ep1' | 'system') => {
    if (mode === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      applyTheme(systemTheme);
    } else {
      applyTheme(mode);
    }
  };

  const toggleTheme = () => {
    const newTheme =
      theme === 'light' ? 'dark' :
      theme === 'dark' ? 'synthwave' :
      theme === 'synthwave' ? 'ep1' :
      theme === 'ep1' ? 'system' :
      'light';
    setTheme(newTheme);
    applyThemeForMode(newTheme);

    // Reset music player when switching to synthwave
    if (newTheme === 'synthwave') {
      setIsMusicPlayerDismissed(false);
    }

    // Save to localStorage
    localStorage.setItem('theme', newTheme);

    // Show a toast notification
    const themeLabel =
      newTheme === 'system' ? 'System (Auto)' :
      newTheme === 'synthwave' ? 'Miami Vice' :
      newTheme === 'ep1' ? 'EP1' :
      newTheme.charAt(0).toUpperCase() + newTheme.slice(1);

    const themeDescription =
      newTheme === 'system' ? 'The interface will now follow your system preference.' :
      newTheme === 'synthwave' ? 'Welcome to Miami. Neon lights activated.' :
      newTheme === 'ep1' ? 'Extreme Platform ONE theme activated.' :
      `The interface is now using ${newTheme} theme.`;

    toast.success(`Switched to ${themeLabel} mode`, {
      description: themeDescription,
      duration: 2000
    });
  };

  const handleLoginSuccess = async () => {
    setIsAuthenticated(true);
    setAdminRole(apiService.getAdminRole());
    setJustLoggedIn(true);

    // Clear the flag after 5 seconds to allow normal session validation
    setTimeout(() => setJustLoggedIn(false), 5000);

    // Prefetch critical components for faster navigation
    prefetchCriticalComponents();

    // Load site information — use first available site from the account
    try {
      const sites = await apiService.getSites();
      if (sites && sites.length > 0) {
        const firstSite = sites[0];
        const displayName = firstSite.displayName || firstSite.name || firstSite.siteName || 'Site';
        setSiteName(displayName);
      }
    } catch (error) {
      console.error('[App] Failed to load site name:', error);
      setSiteName('Site');
    }

    // Start SLE data collection on login
    console.log('[App] Starting SLE data collection service after login');
    sleDataCollectionService.startCollection();
  };

  const handleLogout = async () => {
    // Stop SLE data collection on logout
    console.log('[App] Stopping SLE data collection service on logout');
    sleDataCollectionService.stopCollection();
    
    await apiService.logout();
    setIsAuthenticated(false);
    setAdminRole(null);
    setCurrentPage('service-levels');
  };

  const handlePageChange = (page: string) => {
    // Cancel any pending API requests when switching pages
    console.log(`Switching to page: ${page}, canceling pending requests`);
    apiService.cancelAllRequests();
    
    // Use startTransition to keep old content visible while loading new page
    startTransition(() => {
      setCurrentPage(page);
    });
    // Close detail panel when changing pages
    setDetailPanel({ isOpen: false, type: null, data: null });
  };

  const handleShowAccessPointDetail = (serialNumber: string, displayName?: string) => {
    setDetailPanel({
      isOpen: true,
      type: 'access-point',
      data: { serialNumber, displayName }
    });
  };

  const handleShowClientDetail = (macAddress: string, hostName?: string) => {
    setDetailPanel({
      isOpen: true,
      type: 'client',
      data: { macAddress, hostName }
    });
  };

  const handleShowSiteDetail = (siteId: string, siteName: string) => {
    setDetailPanel({
      isOpen: true,
      type: 'site',
      data: { siteId, siteName }
    });
  };

  // Toggle Network Assistant preference
  const handleToggleNetworkAssistant = (enabled: boolean) => {
    setNetworkAssistantEnabled(enabled);
    localStorage.setItem('networkAssistantEnabled', String(enabled));
    // Close the chatbot if disabling
    if (!enabled) {
      setIsChatbotOpen(false);
    }
  };

  const handleCloseDetailPanel = () => {
    setDetailPanel({ isOpen: false, type: null, data: null });
  };

  const handleQuickTest = async () => {
    setIsTestingConnection(true);
    
    try {
      // Test basic connectivity with a simple API call and shorter timeout
      const response = await apiService.makeAuthenticatedRequest('/v1/globalsettings', {
        method: 'GET'
      }, 4000); // 4 second timeout for quick test
      
      if (response.ok) {
        toast.success('Connection test successful!', {
          description: 'Mobility Engine API is reachable and authenticated.'
        });
      } else {
        toast.error('Connection test failed', {
          description: `API returned status: ${response.status} ${response.statusText}`
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error';
      console.warn('Quick test failed:', errorMessage);
      
      // Only show toast for explicit user-initiated test, not automatic failures
      if (!errorMessage.includes('SUPPRESSED_ANALYTICS_ERROR') && 
          !errorMessage.includes('SUPPRESSED_NON_CRITICAL_ERROR')) {
        toast.error('Connection test failed', {
          description: errorMessage.includes('timed out') 
            ? 'Connection test timed out - server may be slow or unreachable'
            : 'Unable to reach the controller API'
        });
      }
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleToggleDevMode = () => {
    setIsDevModeOpen(!isDevModeOpen);
    if (!isDevModeOpen) {
      toast.info('Developer mode enabled', {
        description: 'API calls will now be tracked in real-time',
        duration: 2000
      });
    }
  };

  const handleClearApiLogs = () => {
    apiService.clearApiLogs();
    setApiLogs([]);
    toast.success('API logs cleared');
  };

  if (!isAuthenticated) {
    return (
      <LoginForm 
        onLoginSuccess={handleLoginSuccess} 
        theme={theme}
        onThemeToggle={toggleTheme}
      />
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'workspace':
        return <Workspace api={apiService} />;
      case 'service-levels':
        return <DashboardEnhanced />;
      case 'sle-dashboard':
        return <SLEDashboard onClientClick={handleShowClientDetail} />;
      case 'app-insights':
        return <AppInsights api={apiService} />;
      case 'access-points':
        return <AccessPoints onShowDetail={handleShowAccessPointDetail} />;
      case 'connected-clients':
        return <TrafficStatsConnectedClients onShowDetail={handleShowClientDetail} />;
      case 'performance-analytics':
        return <PerformanceAnalytics />;
      case 'report-widgets':
        return <ReportWidgets />;
      case 'pci-report':
        return <PCIReport />;
      case 'system-backup':
        return (
          <ErrorBoundary fallbackTitle="System Backup Error">
            <SystemBackupManager />
          </ErrorBoundary>
        );
      case 'license-dashboard':
        return (
          <ErrorBoundary fallbackTitle="License Dashboard Error">
            <LicenseDashboard />
          </ErrorBoundary>
        );
      case 'firmware-manager':
        return (
          <ErrorBoundary fallbackTitle="Firmware Manager Error">
            <APFirmwareManager />
          </ErrorBoundary>
        );
      case 'network-diagnostics':
        return (
          <ErrorBoundary fallbackTitle="Network Diagnostics Error">
            <NetworkDiagnostics />
          </ErrorBoundary>
        );
      case 'event-alarm-dashboard':
        return (
          <ErrorBoundary fallbackTitle="Events & Alarms Error">
            <EventAlarmDashboard />
          </ErrorBoundary>
        );
      case 'security-dashboard':
        return (
          <ErrorBoundary fallbackTitle="Security Dashboard Error">
            <SecurityDashboard />
          </ErrorBoundary>
        );
      case 'guest-management':
        return (
          <ErrorBoundary fallbackTitle="Guest Management Error">
            <GuestManagement />
          </ErrorBoundary>
        );
      case 'configure-networks':
        return <ConfigureNetworks />;
      case 'configure-policy':
        return <ConfigurePolicy />;
      case 'configure-aaa-policies':
        return <ConfigureAAAPolicies />;
      case 'configure-adoption-rules':
        return <ConfigureAdoptionRules />;
      case 'configure-guest':
        return <ConfigureGuest />;
      case 'configure-advanced':
        return <ConfigureAdvanced />;
      case 'configure-sites':
        return <ConfigureSites onShowDetail={handleShowSiteDetail} />;
      case 'tools':
        return <Tools />;
      case 'administration':
        return (
          <Administration
            networkAssistantEnabled={networkAssistantEnabled}
            onToggleNetworkAssistant={handleToggleNetworkAssistant}
          />
        );
      case 'api-test':
        return <ApiTestTool />;
      case 'api-documentation':
        return <ApiDocumentation onNavigateBack={() => setCurrentPage('service-levels')} />;
      case 'help':
        return <HelpPage />;
      default:
        const info = pageInfo[currentPage as keyof typeof pageInfo];
        if (!info) {
          // If page info doesn't exist, redirect to service levels and show placeholder
          setCurrentPage('service-levels');
          return <PlaceholderPage title="Page Not Found" description="The requested page is not available. Redirecting to Service Levels." />;
        }
        return <PlaceholderPage title={info.title} description={info.description} />;
    }
  };

  const renderDetailPanel = () => {
    if (!detailPanel.isOpen || !detailPanel.type || !detailPanel.data) {
      return null;
    }

    switch (detailPanel.type) {
      case 'access-point':
        return (
          <DetailSlideOut
            isOpen={detailPanel.isOpen}
            onClose={handleCloseDetailPanel}
            title={detailPanel.data.displayName || `Access Point ${detailPanel.data.serialNumber}`}
            description="Detailed access point information and management"
            width="xl"
          >
            <Suspense fallback={<div className="flex items-center justify-center p-8">Loading...</div>}>
              <AccessPointDetail serialNumber={detailPanel.data.serialNumber} />
            </Suspense>
          </DetailSlideOut>
        );
      case 'client':
        return (
          <DetailSlideOut
            isOpen={detailPanel.isOpen}
            onClose={handleCloseDetailPanel}
            title={detailPanel.data.hostName || `Client ${detailPanel.data.macAddress}`}
            description="Detailed client information and management"
            width="lg"
          >
            <Suspense fallback={<div className="flex items-center justify-center p-8">Loading...</div>}>
              <ClientDetail macAddress={detailPanel.data.macAddress} />
            </Suspense>
          </DetailSlideOut>
        );
      case 'site':
        return (
          <DetailSlideOut
            isOpen={detailPanel.isOpen}
            onClose={handleCloseDetailPanel}
            title={detailPanel.data.siteName}
            description="Site overview, statistics, and management"
            width="lg"
          >
            <Suspense fallback={<div className="flex items-center justify-center p-8">Loading...</div>}>
              <SiteDetail siteId={detailPanel.data.siteId} siteName={detailPanel.data.siteName} />
            </Suspense>
          </DetailSlideOut>
        );
      default:
        return null;
    }
  };

  // Show mobile app on small screens
  if (device.isMobile) {
    return (
      <MobileApp
        theme={theme}
        onThemeToggle={toggleTheme}
        onLogout={handleLogout}
        userEmail={localStorage.getItem('user_email') || undefined}
        currentSite={filters.site}
        onSiteChange={(siteId) => {
          updateFilter('site', siteId);
        }}
      />
    );
  }

  return (
    <AppContextProvider>
    <>
      {/* Miami Vice sunset background - fixed behind everything */}
      {theme === 'synthwave' && (
        <>
          {/* Main gradient sky + SVG silhouette */}
          <div
            className="fixed inset-0 w-screen h-screen"
            style={{
              zIndex: 0,
              pointerEvents: 'none',
              background: [
                "url('/synthwave-silhouette.svg') center bottom / cover no-repeat fixed",
                /* Sun — positioned at 62% vertical to match SVG horizon */
                "radial-gradient(ellipse 18% 13% at 50% 62%, rgba(255,248,100,1.0) 0%, rgba(255,210,60,0.90) 15%, rgba(255,140,30,0.65) 40%, rgba(255,60,10,0.25) 65%, transparent 100%)",
                /* Outer sun corona */
                "radial-gradient(ellipse 45% 22% at 50% 62%, rgba(255,100,30,0.22) 0%, transparent 100%)",
                /* Sky gradient — deeper purple top, warm coral at horizon */
                "linear-gradient(to bottom, #020010 0%, #070218 4%, #0d0430 10%, #1a0848 16%, #2d1260 24%, #5c1a8e 33%, #8e1580 40%, #c91880 45%, #e83068 49%, #ff5040 53%, #ff7830 57%, #e83068 61%, #c91880 67%, #5c1a8e 77%, #2d1260 87%, #0d0430 94%, #020010 100%)"
              ].join(', ')
            }}
          />
          {/* Scanline overlay — classic CRT feel */}
          <div
            className="fixed inset-0 w-screen h-screen"
            style={{
              zIndex: 2,
              pointerEvents: 'none',
              background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.03) 3px, rgba(0,0,0,0.03) 4px)',
            }}
          />
        </>
      )}
      {theme === 'ep1' ? (
        /* EP1 layout: padded floating-card design per template */
        <div style={{ height: '100vh', background: '#1e1f2a', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', zIndex: 1 }}>
          {/* EP1 App Bar — floating rounded card */}
          {(() => {
            const controller = tenantService.getCurrentController();
            const org = tenantService.getCurrentOrganization();
            const siteLabel = (controller?.name || org?.name || 'Extreme Networks').toUpperCase();
            const userEmail = localStorage.getItem('user_email') || '';
            const emailUser = userEmail.split('@')[0] || '';
            const initials = emailUser ? (emailUser.split(/[._+]/)[0] || emailUser).slice(0, 2).toUpperCase() : 'EX';
            return (
              <div style={{ flexShrink: 0, height: 52, background: '#2d2f3e', borderRadius: 8, boxShadow: '0px 16px 16px 0px rgba(30,31,42,0.24),0px 8px 8px 0px rgba(30,31,42,0.24),0px 4px 4px 0px rgba(30,31,42,0.24),0px 2px 2px 0px rgba(30,31,42,0.24)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16 }}>
                <img src="/branding/extreme-e.png" alt="Extreme" style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} />
                <span style={{ color: '#f8f8fb', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>Extreme Platform ONE™</span>
                <span style={{ color: '#4d4f63', fontSize: 14, flexShrink: 0 }}>|</span>
                <span style={{ color: '#babcce', fontSize: 14, flexShrink: 0 }}>Networking</span>
                <div style={{ flex: 1 }} />
                <span style={{ color: '#babcce', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', background: '#1e1f2a', border: '1px solid #3a3e5c', borderRadius: 4, padding: '2px 10px', flexShrink: 0 }}>{siteLabel}</span>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#babcce', padding: 4 }}><Bell size={16} /></button>
                <div style={{ width: 32, height: 32, background: '#1e1f2a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#f8f8fb', cursor: 'pointer', flexShrink: 0 }}>{initials}</div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#babcce', padding: 4 }}><LayoutGrid size={16} /></button>
              </div>
            );
          })()}

          {/* Sidebar + Content row */}
          <div style={{ flex: 1, display: 'flex', gap: 16, overflow: 'hidden' }}>
            <Sidebar
              onLogout={handleLogout}
              adminRole={adminRole}
              currentPage={currentPage}
              onPageChange={handlePageChange}
              theme={theme}
              onThemeToggle={toggleTheme}
            />
            <main className="flex-1 overflow-auto transition-all duration-200" style={{ paddingBottom: isDevModeOpen ? `${devPanelHeight}px` : '0' }}>
              <div className="p-4 sm:p-6">
                <div className="flex justify-between items-center gap-3 mb-4 sm:mb-6">
                  <h2 className="text-base sm:text-lg font-semibold truncate flex-1" style={{ color: '#f8f8fb' }}>
                    {pageInfo[currentPage as keyof typeof pageInfo]?.title || 'Mobility Engine'}
                  </h2>
                  <div className="flex items-center gap-2">
                    {!device.isMobile && (<><NotificationsMenu /><AppsMenu /></>)}
                    <UserMenu onLogout={handleLogout} theme={theme} onThemeToggle={toggleTheme} userEmail={localStorage.getItem('user_email') || undefined} onNavigateTo={handlePageChange} />
                  </div>
                </div>
                <div>
                  <ErrorBoundary key={currentPage} fallbackTitle="Page Error">
                    <Suspense fallback={<PageSkeleton variant={getSkeletonVariant(currentPage)} />}>
                      <div className="animate-in fade-in duration-300">{renderPage()}</div>
                    </Suspense>
                  </ErrorBoundary>
                </div>
              </div>
            </main>
          </div>

          {!device.isMobile && <Toaster />}
          {renderDetailPanel()}
        </div>
      ) : (
        /* Normal layout */
        <div className={`h-screen flex ${theme === 'synthwave' ? '' : 'bg-background'}`} style={{ position: 'relative', zIndex: 1 }}>
          <Sidebar
            onLogout={handleLogout}
            adminRole={adminRole}
            currentPage={currentPage}
            onPageChange={handlePageChange}
            theme={theme}
            onThemeToggle={toggleTheme}
          />

          <main
            className="flex-1 overflow-auto transition-all duration-200"
            style={{ paddingBottom: isDevModeOpen ? `${devPanelHeight}px` : '0' }}
          >
            <div className="p-4 sm:p-6 pt-16 sm:pt-6">
              {/* Top Bar */}
              <div className="flex justify-between items-center gap-3 mb-4 sm:mb-6">
                <h2 className="text-base sm:text-lg font-semibold text-[rgba(255,255,255,1)] truncate flex-1">
                  {pageInfo[currentPage as keyof typeof pageInfo]?.title || 'Mobility Engine'}
                </h2>
                <div className="flex items-center gap-2">
                  {!device.isMobile && (
                    <>
                      <Button variant={isDevModeOpen ? 'default' : 'secondary'} size="sm" onClick={handleToggleDevMode} className="flex items-center" title="Toggle Developer Mode">
                        <Braces className="h-4 w-4" />
                      </Button>
                      <Button variant={currentPage === 'api-test' ? 'default' : 'secondary'} size="sm" onClick={() => setCurrentPage('api-test')} className="flex items-center" title="API Test Tool">
                        <FlaskConical className="h-4 w-4" />
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => window.open('https://github.com/thomassophiea/EDGE', '_blank', 'noopener,noreferrer')} className="flex items-center" title="View on GitHub">
                        <Github className="h-4 w-4" />
                      </Button>
                      <NotificationsMenu />
                      <AppsMenu />
                    </>
                  )}
                  <UserMenu onLogout={handleLogout} theme={theme} onThemeToggle={toggleTheme} userEmail={localStorage.getItem('user_email') || undefined} onNavigateTo={handlePageChange} />
                </div>
              </div>
              <div>
                <ErrorBoundary key={currentPage} fallbackTitle="Page Error">
                  <Suspense fallback={<PageSkeleton variant={getSkeletonVariant(currentPage)} />}>
                    <div className="animate-in fade-in duration-300">{renderPage()}</div>
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          </main>

          {!device.isMobile && <Toaster />}
          {renderDetailPanel()}
        </div>
      )}
      
      {/* Network Assistant Chatbot - Only render if enabled in preferences */}
      {networkAssistantEnabled && (
        <NetworkChatbot
          isOpen={isChatbotOpen}
          onToggle={() => setIsChatbotOpen(!isChatbotOpen)}
          context={assistantContext}
          onShowClientDetail={handleShowClientDetail}
          onShowAccessPointDetail={handleShowAccessPointDetail}
          onShowSiteDetail={handleShowSiteDetail}
        />
      )}

      {/* Developer Mode Panel - Desktop only */}
      {!device.isMobile && (
        <DevModePanel
          isOpen={isDevModeOpen}
          onClose={() => setIsDevModeOpen(false)}
          apiLogs={apiLogs}
          onClearLogs={handleClearApiLogs}
          onHeightChange={setDevPanelHeight}
        />
      )}
      {/* Synthwave Music Player - Shows when Miami Vice theme is active */}
      {theme === 'synthwave' && !isMusicPlayerDismissed && (
        <Suspense fallback={null}>
          <SynthwaveMusicPlayer
            isVisible={true}
            onClose={() => setIsMusicPlayerDismissed(true)}
          />
        </Suspense>
      )}

      {/* Version Display - Fixed to bottom-left */}
      <VersionDisplay position="bottom-left" />
    </>
    </AppContextProvider>
  );
}