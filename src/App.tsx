import { useState, useEffect, lazy, Suspense, useMemo, useCallback, startTransition } from 'react';
import { useGlobalFilters } from './hooks/useGlobalFilters';
import type { AssistantContext } from './components/NetworkChatbot';
import { LoginForm } from './components/LoginForm';
import { SharedReportViewer } from './components/SharedReportViewer';
import { Sidebar } from './components/Sidebar';
import { MobileApp } from './components/mobile/MobileApp';
import { DetailSlideOut } from './components/DetailSlideOut';
import { PlaceholderPage } from './components/PlaceholderPage';
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
const SitesAndGroupsPage = lazy(() => import('./components/SitesAndGroupsPage').then(m => ({ default: m.SitesAndGroupsPage })));
const ConfigurePolicy = lazy(() => import('./components/ConfigurePolicy').then(m => ({ default: m.ConfigurePolicy })));
const ConfigureAAAPolicies = lazy(() => import('./components/ConfigureAAAPolicies').then(m => ({ default: m.ConfigureAAAPolicies })));
const ConfigureAdoptionRules = lazy(() => import('./components/ConfigureAdoptionRules').then(m => ({ default: m.ConfigureAdoptionRules })));
const ConfigureGuest = lazy(() => import('./components/ConfigureGuest').then(m => ({ default: m.ConfigureGuest })));
const ConfigureAdvanced = lazy(() => import('./components/ConfigureAdvanced').then(m => ({ default: m.ConfigureAdvanced })));
const GlobalElementsPage = lazy(() => import('./components/global-elements/GlobalElementsPage').then(m => ({ default: m.GlobalElementsPage })));
const SiteGroupSettingsPage = lazy(() => import('./components/SiteGroupSettingsPage').then(m => ({ default: m.SiteGroupSettingsPage })));
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
const ReportCenter = lazy(() => import('./components/ReportCenter').then(m => ({ default: m.ReportCenter })));
const HelpPage = lazy(() => import('./components/HelpPage').then(m => ({ default: m.HelpPage })));
const PerformanceAnalytics = lazy(() => import('./components/PerformanceAnalytics').then(m => ({ default: m.PerformanceAnalytics })));
import { apiService, ApiCallLog } from './services/api';
// reportConfigPersistence imported by SharedReportViewer directly
import { AppContextProvider } from './contexts/AppContext';
import type { NavigationScope } from './config/navigationScopes';
import { ORG_PAGES, SITE_GROUP_PAGES } from './config/navigationScopes';
import type { GlobalElementType } from './types/globalElements';
import { sleDataCollectionService } from './services/sleDataCollection';
import { Toaster } from './components/ui/sonner';
import { PageSkeleton, getSkeletonVariant } from './components/ui/PageSkeleton';
import { Button } from './components/ui/button';
import { Activity, Sun, Moon, Braces, Github, FlaskConical, BarChart3, Bell, LayoutGrid } from 'lucide-react';
import { AppsMenu } from './components/AppsMenu';
import { UserMenu } from './components/UserMenu';
import { NotificationsMenu } from './components/NotificationsMenu';
import { tenantService } from './services/tenantService';
import { DevToolsPanel } from './components/DevToolsPanel';
import { SiteGroupFilterDropdown } from './components/SiteGroupFilterDropdown';
import { PersonaProvider, readStoredPersona, PERSONA_STORAGE_KEY } from './contexts/PersonaContext';
import { PersonaSelector } from './components/PersonaSelector';
import { PERSONA_MAP, type PersonaId } from './config/personaDefinitions';
import { VersionDisplay } from './components/VersionDisplay';
import { toast } from 'sonner';
import { applyTheme as applyThemeColors } from './lib/themes';
import { useDeviceDetection } from './hooks/useDeviceDetection';

