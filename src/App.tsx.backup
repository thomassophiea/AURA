import { useState, useEffect } from 'react';
import { ServiceLevelsEnhanced } from './components/ServiceLevelsEnhanced';
import { AlertsEventsEnhanced } from './components/AlertsEventsEnhanced';
import { ReportWidgets } from './components/ReportWidgets';
import { ConfigureNetworks } from './components/ConfigureNetworks';
import { ConfigureSites } from './components/ConfigureSites';
import { ConfigurePolicy } from './components/ConfigurePolicy';
import { ConfigureAAAPolicies } from './components/ConfigureAAAPolicies';
import { ConfigureAdoptionRules } from './components/ConfigureAdoptionRules';
import { ConfigureGuest } from './components/ConfigureGuest';
import { Administration } from './components/Administration';
import { Tools } from './components/Tools';
import { LoginForm } from './components/LoginForm';
import { Sidebar } from './components/Sidebar';
import { AccessPoints } from './components/AccessPoints';
import { TrafficStatsConnectedClients } from './components/TrafficStatsConnectedClients';
import { ApiTestTool } from './components/ApiTestTool';
import { DetailSlideOut } from './components/DetailSlideOut';
import { AccessPointDetail } from './components/AccessPointDetail';
import { ClientDetail } from './components/ClientDetail';
import { SiteDetail } from './components/SiteDetail';
import { NetworkChatbot } from './components/NetworkChatbot';
import { PlaceholderPage } from './components/PlaceholderPage';
import { apiService, ApiCallLog } from './services/api';
import { sleDataCollectionService } from './services/sleDataCollection';
import { Toaster } from './components/ui/sonner';
import { Button } from './components/ui/button';
import { Activity, Sun, Moon, Code, Bug } from 'lucide-react';
import { AppsMenu } from './components/AppsMenu';
import { UserMenu } from './components/UserMenu';
import { NotificationsMenu } from './components/NotificationsMenu';
import { DevModePanel } from './components/DevModePanel';
import { toast } from 'sonner';

const pageInfo = {
  'service-levels': { title: 'Service Levels', description: 'Monitor network SLAs and performance metrics' },
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
  'administration': { title: 'Administration', description: 'System administration, users, applications, and licensing' },
  'api-test': { title: 'API Test Tool', description: 'Test and explore AURA API endpoints' },
  'configure-sites': { title: 'Sites', description: 'Manage and configure network sites and locations' },
  'configure-networks': { title: 'Configure Networks', description: 'Set up and manage network configurations' },
};

