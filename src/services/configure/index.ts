/**
 * Configure (EPB-125) service layer — thin typed wrappers per XCC resource,
 * all built on ./resourceClient (which rides apiService for auth/proxy/dedup).
 */
export * from './resourceClient';
export { servicesService } from './servicesService';
export { profilesService, cloneProfileForPlatform } from './profilesService';
export { rolesService } from './rolesService';
export { topologiesService } from './topologiesService';
export { vlanGroupsService } from './vlanGroupsService';
export { cosService } from './cosService';
export { rateLimitersService } from './rateLimitersService';
export { aaaPolicyService } from './aaaPolicyService';
export { eguestService } from './eguestService';
export { rfmgmtService } from './rfmgmtService';
export { meshpointsService } from './meshpointsService';
export { sitesService } from './sitesService';
export { iotProfileService } from './iotProfileService';
export { eslProfileService } from './eslProfileService';
export { rtlsProfileService } from './rtlsProfileService';
export { positioningService } from './positioningService';
export { analyticsService } from './analyticsService';
export { adspService } from './adspService';
export { administratorsService } from './administratorsService';
export { accessControlService } from './accessControlService';
export { snmpService } from './snmpService';
export { globalSettingsService } from './globalSettingsService';
export { adoptionService } from './adoptionService';
