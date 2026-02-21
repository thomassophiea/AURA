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
  'workspace': () => import('../components/Workspace'),
  'service-levels': () => import('../components/ServiceLevelsEnhanced'),
  'sle-dashboard': () => import('../components/sle/SLEDashboard'),
  'app-insights': () => import('../components/AppInsights'),
  'connected-clients': () => import('../components/TrafficStatsConnectedClients'),
  'access-points': () => import('../components/AccessPoints'),
  'report-widgets': () => import('../components/ReportWidgets'),
  'configure-sites': () => import('../components/ConfigureSites'),
  'configure-networks': () => import('../components/ConfigureNetworks'),
  'configure-policy': () => import('../components/ConfigurePolicy'),
  'configure-aaa-policies': () => import('../components/ConfigureAAAPolicies'),
  'configure-guest': () => import('../components/ConfigureGuest'),
  'configure-advanced': () => import('../components/ConfigureAdvanced'),
  'tools': () => import('../components/Tools'),
  'administration': () => import('../components/Administration'),
  'help': () => import('../components/HelpPage'),
};

export function prefetchComponent(page: string) {
  const importFn = componentImports[page];
  if (importFn) {
    importFn();
  }
}
