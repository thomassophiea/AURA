/**
 * Services Index - Centralized service exports
 *
 * Domain-driven service layer extracted from api.ts. The monolithic apiService
 * is still re-exported here while individual domain services take over.
 */

export { authService, type AuthResponse } from './authService';
export { siteService, type Site } from './siteService';
export { apService, type AccessPoint } from './apService';
export { clientService, type WirelessClient } from './clientService';
export { configService, type NetworkProfile } from './configService';

export { apiService } from './api';
