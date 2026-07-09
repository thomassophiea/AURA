export function prefetchOnIdle(importFn: () => Promise<unknown>) {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => importFn());
  } else {
    setTimeout(() => importFn(), 200);
  }
}

export function prefetchOnHover(importFn: () => Promise<unknown>) {
  let prefetched = false;
  return () => {
    if (!prefetched) {
      prefetched = true;
      importFn();
    }
  };
}

const componentImports: Record<string, () => Promise<unknown>> = {
  workspace: () => import('../components/Workspace'),
  insights: () => import('../components/ServiceLevelsEnhanced'),
  'service-levels': () => import('../components/sle/SLEDashboard'),
  'app-insights': () => import('../components/AppInsights'),
  'connected-clients': () => import('../components/TrafficStatsConnectedClients'),
  'access-points': () => import('../components/AccessPoints'),
  'report-widgets': () => import('../components/ReportWidgets'),
  'configure-sites-groups': () => import('../components/SitesAndGroupsPage'),
  'configure-networks': () => import('../components/configure/networks'),
  'configure-profiles': () => import('../components/configure/profiles'),
  'configure-access-points': () => import('../components/configure/aps'),
  'configure-rrm': () => import('../components/configure/rf'),
  'configure-meshpoints': () => import('../components/configure/meshpoints'),
  'configure-policy': () => import('../components/configure/policy'),
  'configure-aaa-policies': () => import('../components/configure/aaa'),
  'configure-guest': () => import('../components/configure/guest'),
  'configure-service-profiles': () => import('../components/configure/serviceprofiles'),
  'configure-adoption-rules': () => import('../components/configure/adoption'),
  'configure-system': () => import('../components/configure/system'),
  tools: () => import('../components/Tools'),
  administration: () => import('../components/Administration'),
  help: () => import('../components/HelpPage'),
};

export function prefetchComponent(page: string) {
  const importFn = componentImports[page];
  if (importFn) {
    importFn();
  }
}
