
const BASE_URL = 'https://tsophiea.ddns.net:443/management';

export interface LoginCredentials {
  grantType: string;
  userId: string;
  password: string;
  scope?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  idle_timeout: number;
  refresh_token: string;
  adminRole: string;
}

export interface ApiError {
  message: string;
  status: number;
}

export interface AccessPoint {
  serialNumber: string;
  displayName?: string;
  model?: string;
  hardwareType?: string;
  status?: string;
  ipAddress?: string;
  macAddress?: string;
  location?: string;
  site?: string;
  hostSite?: string; // The actual site/location field like "LAB Remote Site"
  firmware?: string;
  softwareVersion?: string; // The actual firmware field like "10.14.2.0-002R"
  clientCount?: number;
  [key: string]: any;
}

export interface APQueryColumn {
  name: string;
  displayName?: string;
  type?: string;
  description?: string;
}

export interface APStation {
  macAddress: string;
  ipAddress?: string;
  hostName?: string;
  status?: string;
  associationTime?: string;
  signalStrength?: number;
  dataRate?: string;
  vlan?: string;
  [key: string]: any;
}

export interface Station {
  // Basic identification
  macAddress: string;
  ipAddress?: string;
  ipv6Address?: string;
  hostName?: string;
  status?: string;
  
  // Device information
  deviceType?: string;
  manufacturer?: string;
  username?: string;
  role?: string;
  
  // Network information
  siteId?: string; // Site ID from /v1/stations
  siteName?: string; // Site name (can be populated from mapping)
  serviceId?: string; // Service ID from /v1/stations (to be mapped to service details)
  roleId?: string; // Role ID from /v1/stations (to be mapped to role name)
  network?: string;
  networkName?: string; // Alternative field name
  profileName?: string; // Network profile name
  serviceName?: string; // Service name
  ssid?: string;
  essid?: string; // Alternative SSID field name
  
  // Access Point information
  apName?: string;
  apDisplayName?: string; // Alternative AP name field
  apHostname?: string; // AP hostname
  accessPointName?: string; // Full access point name
  apSerial?: string;
  apSerialNumber?: string; // Alternative serial field
  apSn?: string; // Short serial number field
  accessPointSerial?: string; // Full serial field name
  
  // Connection details
  channel?: number;
  radioChannel?: number; // Alternative channel field
  channelNumber?: number; // Another channel field variation
  capabilities?: string;
  signalStrength?: number;
  rxRate?: string;
  protocol?: string;
  
  // Traffic statistics
  clientBandwidthBytes?: number;
  packets?: number;
  outBytes?: number;
  outPackets?: number;
  rxBytes?: number;
  txBytes?: number;
  inBytes?: number; // Added for traffic statistics
  rss?: number; // Signal strength (RSSI)
  
  // Timing information
  lastSeen?: string;
  associationTime?: string;
  sessionDuration?: string;
  
  // Rating/Quality
  siteRating?: number;
  
  // Legacy/Additional fields
  dataRate?: string;
  vlan?: string | number;
  vlanId?: string | number; // Alternative VLAN field
  vlanTag?: string | number; // VLAN tag field
  dot1dPortNumber?: number; // VLAN ID from services
  apSerialNumber?: string;
  apDisplayName?: string;
  apIpAddress?: string;
  authMethod?: string;
  encryption?: string;
  radioType?: string;
  txPower?: number;
  lastActivity?: string;
  
  [key: string]: any;
}

export interface StationTrafficStats {
  macAddress: string;
  inBytes?: number;
  outBytes?: number;
  rxBytes?: number;
  txBytes?: number;
  packets?: number;
  outPackets?: number;
  [key: string]: any;
}

export interface APRadio {
  radioName: string;
  radioIndex: number;
  adminState: boolean;
  mode: string;
  channelwidth: string;
  useSmartRf: boolean;
  reqChannel: string;
  txMaxPower: number;
  [key: string]: any;
}

export interface APDetails extends AccessPoint {
  uptime?: string;
  memoryUsage?: number;
  cpuUsage?: number;
  channelUtilization?: number;
  txPower?: number;
  channel?: number;
  associatedClients?: number;
  radios?: APRadio[];
  [key: string]: any;
}

export interface APPlatform {
  name: string;
  description?: string;
  [key: string]: any;
}

export interface APHardwareType {
  name: string;
  description?: string;
  [key: string]: any;
}

export interface Service {
  id: string;
  name?: string; // Optional as API may use serviceName instead
  serviceName?: string; // Alternative name field used by Campus Controller
  description?: string;
  enabled?: boolean;
  status?: string; // 'enabled' or 'disabled'
  ssid?: string;
  security?: {
    type?: string;
    privacyType?: string;
    authType?: string;
    authMethod?: string;
    encryption?: string;
    passphrase?: string;
    [key: string]: any;
  };
  vlan?: number;
  band?: string;
  maxClients?: number;
  hidden?: boolean;
  suppressSsid?: boolean; // Alternative field for hidden SSID
  captivePortal?: boolean;
  enableCaptivePortal?: boolean; // Alternative field name for captive portal
  guestAccess?: boolean;

  // Campus Controller specific fields
  canEdit?: boolean;
  canDelete?: boolean;

  // Network/VLAN Configuration
  dot1dPortNumber?: number; // VLAN ID / Service ID
  defaultTopology?: string; // Topology UUID for VLAN assignment
  proxied?: string; // "Local" or "Centralized" - traffic forwarding mode

  // Security Configuration - Top-level elements
  WpaPskElement?: {
    mode?: string; // Security mode like "aesOnly", "tkipOnly", "mixed"
    pmfMode?: string; // Protected Management Frames
    presharedKey?: string;
    keyHexEncoded?: boolean;
    [key: string]: any;
  };
  WpaEnterpriseElement?: {
    mode?: string; // Enterprise security mode "aesOnly", "wpa3only", etc.
    pmfMode?: string;
    fastTransitionEnabled?: boolean; // 802.11r
    fastTransitionMdId?: number; // Mobility Domain ID for 802.11r
    [key: string]: any;
  };
  WpaSaeElement?: {
    pmfMode?: string; // Protected Management Frames mode: "required", "capable", "disabled"
    presharedKey?: string;
    keyHexEncoded?: boolean;
    saeMethod?: string; // SAE method: "SaeH2e" (Hash-to-Element) or "SaeLoop"
    encryption?: string; // Encryption like "AES_CCM_128"
    akmSuiteSelector?: string;
    [key: string]: any;
  };

