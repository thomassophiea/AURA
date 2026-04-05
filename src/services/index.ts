/**
 * Services Index - Centralized service exports
 * 
 * Architecture: Domain-driven service layer extracted from api.ts monolith
 * 
 * Services:
 * - authService: Authentication, login/logout, session management (SSO-ready)
 * - siteService: Network site/location management
 * - apService: Access Point management, firmware, configuration
 * - clientService: Wireless client management, blocking, allow/deny lists
 * - analyticsService: Real-time metrics, dashboards, SLE metrics
 * - configService: Network configuration, profiles, policies
 * - monitoringService: Alarms, events, logs, subscriptions
 * 
 * Migration Path:
 * 1. Phase 3: Create service skeletons (✓ done)
 * 2. Phase 4: Extract actual implementations from api.ts
 * 3. Phase 5: Replace api.ts calls with service-specific calls
 * 4. Phase 6: Retire monolithic api.ts
 * 
 * SSO Integration (Future):
 * Replace authService.login() with SSO provider integration
 * All other services remain unchanged - authentication handled transparently
 */

export { authService, type AuthResponse } from './authService';
export { siteService, type Site } from './siteService';
export { apService, type AccessPoint } from './apService';
export { clientService, type WirelessClient } from './clientService';
export { analyticsService, type DashboardMetrics, type SLEMetrics } from './analyticsService';
export { configService, type NetworkProfile } from './configService';
export { monitoringService, type Alarm, type Event } from './monitoringService';

// Re-export the monolithic api for gradual migration
// This will be removed once all services are fully extracted
export { apiService } from './api';
