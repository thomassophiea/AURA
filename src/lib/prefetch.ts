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

// Hover-prefetch map. Every import here MUST match what App.tsx renderPage()
// actually renders for the same view id — a mismatch prefetches a chunk that
// is never used and leaves the real one cold.
const componentImports: Record<string, () => Promise<unknown>> = {
  workspace: () => import('../components/ReportCenter'),
  insights: () => import('../components/DashboardEnhanced'),
  'service-levels': () => import('../components/sle/SLEDashboard'),
  'app-insights': () => import('../components/AppInsights'),
  'connected-clients': () => import('../components/ClientsPage'),
  'access-points': () => import('../components/AccessPoints'),
  'energy-optimization': () => import('../components/energy/EnergyOptimization'),
  'report-widgets': () => import('../components/ReportWidgets'),
  'event-alarm-dashboard': () => import('../components/EventAlarmDashboard'),
  'security-dashboard': () => import('../components/SecurityDashboard'),
  'audit-logs': () => import('../components/AuditLogs'),
  'config-history': () => import('../components/ConfigHistory'),
  'configure-catalog': () => import('../components/configure/catalog'),
  'configure-sites-groups': () => import('../components/SitesAndGroupsPage'),
  'configure-networks': () => import('../components/configure/networks'),
  'configure-profiles': () => import('../components/configure/profiles'),
  'configure-access-points': () => import('../components/configure/aps'),
  'configure-device-groups': () => import('../components/configure/devicegroups'),
  'configure-site-afc-geo': () => import('../components/configure/siteafc'),
  'configure-rrm': () => import('../components/configure/rf'),
  'configure-meshpoints': () => import('../components/configure/meshpoints'),
  'configure-policy': () => import('../components/configure/policy'),
  'configure-aaa-policies': () => import('../components/configure/aaa'),
  'configure-access-control': () => import('../components/configure/accesscontrol'),
  'configure-private-credentials': () => import('../components/configure/privateCredentials'),
  'configure-ppsk': () => import('../components/configure/privateCredentials'),
  'configure-private-sae': () => import('../components/configure/privateCredentials'),
  'configure-service-profiles': () => import('../components/configure/serviceprofiles'),
  'configure-adoption-rules': () => import('../components/configure/adoption'),
  'configure-system': () => import('../components/configure/system'),
  'configure-cloud-portal': () => import('../components/configure/cloudportal'),
  'diagnostics-system-health': () => import('../components/diagnostics'),
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