  // Security Configuration - Nested in privacy object
  privacy?: {
    WpaPskElement?: {
      mode?: string;
      pmfMode?: string;
      presharedKey?: string;
      keyHexEncoded?: boolean;
      [key: string]: any;
    };
    WpaEnterpriseElement?: {
      mode?: string;
      pmfMode?: string;
      fastTransitionEnabled?: boolean;
      fastTransitionMdId?: number;
      [key: string]: any;
    };
    WpaSaeElement?: {
      pmfMode?: string;
      presharedKey?: string;
      keyHexEncoded?: boolean;
      saeMethod?: string;
      encryption?: string;
      akmSuiteSelector?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };

  // OWE (Opportunistic Wireless Encryption) - Enhanced Open
  oweAutogen?: boolean; // Auto-generate OWE transition SSID
  oweCompanion?: string | null; // Companion service ID for OWE

  // Advanced Security
  beaconProtection?: boolean; // WPA3 beacon protection

  // AAA/RADIUS Configuration
  aaaPolicyId?: string | null; // AAA Policy UUID for RADIUS
  accountingEnabled?: boolean; // RADIUS accounting

  // Role Assignment
  unAuthenticatedUserDefaultRoleID?: string; // Default role before authentication
  authenticatedUserDefaultRoleID?: string; // Default role after authentication
  mbatimeoutRoleId?: string | null; // Role after MAC-based auth timeout
  defaultCoS?: string; // Class of Service UUID

  // 802.11k/v/r Support
  enabled11kSupport?: boolean; // 802.11k Radio Resource Management
  rm11kBeaconReport?: boolean; // 802.11k beacon report
  rm11kQuietIe?: boolean; // 802.11k quiet IE
  enable11mcSupport?: boolean; // 802.11v BSS Transition Management

  // Band Steering & Multi-band
  bandSteering?: boolean; // Steer clients to less congested band
  mbo?: boolean; // Multi-Band Operation (802.11k/v enhancements)

  // QoS & Admission Control
  uapsdEnabled?: boolean; // WMM Power Save (U-APSD)
  admissionControlVideo?: boolean; // QoS admission control for video
  admissionControlVoice?: boolean; // QoS admission control for voice
  admissionControlBestEffort?: boolean; // QoS admission control for best effort
  admissionControlBackgroundTraffic?: boolean; // QoS admission control for background
  dscp?: {
    codePoints?: number[]; // Array of 64 DSCP to UP mappings (0-7)
  };

  // Client Management
  clientToClientCommunication?: boolean; // Allow wireless client-to-client (false = isolation)
  flexibleClientAccess?: boolean; // Dynamic client access control
  purgeOnDisconnect?: boolean; // Clear client data on disconnect
  includeHostname?: boolean; // Send hostname to RADIUS
  mbaAuthorization?: boolean; // MAC-Based Authorization

  // Timeouts
  preAuthenticatedIdleTimeout?: number; // Idle timeout before auth (seconds)
  postAuthenticatedIdleTimeout?: number; // Idle timeout after auth (seconds)
  sessionTimeout?: number; // Maximum session duration (seconds)

  // Captive Portal
  captivePortalType?: string | null; // Type of captive portal
  eGuestPortalId?: string | null; // eGuest portal UUID
  eGuestSettings?: any[]; // eGuest portal settings
  cpNonAuthenticatedPolicyName?: string | null; // Captive portal policy name

  // Hotspot 2.0 / Passpoint
  hotspotType?: string; // "Disabled", "Hotspot20", etc.
  hotspot?: any | null; // Hotspot 2.0 configuration object

  // Roaming
  roamingAssistPolicy?: string | null; // Roaming assistance policy UUID

  // RADIUS Attributes
  vendorSpecificAttributes?: string[]; // Custom RADIUS VSAs: ["apName", "vnsName", "ssid", etc.]

  // Mesh
  shutdownOnMeshpointLoss?: boolean; // Disable service if mesh connection lost

  // Features
  features?: string[]; // Feature flags like ["CENTRALIZED-SITE"]

  // Additional security-related fields that might exist at the service level
  privacyType?: string;
  authType?: string;
  authMethod?: string;
  encryption?: string;
  securityMode?: string;
  securityType?: string;
  mode?: string; // Security mode that may exist at top level
  [key: string]: any;
}

export interface Role {
  id: string;
  name: string;
  canEdit: boolean;
  canDelete: boolean;
  predefined: boolean;
  l2Filters: any[];
  l3Filters: any[];
  l3SrcDestFilters: any[];
  l7Filters: any[];
  defaultAction: 'allow' | 'deny' | string;
  topology: string | null;
  defaultCos: string | null;
  cpTopologyId: string | null;
  cpRedirect: string;
  cpIdentity: string;
  cpSharedKey: string;
  cpDefaultRedirectUrl: string;
  cpRedirectUrlSelect: string;
  cpHttp: boolean;
  cpUseFQDN: boolean;
  cpAddIpAndPort: boolean;
  cpAddApNameAndSerial: boolean;
  cpAddBssid: boolean;
  cpAddVnsName: boolean;
  cpAddSsid: boolean;
  cpAddMac: boolean;
  cpAddRole: boolean;
  cpAddVlan: boolean;
  cpAddTime: boolean;
  cpAddSign: boolean;
  cpOauthUseGoogle: boolean;
  cpOauthUseFacebook: boolean;
  cpOauthUseMicrosoft: boolean;
  cpRedirectPorts: number[];
  features: string[];
  profiles: string[];
  [key: string]: any;
}

export interface ClassOfService {
  id: string;
  cosName: string;
  canEdit: boolean;
  canDelete: boolean;
  predefined: boolean;
  cosQos: {
    priority: string;
    tosDscp: number | null;
    mask: number | null;
  };
  inboundRateLimiterId: string | null;
  outboundRateLimiterId: string | null;
}

export interface Topology {
  id: string;
  name: string;
  vlanid: number;
  tagged: boolean;
  canEdit: boolean;
  canDelete: boolean;
  mode: string;
  [key: string]: any;
}

export interface AaaPolicy {
  id: string;
  name: string;
  policyName?: string;
  description?: string;
  canEdit?: boolean;
  canDelete?: boolean;
  radiusServer?: string;
  radiusPort?: number;
  radiusSecret?: string;
  radiusAuthPort?: number;
  radiusAcctPort?: number;
  accountingEnabled?: boolean;
  [key: string]: any;
}

export interface Site {
  id: string;
  name: string;
  siteName?: string; // ConfigureSites component uses this field
  country?: string;
  timezone?: string;
  status?: string;
  roles?: number;
  networks?: number;
  switches?: number;
  aps?: number;
  adoptionPrimary?: string;
  adoptionBackup?: string;
  activeAPs?: number;
  nonActiveAPs?: number;
  allClients?: number;
  campus?: string;
  description?: string;
  address?: string;
  contactInfo?: any;
  settings?: any;
  [key: string]: any;
}

export interface Country {
  name: string;
  code: string;
  timezones?: string[];
  [key: string]: any;
}

export interface SiteStats {
  totalStations?: number;
  activeAPs?: number;
  totalAPs?: number;
  [key: string]: any;
}

export interface ApiCallLog {
  id: number;
  timestamp: Date;
  method: string;
  endpoint: string;
  status?: number;
  duration?: number;
  requestBody?: any;
  responseBody?: any;
  error?: string;
  isPending: boolean;
}

class ApiService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private pendingRequests = new Set<AbortController>();
  private requestCounter = 0;
  private sessionExpiredHandler: (() => void) | null = null;
  
  // Developer mode API logging
  private apiCallLogs: ApiCallLog[] = [];
  private apiLogSubscribers = new Set<(log: ApiCallLog) => void>();
  private maxLogs = 500; // Maximum number of logs to keep

  constructor() {
    // Load tokens from localStorage on initialization
    this.accessToken = localStorage.getItem('access_token');
    this.refreshToken = localStorage.getItem('refresh_token');
  }