const pageInfo = {
  'workspace': { title: 'Workspace', description: 'Create custom widgets for Devices, Clients, Licensing, and Alerts' },
  'service-levels': { title: 'Insights', description: 'Context-aware network monitoring and analytics' },
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
  'api-documentation': { title: 'API Documentation', description: 'AURA Mobility Core REST API reference' },
  'configure-sites-groups': { title: 'Sites & Groups', description: 'Manage site groups, controller pairs, and network sites' },
  'configure-networks': { title: 'Configure Networks', description: 'Set up and manage network configurations' },
  'configure-advanced': { title: 'Advanced Configuration', description: 'Topologies, QoS, AP Profiles, IoT, Mesh, Access Control, and Location Services' },
  'global-templates': { title: 'Global Templates', description: 'Manage configuration templates with variable substitution' },
  'global-variables': { title: 'Global Variables', description: 'Define and manage variables for template resolution' },
  'site-group-settings': { title: 'Site Group Settings', description: 'Configure site group connection, variables, and deployment preferences' },
  'help': { title: 'Help & Support', description: 'Get assistance with the EDGE platform using AI' },
};

interface DetailPanelState {
  isOpen: boolean;
  type: 'access-point' | 'client' | 'site' | 'site-group' | null;
  data: any;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentPage, setCurrentPage] = useState('workspace');
  const [navigationScope, setNavigationScope] = useState<NavigationScope>('global');
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [justLoggedIn, setJustLoggedIn] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [theme, setTheme] = useState<'light' | 'ep1' | 'dev'>('ep1');
  const [detailPanel, setDetailPanel] = useState<DetailPanelState>({
    isOpen: false,
    type: null,
    data: null
  });
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [networkAssistantEnabled, setNetworkAssistantEnabled] = useState(() => {
    // Default to false - hidden by default
    return localStorage.getItem('networkAssistantEnabled') === 'true';
  });
  const [isDevModeOpen, setIsDevModeOpen] = useState(false);
  const [activePersona, setActivePersonaRaw] = useState<PersonaId>(readStoredPersona);
  const setActivePersona = useCallback((id: PersonaId) => {
    setActivePersonaRaw(id);
    localStorage.setItem(PERSONA_STORAGE_KEY, id);
  }, []);
  const personaAllowedPages = useMemo(() => {
    if (theme !== 'dev' || activePersona === 'super-user') return null;
    const def = PERSONA_MAP.get(activePersona);
    return def ? new Set(def.allowedPages) : null;
  }, [theme, activePersona]);
  const isPageAllowedByPersona = useCallback((pageId: string): boolean => {
    if (!personaAllowedPages) return true;
    return personaAllowedPages.has(pageId);
  }, [personaAllowedPages]);
  const [apiLogs, setApiLogs] = useState<ApiCallLog[]>([]);
  const [devPanelHeight, setDevPanelHeight] = useState(0);
  const [siteName, setSiteName] = useState<string>('');
  const [pendingTemplateType, setPendingTemplateType] = useState<GlobalElementType | null>(null);

  // Legacy cross-page filter removed — now handled inside SitesAndGroupsPage tabs

  // Shared report links handled before auth gate via SharedReportViewer

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
      const saved = localStorage.getItem('theme');
      const initialTheme: 'light' | 'ep1' | 'dev' = (saved === 'light' || saved === 'ep1' || saved === 'dev') ? saved : 'ep1';

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
      setCurrentPage('workspace');
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
      // Clear auth check interval
      clearInterval(authCheckInterval);
      // Cancel any pending requests on cleanup
      apiService.cancelAllRequests();
      // Unsubscribe from API logs
      unsubscribe();
    };
  }, []);

  // Helper function to apply theme to document
  const applyTheme = (newTheme: 'light' | 'ep1' | 'dev') => {
    const root = document.documentElement;
    const baseTheme = newTheme === 'ep1' ? 'ep1' : newTheme === 'dev' ? 'dev' : 'default';
    applyThemeColors(baseTheme);

    root.classList.remove('light', 'dark', 'ep1', 'dev', 'synthwave', 'pirate', 'mi5');
    document.body.classList.remove('light', 'dark', 'ep1', 'dev', 'synthwave', 'pirate', 'mi5');

    if (newTheme === 'ep1') {
      root.classList.add('dark', 'ep1');
      document.body.classList.add('dark', 'ep1');
    } else if (newTheme === 'dev') {
      root.classList.add('dark', 'dev');
      document.body.classList.add('dark', 'dev');
    } else {
      root.classList.add('light');
      document.body.classList.add('light');
    }
    root.setAttribute('data-theme', newTheme);
  };

  const applyThemeForMode = (mode: 'light' | 'ep1') => {
    applyTheme(mode);
  };

  const toggleTheme = () => {
    const cycle: Record<'light' | 'ep1' | 'dev', 'light' | 'ep1' | 'dev'> = {
      ep1: 'dev',
      dev: 'light',
      light: 'ep1',
    };
    const newTheme = cycle[theme];
    setTheme(newTheme);
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);

    const labels = { ep1: 'Dark', dev: 'Dev', light: 'Light' };
    const descriptions = { ep1: 'Dark mode activated.', dev: 'Developer mode activated.', light: 'Light mode activated.' };

    toast.success(`Switched to ${labels[newTheme]} mode`, {
      description: descriptions[newTheme],
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
    setCurrentPage('workspace');
  };

  const handlePageChange = (page: string) => {
    // Persona gating: block navigation to pages outside the active persona
    if (!isPageAllowedByPersona(page)) return;

    // Cancel any pending API requests when switching pages
    console.log(`Switching to page: ${page}, canceling pending requests`);
    apiService.cancelAllRequests();

    // Auto-switch scope based on page classification
    if (ORG_PAGES.has(page) && navigationScope !== 'global') {
      setNavigationScope('global');
    } else if (SITE_GROUP_PAGES.has(page) && navigationScope !== 'site-group') {
      setNavigationScope('site-group');
    }

    // Use startTransition to keep old content visible while loading new page
    startTransition(() => {
      setCurrentPage(page);
    });
    // Close detail panel when changing pages
    setDetailPanel({ isOpen: false, type: null, data: null });
  };

  const handleTemplateCreation = (elementType: GlobalElementType) => {
    setPendingTemplateType(elementType);
    handlePageChange('global-templates');
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

  // Navigation between site groups and sites is now handled within SitesAndGroupsPage tabs

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

  // ── Shared Report Viewer: renders outside the main app shell ──
  // When a #/report/ hash is present, show the standalone report viewer
  // with its own login flow — no sidebar, no nav, just the report.
  const reportHash = window.location.hash;
  if (reportHash.startsWith('#/report/')) {
    const payload = reportHash.slice('#/report/'.length);
    return <SharedReportViewer payload={payload} />;
  }

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
    // Persona gating: redirect to workspace if current page is not allowed
    if (!isPageAllowedByPersona(currentPage)) {
      startTransition(() => setCurrentPage('workspace'));
      return null;
    }
    switch (currentPage) {
      case 'workspace':
        return <ReportCenter />;
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
      case 'global-templates':
        return <GlobalElementsPage initialTab="templates" initialElementType={pendingTemplateType ?? undefined} onConsumeElementType={() => setPendingTemplateType(null)} />;
      case 'global-variables':
        return <GlobalElementsPage initialTab="variables" />;
      case 'site-group-settings':
        return <SiteGroupSettingsPage />;
      case 'configure-sites-groups':
        return (
          <SitesAndGroupsPage
            onShowSiteDetail={handleShowSiteDetail}
          />
        );
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
          setCurrentPage('workspace');
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
      case 'site-group':
        return (
          <DetailSlideOut
            isOpen={detailPanel.isOpen}
            onClose={handleCloseDetailPanel}
            title={detailPanel.data.siteGroupName || 'Site Group Details'}
            description="Controller pair details and site assignments"
            width="lg"
          >
            {/* Site group detail is rendered inline in SiteGroupsPage */}
            <div className="py-4 text-center text-muted-foreground text-sm">
              Open the Site Groups page and click a row to see details.
            </div>
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
    <AppContextProvider navigationScope={navigationScope} onNavigationScopeChange={setNavigationScope} onPageChange={handlePageChange} onTemplateCreation={handleTemplateCreation}>
    <PersonaProvider theme={theme} activePersona={activePersona} setActivePersona={setActivePersona}>
    <>
      {/* Unified floating-card layout — all themes */}
      <div
        className="flex flex-col bg-background"
        style={{ height: '100vh', padding: 16, gap: 16, position: 'relative', zIndex: 1 }}
      >
        {/* Universal top bar card */}
        <div
          className="bg-sidebar shrink-0 flex items-center gap-3 rounded-[8px]"
          style={{
            height: 52,
            padding: '0 16px',
            boxShadow: theme === 'ep1'
              ? '0px 16px 16px 0px rgba(30,31,42,0.24),0px 8px 8px 0px rgba(30,31,42,0.24),0px 4px 4px 0px rgba(30,31,42,0.24),0px 2px 2px 0px rgba(30,31,42,0.24)'
              : '0 2px 8px rgba(0,0,0,0.12)',
          }}
        >
          {/* Left side — persistent brand across all themes */}
          <img src="/branding/extreme-e.png" alt="Extreme Networks" style={{ height: 36, width: 36, objectFit: 'contain', flexShrink: 0 }} />
          <span className="text-sm font-semibold text-foreground" style={{ flexShrink: 0, letterSpacing: '-0.01em' }}>
            <span style={{ fontWeight: 700 }}>Extreme</span>
            {' '}
            <span className="text-muted-foreground" style={{ fontWeight: 400 }}>Platform ONE™ | Networking</span>
          </span>
          <div style={{ flex: 1 }} />
          {navigationScope === 'global' && <SiteGroupFilterDropdown />}
          {(() => {
            const controller = tenantService.getCurrentController();
            const org = tenantService.getCurrentOrganization();
            if (navigationScope === 'global') {
              return (
                <span className="text-muted-foreground text-xs font-semibold bg-background border border-border rounded px-2 py-0.5" style={{ letterSpacing: '0.08em', flexShrink: 0 }}>
                  {(org?.name || 'AURA').toUpperCase()}
                </span>
              );
            }
            const siteLabel = (controller?.name || org?.name || 'Extreme Networks').toUpperCase();
            return (
              <span className="text-xs font-semibold bg-primary/10 text-primary border border-primary/20 rounded px-2 py-0.5" style={{ letterSpacing: '0.08em', flexShrink: 0 }}>
                {siteLabel}
              </span>
            );
          })()}

          {/* Right side — controls for all themes */}
          <div className="flex items-center gap-1 ml-auto">
            {!device.isMobile && theme === 'dev' && (
              <>
                <PersonaSelector />
                <Button variant={isDevModeOpen ? 'default' : 'ghost'} size="sm" onClick={handleToggleDevMode} title="Developer Mode - API Monitor">
                  <Braces className="h-4 w-4" />
                </Button>
                <Button variant={currentPage === 'api-test' ? 'default' : 'ghost'} size="sm" onClick={() => setCurrentPage('api-test')} title="API Test Tool">
                  <FlaskConical className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => window.open('https://github.com/thomassophiea/EDGE', '_blank', 'noopener,noreferrer')} title="GitHub">
                  <Github className="h-4 w-4" />
                </Button>
              </>
            )}
            {!device.isMobile && <NotificationsMenu />}
            {!device.isMobile && <AppsMenu />}
            <UserMenu
              onLogout={handleLogout}
              theme={theme}
              onThemeToggle={toggleTheme}
              userEmail={localStorage.getItem('user_email') || undefined}
              onNavigateTo={handlePageChange}
            />
          </div>
        </div>

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
          <main
            className="flex-1 overflow-auto bg-sidebar rounded-[8px] transition-all duration-200"
            style={{
              paddingBottom: isDevModeOpen ? `${devPanelHeight}px` : '0',
              boxShadow: theme === 'ep1'
                ? '0px 16px 16px 0px rgba(30,31,42,0.24),0px 8px 8px 0px rgba(30,31,42,0.24),0px 4px 4px 0px rgba(30,31,42,0.24),0px 2px 2px 0px rgba(30,31,42,0.24)'
                : '0 2px 8px rgba(0,0,0,0.12)',
            }}
          >
            <div className="p-4 sm:p-6">
              <ErrorBoundary key={currentPage} fallbackTitle="Page Error">
                <Suspense fallback={<PageSkeleton variant={getSkeletonVariant(currentPage)} />}>
                  <div className="animate-in fade-in duration-300">{renderPage()}</div>
                </Suspense>
              </ErrorBoundary>
            </div>
          </main>
        </div>

        {!device.isMobile && <Toaster />}
        {renderDetailPanel()}
      </div>
      
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

      {/* Developer Tools Panel - Desktop only */}
      {!device.isMobile && (
        <DevToolsPanel
          isOpen={isDevModeOpen}
          onClose={() => setIsDevModeOpen(false)}
          apiLogs={apiLogs}
          onClearLogs={handleClearApiLogs}
          onHeightChange={setDevPanelHeight}
        />
      )}
      {/* Version Display - Fixed to bottom-left */}
      <VersionDisplay position="bottom-left" />
    </>
    </PersonaProvider>
    </AppContextProvider>
  );
}