interface DetailPanelState {
  isOpen: boolean;
  type: 'access-point' | 'client' | 'site' | null;
  data: any;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentPage, setCurrentPage] = useState('service-levels');
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [detailPanel, setDetailPanel] = useState<DetailPanelState>({
    isOpen: false,
    type: null,
    data: null
  });
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [isDevModeOpen, setIsDevModeOpen] = useState(false);
  const [apiLogs, setApiLogs] = useState<ApiCallLog[]>([]);
  const [devPanelHeight, setDevPanelHeight] = useState(0);

  useEffect(() => {
    // Initialize theme from localStorage or system preference
    const initializeTheme = () => {
      const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null;
      const initialTheme = savedTheme || 'system';
      
      setTheme(initialTheme);
      applyThemeForMode(initialTheme);
    };

    // Check if user is already authenticated and validate session
    const initializeAuth = async () => {
      if (apiService.isAuthenticated()) {
        // Attempt a lightweight API call to verify the token is still valid
        try {
          const response = await apiService.makeAuthenticatedRequest('/v1/sessions/self', { method: 'GET' }, 5000);
          
          if (response.ok) {
            // Token is valid
            setIsAuthenticated(true);
            setAdminRole(apiService.getAdminRole());
            
            // Show a subtle notification that session was restored
            console.log('[App] ✅ Session restored from storage - you are still logged in');
            toast.success('Session restored', {
              description: 'You are still logged in from your previous session.',
              duration: 3000
            });
            
            // Start SLE data collection automatically on successful authentication
            console.log('[App] Starting SLE data collection service');
            sleDataCollectionService.startCollection();
          } else {
            // Token is invalid - clear it
            console.log('[App] Stored token is invalid - clearing session');
            apiService.logout();
            setIsAuthenticated(false);
          }
        } catch (error) {
          // If session validation fails, clear the stale session
          console.log('[App] Session validation failed - clearing stale session');
          apiService.logout();
          setIsAuthenticated(false);
        }
      } else {
        console.log('[App] No valid session found - showing login screen');
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

    // Periodically check authentication status
    const authCheckInterval = setInterval(async () => {
      // Only check if we think we're authenticated
      if (isAuthenticated) {
        // Check if tokens are still present in localStorage
        const accessToken = localStorage.getItem('access_token');
        const refreshToken = localStorage.getItem('refresh_token');
        
        // If tokens are missing but we think we're authenticated, log out
        if (!accessToken || !refreshToken) {
          console.log('Authentication tokens missing - logging out');
          handleSessionExpired();
          return;
        }
        
        // Also check if the apiService thinks we're authenticated
        if (!apiService.isAuthenticated()) {
          console.log('API service reports not authenticated - logging out');
          handleSessionExpired();
          return;
        }

        // REMOVED: Periodic session validation - only validate on actual API errors
        // This was causing unnecessary logouts during development
      }
    }, 60000); // Check every 60 seconds (reduced from 30)

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
        'Unable to connect to Campus Controller',
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
          'Unable to connect to Campus Controller',
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
            description: 'The Campus Controller took too long to respond.',
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
        'Unable to connect to Campus Controller',
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
        'Unable to connect to Campus Controller',
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

  // Helper function to apply theme to document
  const applyTheme = (newTheme: 'light' | 'dark') => {
    const root = document.documentElement;
    
    // Remove existing theme classes
    root.classList.remove('light', 'dark');
    
    // Add new theme class
    root.classList.add(newTheme);
    
    // Set data attribute for theme as well (for compatibility)
    root.setAttribute('data-theme', newTheme);
    
    // Ensure body also gets the theme class
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(newTheme);
  };

  // Helper function to apply theme based on mode (handles system detection)
  const applyThemeForMode = (mode: 'light' | 'dark' | 'system') => {
    if (mode === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      applyTheme(systemTheme);
    } else {
      applyTheme(mode);
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(newTheme);
    applyThemeForMode(newTheme);
    
    // Save to localStorage
    localStorage.setItem('theme', newTheme);
    
    // Show a toast notification
    const themeLabel = newTheme === 'system' ? 'system (auto)' : newTheme;
    toast.success(`Switched to ${themeLabel} mode`, {
      description: newTheme === 'system' 
        ? 'The interface will now follow your system preference.'
        : `The interface is now using ${newTheme} theme.`,
      duration: 2000
    });
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setAdminRole(apiService.getAdminRole());
    
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
    
    setCurrentPage(page);
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
            : 'Unable to reach Campus Controller API'
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
      case 'service-levels':
        return <ServiceLevelsEnhanced />;
      case 'access-points':
        return <AccessPoints onShowDetail={handleShowAccessPointDetail} />;
      case 'connected-clients':
        return <TrafficStatsConnectedClients onShowDetail={handleShowClientDetail} />;
      case 'performance-analytics':
        const performanceAnalyticsInfo = pageInfo['performance-analytics'];
        return <PlaceholderPage title={performanceAnalyticsInfo.title} description={performanceAnalyticsInfo.description} />;
      case 'report-widgets':
        return <ReportWidgets />;
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
      case 'configure-sites':
        return <ConfigureSites onShowDetail={handleShowSiteDetail} />;
      case 'tools':
        return <Tools />;
      case 'administration':
        return <Administration />;
      case 'api-test':
        return <ApiTestTool />;
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
            <AccessPointDetail serialNumber={detailPanel.data.serialNumber} />
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
            <ClientDetail macAddress={detailPanel.data.macAddress} />
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
            <SiteDetail siteId={detailPanel.data.siteId} siteName={detailPanel.data.siteName} />
          </DetailSlideOut>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="h-screen flex bg-background">
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
          style={{
            paddingBottom: isDevModeOpen ? `${devPanelHeight}px` : '0'
          }}
        >
          <div className="p-6">
            {/* Top Bar with Test Tools */}
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center space-x-4">
                <h2 className="text-lg font-semibold text-[rgba(255,255,255,1)]">
                  {pageInfo[currentPage as keyof typeof pageInfo]?.title || 'Mobility Engine'}
                </h2>
              </div>
              
              <div className="flex items-center space-x-2">
                {/* Developer Mode Toggle */}
                <Button
                  variant={isDevModeOpen ? 'default' : 'secondary'}
                  size="sm"
                  onClick={handleToggleDevMode}
                  className="flex items-center"
                  title="Toggle Developer Mode"
                >
                  <Bug className="h-4 w-4" />
                </Button>
                
                {/* API Test Tool */}
                <Button
                  variant={currentPage === 'api-test' ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setCurrentPage('api-test')}
                  className="flex items-center"
                  title="API Test Tool"
                >
                  <Code className="h-4 w-4" />
                </Button>

                {/* Notifications Menu */}
                <NotificationsMenu />
                
                {/* User Menu */}
                <UserMenu 
                  onLogout={handleLogout}
                  theme={theme}
                  onThemeToggle={toggleTheme}
                />
                
                {/* Apps Menu */}
                <AppsMenu />
              </div>
            </div>
            
            {renderPage()}
          </div>
        </main>
        
        <Toaster />
        
        {/* Detail Slide-out Panel */}
        {renderDetailPanel()}
      </div>
      
      {/* Network Assistant Chatbot - Outside main container for proper viewport positioning */}
      <NetworkChatbot
        isOpen={isChatbotOpen}
        onToggle={() => setIsChatbotOpen(!isChatbotOpen)}
      />

      {/* Developer Mode Panel */}
      <DevModePanel
        isOpen={isDevModeOpen}
        onClose={() => setIsDevModeOpen(false)}
        apiLogs={apiLogs}
        onClearLogs={handleClearApiLogs}
        onHeightChange={setDevPanelHeight}
      />
    </>
  );
}