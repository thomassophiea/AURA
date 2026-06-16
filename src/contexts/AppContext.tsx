import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Organization, SiteGroup, Site, Device } from '../types/domain';
import type { NavigationScope } from '../config/navigationScopes';
import type { GlobalElementType } from '../types/globalElements';
import type { ControllerIdentity } from '../types/controllerIdentity';
import { tenantService } from '../services/tenantService';
import { apiService } from '../services/api';

interface AppContextValue {
  organization: Organization | null;
  siteGroups: SiteGroup[];
  siteGroup: SiteGroup | null;
  site: Site | null;
  device: Device | null;
  /** Identity (hostname + Locking ID) of the active Site Group's controller. */
  activeControllerIdentity: ControllerIdentity | null;
  /** Re-fetch controller identity for a given Site Group (live /system/info). */
  refreshControllerIdentity: (siteGroup: SiteGroup) => Promise<void>;
  isLoadingOrg: boolean;
  navigationScope: NavigationScope;
  /** Org-level site group filter — null means "all site groups". */
  orgSiteGroupFilter: string | null;
  setOrgSiteGroupFilter: (sgId: string | null) => void;
  setActiveSiteGroup: (siteGroup: SiteGroup | null) => void;
  setActiveSite: (site: Site | null) => void;
  setActiveDevice: (device: Device | null) => void;
  refreshSiteGroups: () => Promise<void>;
  enterSiteGroup: (siteGroup: SiteGroup) => void;
  exitSiteGroup: () => void;
  /** Navigate to a page by its route key */
  navigateToPage: (page: string) => void;
  /** Navigate to Global Elements with template editor pre-opened for a given element type */
  navigateToTemplateCreation: (elementType: GlobalElementType) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

interface AppContextProviderProps {
  children: React.ReactNode;
  navigationScope: NavigationScope;
  onNavigationScopeChange: (scope: NavigationScope) => void;
  onPageChange?: (page: string) => void;
  onTemplateCreation?: (elementType: GlobalElementType) => void;
}

export function AppContextProvider({ children, navigationScope, onNavigationScopeChange, onPageChange, onTemplateCreation }: AppContextProviderProps) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [siteGroups, setSiteGroups] = useState<SiteGroup[]>([]);
  const [activeSiteGroup, setActiveSiteGroupState] = useState<SiteGroup | null>(null);
  const [activeSite, setActiveSiteState] = useState<Site | null>(null);
  const [activeDevice, setActiveDeviceState] = useState<Device | null>(null);
  const [isLoadingOrg, setIsLoadingOrg] = useState(true);
  const [orgSiteGroupFilter, setOrgSiteGroupFilter] = useState<string | null>(null);
  const [activeControllerIdentity, setActiveControllerIdentity] = useState<ControllerIdentity | null>(null);

  const loadOrgContext = useCallback(async () => {
    if (!apiService.isAuthenticated()) {
      setIsLoadingOrg(false);
      return;
    }
    setIsLoadingOrg(true);
    try {
      const org = tenantService.getCurrentOrganization();
      setOrganization(org);

      const groups = await tenantService.getSiteGroups();
      setSiteGroups(groups);

      // Auto-select the sole site group, or the default one
      const current = activeSiteGroup;
      if (!current) {
        const defaultGroup = groups.find(g => g.is_default) ?? (groups.length === 1 ? groups[0] : null);
        if (defaultGroup) {
          setActiveSiteGroupState(defaultGroup);
        }
      }
    } catch (err) {
      console.error('[AppContext] Failed to load org context:', err);
    } finally {
      setIsLoadingOrg(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadOrgContext();

    // Refresh when the user selects a different controller at login
    const handleControllerChanged = () => loadOrgContext();
    window.addEventListener('controllerChanged', handleControllerChanged);
    return () => window.removeEventListener('controllerChanged', handleControllerChanged);
  }, [loadOrgContext]);

  const setActiveSiteGroup = useCallback((siteGroup: SiteGroup | null) => {
    setActiveSiteGroupState(siteGroup);
    // Cascade: clear child selections when parent changes
    setActiveSiteState(null);
    setActiveDeviceState(null);
    // Route API calls to the selected site group's controller
    if (siteGroup) {
      apiService.setBaseUrl(`${siteGroup.controller_url}/management`);
    }
  }, []);

  const setActiveSite = useCallback((site: Site | null) => {
    setActiveSiteState(site);
    setActiveDeviceState(null);
  }, []);

  const setActiveDevice = useCallback((device: Device | null) => {
    setActiveDeviceState(device);
  }, []);

  const refreshSiteGroups = useCallback(async () => {
    const groups = await tenantService.getSiteGroups();
    setSiteGroups(groups);
  }, []);

  const refreshControllerIdentity = useCallback(async (sg: SiteGroup) => {
    if (!sg) return;
    const prev = apiService.getBaseUrl();
    apiService.setBaseUrl(`${sg.controller_url}/management`);
    try {
      const identity = await apiService.getControllerIdentity(sg.controller_url);
      setActiveControllerIdentity(identity);
      // Persist identity onto the controller record so the picker can show
      // hostname + Locking ID for every controller without a live fetch
      // (scales to hundreds). Only cache successful reads.
      if (identity.status === 'ok') {
        tenantService
          .updateController(sg.id, { hostname: identity.hostname, locking_id: identity.lockingId })
          .catch(() => {});
        setSiteGroups((groups) =>
          groups.map((g) =>
            g.id === sg.id
              ? { ...g, hostname: identity.hostname, locking_id: identity.lockingId }
              : g
          )
        );
      }
    } finally {
      // Restore prior base URL. '/api/management' is the proxy/default sentinel → null.
      apiService.setBaseUrl(prev === '/api/management' ? null : prev);
    }
  }, []);

  const enterSiteGroup = useCallback((sg: SiteGroup) => {
    setActiveSiteGroupState(sg);
    setActiveSiteState(null);
    setActiveDeviceState(null);
    if (sg) {
      apiService.setBaseUrl(`${sg.controller_url}/management`);
    }
    setActiveControllerIdentity(null); // clear stale identity before fetch
    void refreshControllerIdentity(sg);
    onNavigationScopeChange('site-group');
    onPageChange?.('system-backup');
  }, [onNavigationScopeChange, onPageChange, refreshControllerIdentity]);

  const exitSiteGroup = useCallback(() => {
    setActiveControllerIdentity(null);
    onNavigationScopeChange('global');
    onPageChange?.('workspace');
  }, [onNavigationScopeChange, onPageChange]);

  const navigateToPage = useCallback((page: string) => {
    onPageChange?.(page);
  }, [onPageChange]);

  const navigateToTemplateCreation = useCallback((elementType: GlobalElementType) => {
    onTemplateCreation?.(elementType);
  }, [onTemplateCreation]);

  return (
    <AppContext.Provider value={{
      organization,
      siteGroups,
      siteGroup: activeSiteGroup,
      site: activeSite,
      device: activeDevice,
      activeControllerIdentity,
      refreshControllerIdentity,
      isLoadingOrg,
      navigationScope,
      orgSiteGroupFilter,
      setOrgSiteGroupFilter,
      setActiveSiteGroup,
      setActiveSite,
      setActiveDevice,
      refreshSiteGroups,
      enterSiteGroup,
      exitSiteGroup,
      navigateToPage,
      navigateToTemplateCreation,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppContextProvider');
  return ctx;
}
