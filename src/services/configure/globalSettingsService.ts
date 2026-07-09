/**
 * Global settings (`/v1/globalsettings`, singleton). api.ts only ever had a
 * GET (getGlobalSettings); this adds the missing PUT.
 */
import { createSingletonClient } from './resourceClient';
import type { GlobalSettings } from '../../types/configure';

export const globalSettingsService = createSingletonClient<GlobalSettings>({
  resource: 'globalsettings',
  path: '/v1/globalsettings',
});