  async login(userId: string, password: string): Promise<AuthResponse> {
    // Validate inputs
    if (!userId.trim()) {
      throw new Error('User ID is required');
    }
    if (!password.trim()) {
      throw new Error('Password is required');
    }

    // Try multiple authentication formats as different Campus Controller versions may expect different formats
    const authFormats = [
      // Format 1: JSON with camelCase grantType and userId (Extreme Networks standard)
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          grantType: 'password',
          userId: userId.trim(),
          password: password
        })
      },
      // Format 2: JSON with snake_case grant_type and userId (OAuth 2.0 standard)
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'password',
          userId: userId.trim(),
          password: password
        })
      },
      // Format 3: JSON with camelCase and scope field
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          grantType: 'password',
          userId: userId.trim(),
          password: password,
          scope: ''
        })
      },
      // Format 4: JSON with snake_case grant_type and scope field
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'password',
          userId: userId.trim(),
          password: password,
          scope: ''
        })
      },
      // Format 5: JSON with username field instead of userId (camelCase)
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          grantType: 'password',
          username: userId.trim(),
          password: password
        })
      },
      // Format 6: JSON with username field instead of userId (snake_case)
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'password',
          username: userId.trim(),
          password: password
        })
      }
    ];

    let lastError: Error | null = null;
    let credentialError: Error | null = null; // Prioritize 401 errors over format errors

    for (let i = 0; i < authFormats.length; i++) {
      const format = authFormats[i];
      
      try {
        // Only log first format attempt to reduce console noise
        if (i === 0) {
          console.log(`Attempting authentication...`);
        }
        
        // Add timeout for login requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout for login
        
        const response = await fetch(`${BASE_URL}/v1/oauth2/token`, {
          method: 'POST',
          signal: controller.signal,
          ...format,
        });
        
        clearTimeout(timeoutId);

        if (response.ok) {
          const authResponse: AuthResponse = await response.json();
          
          // Store tokens
          this.accessToken = authResponse.access_token;
          this.refreshToken = authResponse.refresh_token;
          localStorage.setItem('access_token', authResponse.access_token);
          localStorage.setItem('refresh_token', authResponse.refresh_token);
          localStorage.setItem('admin_role', authResponse.adminRole);

          console.log(`✅ Login successful`);
          return authResponse;
        } else {
          const errorText = await response.text();
          let errorMessage = `Authentication failed (${response.status})`;
          
          // Try to parse structured error response
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.errors && errorData.errors.length > 0) {
              const firstError = errorData.errors[0];
              errorMessage = firstError.errorMessage || errorMessage;
            }
          } catch (parseError) {
            // If parsing fails, use the raw error text
            if (errorText.length > 0 && errorText.length < 200) {
              errorMessage = errorText;
            }
          }
          
          const currentError = new Error(errorMessage);
          
          // Prioritize 401 errors (wrong credentials) over 422 errors (wrong format)
          if (response.status === 401) {
            credentialError = currentError;
            // Don't log each failed format to reduce noise - we'll throw the error at the end
          }
          
          lastError = currentError;
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new Error(`Authentication timed out after 8 seconds`);
        } else {
          lastError = error instanceof Error ? error : new Error(`Network error during authentication`);
        }
      }
    }

    // If all formats failed, throw the credential error (401) if we have one, otherwise the last error
    if (credentialError) {
      console.error('❌ Authentication failed: Invalid credentials');
      throw credentialError;
    } else {
      console.error('❌ Authentication failed: Unable to connect to server');
      throw lastError || new Error('Login failed with all authentication formats');
    }
  }

  async logout(): Promise<void> {
    // Cancel all pending requests first
    this.cancelAllRequests();
    
    if (this.accessToken) {
      try {
        await fetch(`${BASE_URL}/v1/oauth2/token/${this.accessToken}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': 'application/json',
          },
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }

    // Clear tokens
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('admin_role');
  }

  async makeAuthenticatedRequest(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs: number = 6000
  ): Promise<Response> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Create AbortController for timeout and cancellation
    const controller = new AbortController();
    this.pendingRequests.add(controller);
    
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    const requestId = ++this.requestCounter;
    const startTime = Date.now();
    
    // Simple analytics endpoint detection - avoid complex logic
    const isAnalyticsEndpoint = 
      endpoint.includes('/sites/report') ||
      endpoint.includes('/aps/report') ||
      endpoint.includes('/reports/') ||
      endpoint.includes('/alerts') ||
      endpoint.includes('/devices') ||
      endpoint.includes('/globalsettings') ||
      endpoint.includes('/stations') ||
      endpoint.includes('report/widgets') ||
      endpoint.includes('/events') ||
      endpoint.includes('/countries') ||
      endpoint.includes('/roles') || // Roles endpoint may not be available on all systems
      endpoint.includes('/notifications') || // Notifications are optional
      endpoint.includes('/services'); // Services may not be available on all systems

    if (!isAnalyticsEndpoint) {
      console.log(`[Request ${requestId}] Starting: ${endpoint}`);
    }

    // Log API call for developer mode
    const apiLog: ApiCallLog = {
      id: requestId,
      timestamp: new Date(),
      method: (options.method || 'GET').toUpperCase(),
      endpoint: endpoint,
      isPending: true,
      requestBody: options.body ? this.safeParseJSON(options.body) : undefined
    };
    this.addApiLog(apiLog);
    
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });
      
      const duration = Date.now() - startTime;
      
      if (!isAnalyticsEndpoint) {
        console.log(`[Request ${requestId}] Completed: ${endpoint} (${response.status})`);
      }
      
      // Clone response to read body without consuming it
      const responseClone = response.clone();
      let responseBody: any = undefined;
      try {
        const text = await responseClone.text();
        responseBody = this.safeParseJSON(text);
      } catch (e) {
        // Ignore errors reading response body for logging
      }

      // Update API log with response
      this.updateApiLog(requestId, {
        status: response.status,
        duration,
        responseBody: this.truncateResponseBody(responseBody),
        isPending: false
      });
      
      clearTimeout(timeoutId);
      this.pendingRequests.delete(controller);

      if (response.status === 401) {
        // Define non-critical endpoints that should NOT trigger logout on 401
        // These are typically analytics, reporting, or optional features
        const isNonCriticalEndpoint = 
          endpoint.includes('/stations') ||
          endpoint.includes('/services') ||
          endpoint.includes('/notifications') ||
          endpoint.includes('/alerts') ||
          endpoint.includes('/events') ||
          endpoint.includes('/report') ||
          endpoint.includes('/reports') ||
          endpoint.includes('/analytics');
        
        // Token expired, try to refresh (unless it's a non-critical endpoint)
        if (this.refreshToken && !isAnalyticsEndpoint && !isNonCriticalEndpoint) {
          // Attempt refresh for critical endpoints
          try {
            await this.refreshAccessToken();
            // Retry the request with new token
            return this.makeAuthenticatedRequest(endpoint, options, timeoutMs);
          } catch (refreshError) {
            // Refresh failed, user needs to login again
            console.log('Token refresh failed, clearing authentication state');
            await this.logout();
            // Notify the app about session expiration
            if (this.sessionExpiredHandler) {
              this.sessionExpiredHandler();
            }
            throw new Error('Session expired. Please login again.');
          }
        } else if (isNonCriticalEndpoint) {
          // For non-critical endpoints, just throw an error without logging out
          console.warn(`Authentication failed for ${endpoint}, but not logging out (non-critical endpoint)`);
          if (isAnalyticsEndpoint) {
            throw new Error(`SUPPRESSED_ANALYTICS_ERROR: Authentication required for ${endpoint}`);
          }
          throw new Error(`SUPPRESSED_NON_CRITICAL_ERROR: Authentication required for ${endpoint}`);
        } else {
          // Critical endpoint with no refresh token - logout required
          if (isAnalyticsEndpoint) {
            // Silently suppress analytics authentication errors
            throw new Error(`SUPPRESSED_ANALYTICS_ERROR: Authentication required for ${endpoint}`);
          }
          console.log('Authentication required, clearing authentication state');
          await this.logout();
          // Notify the app about session expiration
          if (this.sessionExpiredHandler) {
            this.sessionExpiredHandler();
          }
          throw new Error('Session expired. Please login again.');
        }
      }

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      clearTimeout(timeoutId);
      this.pendingRequests.delete(controller);

      // Update API log with error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.updateApiLog(requestId, {
        duration,
        error: errorMessage,
        isPending: false
      });
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          if (!isAnalyticsEndpoint) {
            console.warn(`Request to ${endpoint} timed out after ${timeoutMs}ms`);
          }
          
          if (isAnalyticsEndpoint) {
            throw new Error(`SUPPRESSED_ANALYTICS_ERROR: Request timeout for ${endpoint}`);
          }
          
          throw new Error(`Request timeout`);
        }
        
        // Handle network fetch failures more gracefully
        if (error.message === 'Failed to fetch') {
          if (isAnalyticsEndpoint) {
            throw new Error(`SUPPRESSED_ANALYTICS_ERROR: ${endpoint}`);
          }
          
          // Log network errors for debugging
          console.warn(`Network error for ${endpoint}: ${error.message}`);
          
          throw new Error(`Network error: Unable to connect to Campus Controller. Please check your connection and server availability.`);
        }
        
        if (!isAnalyticsEndpoint) {
          console.warn(`Request to ${endpoint} failed:`, error.message);
        }
        throw error;
      }
      throw new Error('Network request failed');
    }
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    // Add timeout for refresh token requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 second timeout

    try {
      const response = await fetch(`${BASE_URL}/v1/oauth2/refreshToken`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          refresh_token: this.refreshToken,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const authResponse: AuthResponse = await response.json();
      this.accessToken = authResponse.access_token;
      this.refreshToken = authResponse.refresh_token;
      localStorage.setItem('access_token', authResponse.access_token);
      localStorage.setItem('refresh_token', authResponse.refresh_token);
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Token refresh timed out - please login again');
      }
      throw error;
    }
  }

  isAuthenticated(): boolean {
    // Check both in-memory token and localStorage
    const memoryToken = !!this.accessToken;
    const storageToken = !!localStorage.getItem('access_token');
    
    // If we have a token in storage but not in memory, reload it
    if (!memoryToken && storageToken) {
      console.log('[Auth] Reloading tokens from localStorage into memory');
      this.accessToken = localStorage.getItem('access_token');
      this.refreshToken = localStorage.getItem('refresh_token');
      return true;
    }
    
    // If we have token in memory but not storage, clear memory (storage is source of truth)
    if (memoryToken && !storageToken) {
      console.log('[Auth] Token in memory but not storage - clearing authentication');
      this.accessToken = null;
      this.refreshToken = null;
      return false;
    }
    
    return memoryToken && storageToken;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getAdminRole(): string | null {
    return localStorage.getItem('admin_role');
  }

  // Validate current session by making a test API call
  async validateSession(): Promise<boolean> {
    if (!this.isAuthenticated()) {
      return false;
    }

    try {
      // Use a lightweight endpoint to test authentication
      const response = await this.makeAuthenticatedRequest('/v1/globalsettings', {
        method: 'GET'
      }, 4000); // Short timeout for validation
      
      return response.ok;
    } catch (error) {
      console.log('Session validation failed:', error instanceof Error ? error.message : 'Unknown error');
      
      // If the error indicates session expiration, clear authentication
      if (error instanceof Error && 
          (error.message.includes('Session expired') || 
           error.message.includes('Authentication required'))) {
        console.log('Clearing invalid session');
        await this.logout();
        // Notify the app about session expiration
        if (this.sessionExpiredHandler) {
          this.sessionExpiredHandler();
        }
      }
      
      return false;
    }
  }

  // Utility method for making requests with retry logic
  async makeRequestWithRetry<T>(
    requestFn: () => Promise<T>,
    maxRetries: number = 2,
    retryDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        // Don't retry for authentication errors or client errors (4xx)
        if (lastError.message.includes('Session expired') || 
            lastError.message.includes('Authentication required') ||
            lastError.message.includes('403') ||
            lastError.message.includes('404') ||
            lastError.message.includes('422')) {
          throw lastError;
        }
        
        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
        console.log(`Retrying request (attempt ${attempt + 2}/${maxRetries + 1})...`);
      }
    }
    
    throw lastError!;
  }

  // Cancel all pending requests (useful when user logs out or navigates away)
  cancelAllRequests(): void {
    const requestCount = this.pendingRequests.size;
    if (requestCount > 0) {
      console.log(`Canceling ${requestCount} pending request(s)`);
    }
    for (const controller of this.pendingRequests) {
      controller.abort();
    }
    this.pendingRequests.clear();
  }

  // Sites API methods with fallback endpoints
  async getSites(): Promise<Site[]> {
    // Try multiple endpoints as Campus Controller may use different versions
    const siteEndpoints = [
      '/v3/sites',
      '/v1/sites', 
      '/sites',
      '/v2/sites',
      '/v1/sites/all'
    ];

    for (let i = 0; i < siteEndpoints.length; i++) {
      const endpoint = siteEndpoints[i];
      try {
        console.log(`Fetching sites from ${endpoint} (attempt ${i + 1}/${siteEndpoints.length})...`);
        const response = await this.makeAuthenticatedRequest(endpoint, {}, 10000); // Longer timeout for sites
        
        if (!response.ok) {
          console.warn(`Sites API ${endpoint} returned status ${response.status}: ${response.statusText}`);
          
          // If it's 404, try the next endpoint
          if (response.status === 404) {
            console.log(`Endpoint ${endpoint} not found, trying next...`);
            continue;
          }
          
          throw new Error(`Failed to fetch sites from ${endpoint}: ${response.status} ${response.statusText}`);
        }
        
        const sites = await response.json();
        console.log(`Successfully fetched ${sites ? sites.length : 0} sites from ${endpoint}`);
        
        // Debug log the first few sites to verify structure
        if (sites && sites.length > 0) {
          console.log('Sample site structure:', {
            endpoint: endpoint,
            firstSite: sites[0],
            totalSites: sites.length,
            sampleSiteIds: sites.slice(0, 3).map((s: Site) => ({ id: s.id, name: s.name || s.siteName }))
          });
          
          // Specifically look for the problematic site ID
          const targetSite = sites.find((site: Site) => site.id === 'c7395471-aa5c-46dc-9211-3ed24c5789bd');
          if (targetSite) {
            console.log('Found target site in response:', {
              endpoint: endpoint,
              site: targetSite
            });
          }
          
          return sites;
        } else {
          console.warn(`${endpoint} returned empty or null sites array`);
          // Continue to next endpoint if this one returns empty
          continue;
        }
        
      } catch (error) {
        console.warn(`Failed to load sites from ${endpoint}:`, error);
        
        // Provide more detailed error information
        if (error instanceof Error) {
          console.warn(`Sites API ${endpoint} error details:`, {
            message: error.message,
            stack: error.stack?.split('\n')[0] // Just first line of stack
          });
          
          // If it's a network error or 404, try the next endpoint
          if (error.message.includes('404') || 
              error.message.includes('Not Found') || 
              error.message.includes('Failed to fetch')) {
            console.log(`Network/404 error for ${endpoint}, trying next endpoint...`);
            continue;
          }
          
          // Check if it's a suppressed error (which shouldn't happen for sites but just in case)
          if (error.message.includes('SUPPRESSED_ANALYTICS_ERROR') || 
              error.message.includes('SUPPRESSED_NON_CRITICAL_ERROR')) {
            console.log(`Sites endpoint ${endpoint} was marked as suppressed endpoint - this should not happen`);
            continue;
          }
        }
        
        // If this is the last endpoint, don't continue
        if (i === siteEndpoints.length - 1) {
          break;
        }
      }
    }
    
    console.warn('All site endpoints failed or returned empty results');
    return [];
  }

  async getSiteById(siteId: string): Promise<Site | null> {
    try {
      // First try to get from the sites list
      const sites = await this.getSites();
      const foundSite = sites.find(site => site.id === siteId);
      if (foundSite) {
        return foundSite;
      }
      
      // If not found in sites list, try individual site lookup endpoints
      const individualEndpoints = [
        `/v3/sites/${siteId}`,
        `/v1/sites/${siteId}`,
        `/sites/${siteId}`,
        `/v2/sites/${siteId}`
      ];
      
      for (const endpoint of individualEndpoints) {
        try {
          console.log(`Trying individual site lookup: ${endpoint}`);
          const response = await this.makeAuthenticatedRequest(endpoint, {}, 5000);
          
          if (response.ok) {
            const site = await response.json();
            console.log(`Found individual site via ${endpoint}:`, site);
            return site;
          } else if (response.status === 404) {
            console.log(`Individual site endpoint ${endpoint} not found, trying next...`);
            continue;
          }
        } catch (error) {
          console.warn(`Individual site lookup failed for ${endpoint}:`, error);
          continue;
        }
      }
      
      return null;
    } catch (error) {
      console.warn(`Failed to find site with ID ${siteId}:`, error);
      return null;
    }
  }

  // Services API method - simple version to avoid recursion
  async getServices(): Promise<Service[]> {
    try {
      const response = await this.makeAuthenticatedRequest('/v1/services', {}, 8000);
      
      if (!response.ok) {
        console.warn(`Services API returned status ${response.status}: ${response.statusText}`);
        return [];
      }
      
      const services = await response.json();
      
      if (services && Array.isArray(services)) {
        console.log(`Successfully fetched ${services.length} services`);
        return services;
      } else {
        console.warn('Invalid services response format');
        return [];
      }
    } catch (error) {
      console.warn('Failed to load services:', error);
      return [];
    }
  }

  // Roles API method - uses /v3/roles endpoint (network policy roles)
  async getRoles(): Promise<Role[]> {
    try {
      const response = await this.makeAuthenticatedRequest('/v3/roles', {}, 8000);
      
      if (!response.ok) {
        console.warn(`Failed to fetch roles: ${response.status} ${response.statusText}`);
        return [];
      }
      
      const data = await response.json();
      
      if (Array.isArray(data)) {
        console.log(`✓ Successfully loaded ${data.length} network roles from /v3/roles`);
        return data;
      } else {
        console.warn('Roles response is not an array:', data);
        return [];
      }
    } catch (error) {
      console.error('Error fetching roles:', error);
      return [];
    }
  }
  
  // Get role name to ID mapping
  async getRoleNameToIdMap(): Promise<Record<string, string>> {
    try {
      const response = await this.makeAuthenticatedRequest('/v3/roles/nametoidmap', {}, 8000);
      
      if (!response.ok) {
        console.warn(`Failed to fetch role name map: ${response.status} ${response.statusText}`);
        return {};
      }
      
      const data = await response.json();
      console.log(`✓ Successfully loaded role name to ID mapping`);
      return data;
    } catch (error) {
      console.error('Error fetching role name map:', error);
      return {};
    }
  }

  // Set a callback function to handle session expiration
  setSessionExpiredHandler(handler: () => void): void {
    this.sessionExpiredHandler = handler;
  }

  // Developer mode API logging methods
  subscribeToApiLogs(callback: (log: ApiCallLog) => void): () => void {
    this.apiLogSubscribers.add(callback);
    // Return unsubscribe function
    return () => {
      this.apiLogSubscribers.delete(callback);
    };
  }

  getApiLogs(): ApiCallLog[] {
    return [...this.apiCallLogs];
  }

  clearApiLogs(): void {
    this.apiCallLogs = [];
    this.notifyLogSubscribers();
  }

  private notifyLogSubscribers(): void {
    // Notify all subscribers with the current log state
    this.apiLogSubscribers.forEach(callback => {
      // Send a dummy update to trigger re-render
      if (this.apiCallLogs.length > 0) {
        callback(this.apiCallLogs[this.apiCallLogs.length - 1]);
      }
    });
  }

  private addApiLog(log: ApiCallLog): void {
    this.apiCallLogs.push(log);
    
    // Keep only the last maxLogs entries
    if (this.apiCallLogs.length > this.maxLogs) {
      this.apiCallLogs.shift();
    }

    // Notify all subscribers
    this.apiLogSubscribers.forEach(callback => callback(log));
  }

  private updateApiLog(id: number, updates: Partial<ApiCallLog>): void {
    const log = this.apiCallLogs.find(l => l.id === id);
    if (log) {
      Object.assign(log, updates);
      // Notify subscribers
      this.apiLogSubscribers.forEach(callback => callback(log));
    }
  }

  private safeParseJSON(text: any): any {
    if (typeof text !== 'string') {
      return text;
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      return text;
    }
  }

  private truncateResponseBody(body: any): any {
    if (!body) return body;
    
    const stringified = JSON.stringify(body);
    // Limit response body to 50KB to avoid memory issues
    if (stringified.length > 50000) {
      return {
        _truncated: true,
        _originalSize: stringified.length,
        _preview: stringified.substring(0, 50000) + '...'
      };
    }
    return body;
  }

  // Test basic connectivity to the Campus Controller
  async testConnectivity(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      console.log('Testing connectivity to Campus Controller...');
      
      // Test basic HTTPS connectivity with shorter timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 second timeout

      const response = await fetch(`${BASE_URL}/v1/oauth2/token`, {
        method: 'OPTIONS',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok || response.status === 405) {
        // 405 Method Not Allowed is expected for OPTIONS, but means the endpoint exists
        return {
          success: true,
          message: 'Campus Controller is reachable',
          details: {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries())
          }
        };
      } else {
        return {
          success: false,
          message: `Server responded with ${response.status}: ${response.statusText}`,
          details: {
            status: response.status,
            statusText: response.statusText
          }
        };
      }
    } catch (error) {
      let message = 'Cannot reach Campus Controller';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          message = 'Connection test timed out - server may be unreachable';
        } else if (error.message.includes('CORS')) {
          message = 'CORS policy blocking request - check server configuration';
        } else if (error.message.includes('network')) {
          message = 'Network error - check internet connection';
        } else if (error.message.includes('certificate') || error.message.includes('SSL')) {
          message = 'SSL/Certificate error - check HTTPS configuration';
        } else {
          message = error.message;
        }
      }
      
      return {
        success: false,
        message,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  // Access Points API methods
  async getAccessPoints(): Promise<AccessPoint[]> {
    return this.makeRequestWithRetry(async () => {
      const response = await this.makeAuthenticatedRequest('/v1/aps');
      if (!response.ok) {
        throw new Error(`Failed to fetch access points: ${response.status}`);
      }
      return await response.json();
    });
  }

  async getAPQueryColumns(): Promise<APQueryColumn[]> {
    try {
      const response = await this.makeAuthenticatedRequest('/v1/aps/query/columns');
      if (!response.ok) {
        throw new Error(`Failed to fetch AP query columns: ${response.status}`);
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      return [];
    }
  }

  async queryAccessPoints(query?: any): Promise<AccessPoint[]> {
    // If no specific query is provided, use the basic endpoint
    if (!query || Object.keys(query).length === 0) {
      return this.getAccessPoints();
    }
    
    // Try the query endpoint for advanced filtering
    try {
      const response = await this.makeAuthenticatedRequest('/v1/aps/query', {
        method: 'POST',
        body: JSON.stringify(query)
      });
      if (!response.ok) {
        // If query endpoint fails, fall back to basic endpoint
        return this.getAccessPoints();
      }
      return await response.json();
    } catch (error) {
      // If query endpoint fails, fall back to basic endpoint
      return this.getAccessPoints();
    }
  }

  async getAccessPointDetails(serialNumber: string): Promise<APDetails> {
    const response = await this.makeAuthenticatedRequest(`/v1/aps/${encodeURIComponent(serialNumber)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch AP details: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  }

  async getAccessPointStations(serialNumber: string): Promise<APStation[]> {
    const response = await this.makeAuthenticatedRequest(`/v1/aps/${encodeURIComponent(serialNumber)}/stations`);
    if (!response.ok) {
      throw new Error(`Failed to fetch AP stations: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  async updateAccessPoint(serialNumber: string, config: Partial<APDetails>): Promise<APDetails> {
    const response = await this.makeAuthenticatedRequest(
      `/v1/aps/${encodeURIComponent(serialNumber)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      }
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update AP: ${response.status} ${response.statusText} - ${errorText}`);
    }
    return await response.json();
  }

  async getAPPlatforms(): Promise<APPlatform[]> {
    const response = await this.makeAuthenticatedRequest('/v1/aps/platforms');
    if (!response.ok) {
      throw new Error(`Failed to fetch AP platforms: ${response.status}`);
    }
    return await response.json();
  }

  async getAPHardwareTypes(): Promise<APHardwareType[]> {
    const response = await this.makeAuthenticatedRequest('/v1/aps/hardwaretypes');
    if (!response.ok) {
      throw new Error(`Failed to fetch AP hardware types: ${response.status}`);
    }
    return await response.json();
  }

  async getAPDisplayNames(): Promise<any> {
    const response = await this.makeAuthenticatedRequest('/v1/aps/displaynames');
    if (!response.ok) {
      throw new Error(`Failed to fetch AP display names: ${response.status}`);
    }
    return await response.json();
  }

  async getAPDefaults(hardwareType?: string): Promise<any> {
    const endpoint = hardwareType 
      ? `/v1/aps/default?hardwareType=${encodeURIComponent(hardwareType)}`
      : '/v1/aps/default';
    const response = await this.makeAuthenticatedRequest(endpoint);
    if (!response.ok) {
      throw new Error(`Failed to fetch AP defaults: ${response.status}`);
    }
    return await response.json();
  }

  // Stations/Clients API methods
  async getAllStations(): Promise<Station[]> {
    try {
      return await this.makeRequestWithRetry(async () => {
        const response = await this.makeAuthenticatedRequest('/v1/stations');
        if (!response.ok) {
          throw new Error(`Failed to fetch stations: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      });
    } catch (error) {
      if (error instanceof Error && 
          (error.message.includes('SUPPRESSED_ANALYTICS_ERROR') || 
           error.message.includes('SUPPRESSED_NON_CRITICAL_ERROR'))) {
        // Return empty array for suppressed errors instead of throwing
        console.log('Returning empty stations array for suppressed endpoint');
        return [];
      }
      throw error;
    }
  }

  // Alias for getAllStations to maintain compatibility
  async getStations(): Promise<Station[]> {
    return this.getAllStations();
  }

  // Get stations with proper site correlation from access points
  async getStationsWithSiteCorrelation(): Promise<Station[]> {
    try {
      console.log('Fetching stations with site correlation...');
      
      // Fetch both stations and access points in parallel
      const [stations, accessPoints] = await Promise.all([
        this.getAllStations(),
        this.getAccessPoints()
      ]);
      
      // Create a map of AP serial numbers to their site information
      const apSiteMap = new Map<string, string>();
      accessPoints.forEach(ap => {
        if (ap.serialNumber && ap.hostSite) {
          apSiteMap.set(ap.serialNumber, ap.hostSite);
        }
      });
      
      console.log(`Found ${accessPoints.length} access points with site mappings`);
      console.log(`Processing ${stations.length} stations for site correlation`);
      
      // Correlate stations with their sites
      const stationsWithSites = stations.map(station => {
        // Try multiple fields for AP serial number correlation
        const apSerial = station.apSerial || 
                         station.apSerialNumber || 
                         station.accessPointSerialNumber ||
                         station.apSerial;
        
        let correlatedSiteName = station.siteName; // Keep existing if available
        
        // If we have an AP serial and can find the site, use that
        if (apSerial && apSiteMap.has(apSerial)) {
          correlatedSiteName = apSiteMap.get(apSerial);
        }
        
        // Return the station with updated site information
        return {
          ...station,
          siteName: correlatedSiteName,
          // Also store the correlated site in a separate field for reference
          correlatedSite: correlatedSiteName,
          // Add debugging info
          correlationSource: apSerial && apSiteMap.has(apSerial) ? 'AP-correlation' : 'original-data'
        };
      });
      
      const correlatedCount = stationsWithSites.filter(s => s.correlationSource === 'AP-correlation').length;
      console.log(`Successfully correlated ${correlatedCount} stations with sites via AP mapping`);
      
      return stationsWithSites;
    } catch (error) {
      if (error instanceof Error && 
          (error.message.includes('SUPPRESSED_ANALYTICS_ERROR') || 
           error.message.includes('SUPPRESSED_NON_CRITICAL_ERROR'))) {
        console.log('Returning empty stations array for suppressed endpoint');
        return [];
      }
      
      // If correlation fails, fall back to regular stations
      console.warn('Site correlation failed, falling back to regular station data:', error);
      return this.getAllStations();
    }
  }

  // Get specific station by MAC address
  async getStation(macAddress: string): Promise<Station> {
    try {
      // First try to get a specific station endpoint (if it exists)
      try {
        const response = await this.makeAuthenticatedRequest(`/v1/stations/${encodeURIComponent(macAddress)}`);
        if (response.ok) {
          return await response.json();
        }
      } catch (error) {
        // If specific endpoint doesn't exist, fall back to filtering all stations
        console.log('Specific station endpoint not available, searching in all stations');
      }

      // Fallback: get all stations and filter for the specific MAC address
      const allStations = await this.getAllStations();
      const station = allStations.find(s => s.macAddress?.toLowerCase() === macAddress.toLowerCase());
      
      if (!station) {
        throw new Error(`Station with MAC address ${macAddress} not found`);
      }
      
      return station;
    } catch (error) {
      if (error instanceof Error && 
          (error.message.includes('SUPPRESSED_ANALYTICS_ERROR') || 
           error.message.includes('SUPPRESSED_NON_CRITICAL_ERROR'))) {
        // Return a default station object for suppressed errors
        console.log('Returning default station object for suppressed endpoint');
        return {
          macAddress,
          status: 'Unknown',
          hostName: 'Unknown',
          deviceType: 'Unknown'
        };
      }
      throw error;
    }
  }

  // Station management methods
  async disassociateStations(macAddresses: string[]): Promise<void> {
    const response = await this.makeAuthenticatedRequest('/v1/stations/disassociate', {
      method: 'POST',
      body: JSON.stringify({ macAddresses })
    });
    if (!response.ok) {
      throw new Error(`Failed to disassociate stations: ${response.status} ${response.statusText}`);
    }
  }

  // Note: getSites() method is defined earlier in the file with comprehensive endpoint fallback logic

  // Note: createSite() method is defined later in the file with comprehensive error handling

  // Update an existing site
  async updateSite(siteId: string, siteData: Partial<Site>): Promise<Site> {
    const response = await this.makeAuthenticatedRequest(`/v3/sites/${encodeURIComponent(siteId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(siteData)
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update site: ${response.status} ${response.statusText} - ${errorText}`);
    }
    return await response.json();
  }

  // Delete a site
  async deleteSite(siteId: string): Promise<void> {
    const response = await this.makeAuthenticatedRequest(`/v3/sites/${encodeURIComponent(siteId)}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete site: ${response.status} ${response.statusText} - ${errorText}`);
    }
  }

  // Get access points filtered by site
  async getAccessPointsBySite(siteId?: string): Promise<AccessPoint[]> {
    if (!siteId) {
      return this.getAccessPoints();
    }

    return this.makeRequestWithRetry(async () => {
      // First try to get all APs and filter client-side
      const allAPs = await this.getAccessPoints();
      
      console.log(`Filtering ${allAPs.length} access points for site: ${siteId}`);
      
      // Filter APs by site/location - check various possible field names
      const filteredAPs = allAPs.filter(ap => {
        // Check all possible site/location identification fields
        // Prioritize hostSite first as it contains the actual location like "LAB Remote Site"
        const locationFields = [
          ap.hostSite,
          ap.location,
          ap.locationName,
          ap.apLocation,
          ap.ap_location,
          ap.site,
          ap.siteId, 
          ap.siteName,
          ap.site_name,
          ap.campus,
          ap.building,
          ap.place,
          ap.area,
          ap.zone,
          ap.siteName || ap.name
        ];
        
        // Try to match any of the location/site fields with the provided siteId
        const matches = locationFields.some(field => {
          if (!field) return false;
          const fieldStr = String(field).trim();
          const siteIdStr = String(siteId).trim();
          return fieldStr === siteIdStr || fieldStr.toLowerCase() === siteIdStr.toLowerCase();
        });
        
        if (matches) {
          console.log(`AP ${ap.serialNumber} matches site ${siteId}:`, {
            hostSite: ap.hostSite,
            location: ap.location,
            locationName: ap.locationName,
            site: ap.site,
            siteId: ap.siteId,
            siteName: ap.siteName
          });
        }
        
        return matches;
      });
      
      console.log(`Found ${filteredAPs.length} access points for site ${siteId}`);
      
      // If no APs found with site filtering, log the available location/site values for debugging
      if (filteredAPs.length === 0 && allAPs.length > 0) {
        console.log('No APs found for site. Available location/site values in APs:');
        allAPs.slice(0, 5).forEach(ap => {
          console.log(`AP ${ap.serialNumber}:`, {
            hostSite: ap.hostSite,
            location: ap.location,
            locationName: ap.locationName,
            site: ap.site,
            siteId: ap.siteId, 
            siteName: ap.siteName,
            campus: ap.campus,
            building: ap.building,
            allLocationFields: Object.keys(ap).filter(key => 
              key.toLowerCase().includes('site') || 
              key.toLowerCase().includes('location') ||
              key.toLowerCase().includes('campus') ||
              key.toLowerCase().includes('building') ||
              key.toLowerCase().includes('place') ||
              key.toLowerCase().includes('area') ||
              key.toLowerCase().includes('zone') ||
              key.toLowerCase().includes('host')
            ).map(key => `${key}: ${ap[key]}`)
          });
        });
      }
      
      return filteredAPs;
    });
  }

  async reauthenticateStation(macAddress: string): Promise<void> {
    const response = await this.makeAuthenticatedRequest(`/v1/stations/${encodeURIComponent(macAddress)}/reauthenticate`, {
      method: 'POST'
    });
    if (!response.ok) {
      throw new Error(`Failed to reauthenticate station: ${response.status} ${response.statusText}`);
    }
  }

  // Note: getServices() method is defined earlier in the file with better error handling

  async getServiceById(serviceId: string): Promise<Service> {
    const response = await this.makeAuthenticatedRequest(`/v1/services/${encodeURIComponent(serviceId)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch service: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  }

  async updateService(serviceId: string, serviceData: Partial<Service>): Promise<Service> {
    const response = await this.makeAuthenticatedRequest(`/v1/services/${encodeURIComponent(serviceId)}`, {
      method: 'PUT',
      body: JSON.stringify(serviceData)
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to update service: ${response.status} ${response.statusText}`;
      let errorDetails = '';
      let fullErrorResponse = '';
      
      try {
        const errorResponse = await response.text();
        fullErrorResponse = errorResponse;
        
        // Try to parse structured error response
        if (errorResponse) {
          try {
            const errorData = JSON.parse(errorResponse);
            
            if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
              const firstError = errorData.errors[0];
              errorMessage = firstError.errorMessage || firstError.message || errorMessage;
              errorDetails = firstError.details || firstError.resource || firstError.field || '';
              
              // Log all error details for debugging
              console.error('Detailed error info:', {
                errorMessage: firstError.errorMessage,
                message: firstError.message,
                details: firstError.details,
                resource: firstError.resource,
                field: firstError.field,
                code: firstError.code,
                fullError: firstError
              });
            } else if (errorData.message) {
              errorMessage = errorData.message;
            } else if (errorData.error) {
              errorMessage = typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
            }
            
            // Include any validation errors
            if (errorData.validationErrors) {
              errorDetails += ` Validation errors: ${JSON.stringify(errorData.validationErrors)}`;
            }
            
          } catch (parseError) {
            console.error('Failed to parse error response as JSON:', parseError);
            // If parsing fails, use the raw error text if it's reasonable length
            if (errorResponse.length > 0 && errorResponse.length < 1000) {
              errorDetails = errorResponse;
            }
          }
        }
        
        // Add specific guidance for different error codes
        if (response.status === 422) {
          errorMessage += ' - Validation failed';
          if (errorDetails) {
            errorMessage += `: ${errorDetails}`;
          } else if (fullErrorResponse) {
            errorMessage += `. Server response: ${fullErrorResponse.substring(0, 200)}${fullErrorResponse.length > 200 ? '...' : ''}`;
          } else {
            errorMessage += '. Check that all field values are valid and within acceptable ranges.';
          }
        } else if (response.status === 400) {
          errorMessage += ' - Bad request. Check the request format and required fields.';
        } else if (response.status === 403) {
          errorMessage += ' - Access denied. You may not have permission to update this service.';
        } else if (response.status === 404) {
          errorMessage += ' - Service not found. The service may have been deleted.';
        }
        
      } catch (textError) {
        console.error('Error reading response text:', textError);
        errorMessage += ` (Unable to read error details: ${textError.message})`;
      }
      
      throw new Error(errorMessage);
    }
    
    const result = await response.json();
    console.log('Service updated successfully:', result);
    return result;
  }

  async createService(serviceData: Partial<Service>): Promise<Service> {
    console.log('Creating service:', serviceData);
    
    const response = await this.makeAuthenticatedRequest('/v1/services', {
      method: 'POST',
      body: JSON.stringify(serviceData)
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to create service: ${response.status} ${response.statusText}`;
      
      try {
        const errorResponse = await response.text();
        
        if (errorResponse) {
          try {
            const errorData = JSON.parse(errorResponse);
            
            if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
              const firstError = errorData.errors[0];
              errorMessage = firstError.errorMessage || firstError.message || errorMessage;
              
              console.error('Detailed error info:', firstError);
            } else if (errorData.message) {
              errorMessage = errorData.message;
            }
          } catch (parseError) {
            console.error('Failed to parse error response:', parseError);
          }
        }
        
        if (response.status === 422) {
          errorMessage += ' - Validation failed. Check that all required fields are provided.';
        } else if (response.status === 400) {
          errorMessage += ' - Bad request. Check the request format and required fields.';
        } else if (response.status === 403) {
          errorMessage += ' - Access denied. You may not have permission to create services.';
        }
        
      } catch (textError) {
        console.error('Error reading response text:', textError);
      }
      
      throw new Error(errorMessage);
    }
    
    const result = await response.json();
    console.log('Service created successfully:', result);
    return result;
  }

  async deleteService(serviceId: string): Promise<void> {
    console.log('Deleting service:', serviceId);
    
    const response = await this.makeAuthenticatedRequest(`/v1/services/${encodeURIComponent(serviceId)}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`Failed to delete service: ${response.status} ${response.statusText}`);
    }
    
    console.log('Service deleted successfully');
  }

  async getServiceStations(serviceId: string): Promise<Station[]> {
    const response = await this.makeAuthenticatedRequest(`/v1/services/${encodeURIComponent(serviceId)}/stations`);
    if (!response.ok) {
      throw new Error(`Failed to fetch service stations: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  // Sites API methods
  async createSite(siteData: {
    siteName: string;
    country: string;
    timezone: string;
    description?: string;
  }): Promise<Site> {
    console.log('Creating site:', {
      url: `${BASE_URL}/v3/sites`,
      payload: siteData
    });
    
    const response = await this.makeAuthenticatedRequest('/v3/sites', {
      method: 'POST',
      body: JSON.stringify(siteData)
    });
    
    console.log('Site creation response:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to create site: ${response.status} ${response.statusText}`;
      let errorDetails = '';
      let fullErrorResponse = '';
      
      try {
        const errorResponse = await response.text();
        fullErrorResponse = errorResponse;
        console.error('Full site creation error response:', {
          status: response.status,
          statusText: response.statusText,
          responseText: errorResponse,
          responseLength: errorResponse.length
        });
        
        // Try to parse structured error response
        if (errorResponse) {
          try {
            const errorData = JSON.parse(errorResponse);
            console.error('Parsed error data:', errorData);
            
            if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
              const firstError = errorData.errors[0];
              errorMessage = firstError.errorMessage || firstError.message || errorMessage;
              errorDetails = firstError.details || firstError.resource || firstError.field || '';
              
              // Log all error details for debugging
              console.error('Detailed error info:', {
                errorMessage: firstError.errorMessage,
                message: firstError.message,
                details: firstError.details,
                resource: firstError.resource,
                field: firstError.field,
                code: firstError.code,
                fullError: firstError
              });
            } else if (errorData.message) {
              errorMessage = errorData.message;
            } else if (errorData.error) {
              errorMessage = typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
            }
            
            // Include any validation errors
            if (errorData.validationErrors) {
              errorDetails += ` Validation errors: ${JSON.stringify(errorData.validationErrors)}`;
            }
            
          } catch (parseError) {
            console.error('Failed to parse error response as JSON:', parseError);
            // If parsing fails, use the raw error text if it's reasonable length
            if (errorResponse.length > 0 && errorResponse.length < 1000) {
              errorDetails = errorResponse;
            }
          }
        }
        
        // Add specific guidance for different error codes
        if (response.status === 422) {
          errorMessage += ' - Validation failed';
          if (errorDetails) {
            errorMessage += `: ${errorDetails}`;
          } else if (fullErrorResponse) {
            errorMessage += `. Server response: ${fullErrorResponse.substring(0, 200)}${fullErrorResponse.length > 200 ? '...' : ''}`;
          } else {
            errorMessage += '. Check that all field values are valid and within acceptable ranges.';
          }
        } else if (response.status === 400) {
          errorMessage += ' - Bad request. Check the request format and required fields.';
        } else if (response.status === 403) {
          errorMessage += ' - Access denied. You may not have permission to create sites.';
        } else if (response.status === 409) {
          errorMessage += ' - Conflict. A site with this name may already exist.';
        }
        
      } catch (textError) {
        console.error('Error reading response text:', textError);
        errorMessage += ` (Unable to read error details: ${textError.message})`;
      }
      
      throw new Error(errorMessage);
    }
    
    const result = await response.json();
    console.log('Site created successfully:', result);
    return result;
  }

  // Roles API methods (getRoles is defined earlier at line ~955)
  
  async getRoleById(roleId: string): Promise<Role> {
    const response = await this.makeAuthenticatedRequest(`/v3/roles/${encodeURIComponent(roleId)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch role: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  }

  async createRole(roleData: Partial<Role>): Promise<Role> {
    const response = await this.makeAuthenticatedRequest('/v3/roles', {
      method: 'POST',
      body: JSON.stringify(roleData)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Create role error:', errorText);
      throw new Error(`Failed to create role: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  }

  async updateRole(roleId: string, roleData: Partial<Role>): Promise<Role> {
    const response = await this.makeAuthenticatedRequest(`/v3/roles/${encodeURIComponent(roleId)}`, {
      method: 'PUT',
      body: JSON.stringify(roleData)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Update role error:', errorText);
      throw new Error(`Failed to update role: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  }

  async deleteRole(roleId: string): Promise<void> {
    const response = await this.makeAuthenticatedRequest(`/v3/roles/${encodeURIComponent(roleId)}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Delete role error:', errorText);
      throw new Error(`Failed to delete role: ${response.status} ${response.statusText}`);
    }
  }

  // Get default role template for creating new roles
  async getRoleDefaultTemplate(): Promise<Role> {
    const response = await this.makeAuthenticatedRequest('/v3/roles/default');
    if (!response.ok) {
      throw new Error(`Failed to fetch role template: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  }

  // Get Class of Service (CoS) options
  async getClassOfService(): Promise<ClassOfService[]> {
    try {
      const response = await this.makeAuthenticatedRequest('/v3/cos', {}, 8000);
      
      if (!response.ok) {
        console.warn(`Failed to fetch CoS: ${response.status} ${response.statusText}`);
        return [];
      }
      
      const data = await response.json();
      
      if (Array.isArray(data)) {
        console.log(`✓ Successfully loaded ${data.length} Class of Service options`);
        return data;
      } else {
        console.warn('CoS response is not an array:', data);
        return [];
      }
    } catch (error) {
      console.error('Error fetching CoS:', error);
      return [];
    }
  }

  // Get Topologies (VLANs) options
  async getTopologies(): Promise<Topology[]> {
    try {
      const response = await this.makeAuthenticatedRequest('/v3/topologies', {}, 8000);
      
      if (!response.ok) {
        console.warn(`Failed to fetch topologies: ${response.status} ${response.statusText}`);
        return [];
      }
      
      const data = await response.json();
      
      if (Array.isArray(data)) {
        console.log(`✓ Successfully loaded ${data.length} topology/VLAN options`);
        return data;
      } else {
        console.warn('Topologies response is not an array:', data);
        return [];
      }
    } catch (error) {
      console.error('Error fetching topologies:', error);
      return [];
    }
  }

  // Get various statistics
  async getSiteStats(): Promise<SiteStats> {
    const response = await this.makeAuthenticatedRequest('/v1/sites/stats');
    if (!response.ok) {
      throw new Error(`Failed to fetch site stats: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  }

  // Get AAA Policies (RADIUS configurations)
  async getAaaPolicies(): Promise<AaaPolicy[]> {
    try {
      const response = await this.makeAuthenticatedRequest('/v1/aaa-policies', {}, 8000);
      if (!response.ok) {
        console.warn(`AAA Policies API returned status ${response.status}`);
        return [];
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn('Failed to fetch AAA policies:', error);
      return [];
    }
  }

  // Check if an endpoint is available (returns true if endpoint exists and is reachable)
  async checkEndpointAvailability(endpoint: string): Promise<boolean> {
    try {
      // Use HEAD request to check availability without downloading data
      const response = await this.makeAuthenticatedRequest(endpoint, {
        method: 'HEAD'
      }, 3000); // Short timeout for availability check
      
      return response.ok || response.status === 405; // 405 = Method Not Allowed but endpoint exists
    } catch (error) {
      return false;
    }
  }

  // Safe API call that checks availability first
  async safeMakeRequest<T>(
    endpoint: string, 
    options: RequestInit = {},
    fallback: T,
    checkAvailability: boolean = false
  ): Promise<T> {
    try {
      if (checkAvailability && !(await this.checkEndpointAvailability(endpoint))) {
        console.log(`Endpoint ${endpoint} not available, using fallback`);
        return fallback;
      }
      
      const response = await this.makeAuthenticatedRequest(endpoint, options);
      if (!response.ok) {
        console.warn(`API call to ${endpoint} failed with status ${response.status}, using fallback`);
        return fallback;
      }
      
      return await response.json();
    } catch (error) {
      console.log(`API call to ${endpoint} failed, using fallback:`, error instanceof Error ? error.message : 'Unknown error');
      return fallback;
    }
  }
}

export const apiService = new ApiService();