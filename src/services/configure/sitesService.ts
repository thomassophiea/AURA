/**
 * Sites (`/v3/sites`, `/v1/sites` fallback) — typed CRUD + /default seeder.
 * Mutations invalidate the apiService sites cache (key mirrors api.ts
 * getSites: `sites:<controller-url>`), so monitoring pages refetch.
 */
import { createResourceClient } from './resourceClient';
import { getDynamicControllerUrl } from '../api';
import type { SiteConfig } from '../../types/configure';

export const sitesService = createResourceClient<SiteConfig>({
  resource: 'sites',
  basePaths: ['/v3/sites', '/v1/sites'],
  invalidateCacheKeys: () => [`sites:${getDynamicControllerUrl() ?? 'default'}`],
});
