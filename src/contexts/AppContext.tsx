import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Organization, SiteGroup, Site, Device } from '../types/domain';
import { tenantService } from '../services/tenantService';
import { apiService } from '../services/api';

interface AppContextValue {
  organization: Organization | null;
  siteGroups: SiteGroup[];
  siteGroup: SiteGroup | null;
  site: Site | null;
  device: Device | null;
  isLoadingOrg: boolean;
  setActiveSiteGroup: (siteGroup: SiteGroup | null) => void;
  setActiveSite: (site: Site | null) => void;
  setActiveDevice: (device: Device | null) => void;
  refreshSiteGroups: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppContextProvider({ children }: { children: React.ReactNode }) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [siteGroups, setSiteGroups] = useState<SiteGroup[]>([]);
  const [activeSiteGroup, setActiveSiteGroupState] = useState<SiteGroup | null>(null);
  const [activeSite, setActiveSiteState] = useState<Site | null>(null);
  const [activeDevice, setActiveDeviceState] = useState<Device | null>(null);
  const [isLoadingOrg, setIsLoadingOrg] = useState(true);

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

  return (
    <AppContext.Provider value={{
      organization,
      siteGroups,
      siteGroup: activeSiteGroup,
      site: activeSite,
      device: activeDevice,
      isLoadingOrg,
      setActiveSiteGroup,
      setActiveSite,
      setActiveDevice,
      refreshSiteGroups,
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
