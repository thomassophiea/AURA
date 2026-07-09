/** Station MAC access control (`/v1/accesscontrol`, singleton GET/PUT). */
import { createSingletonClient } from './resourceClient';
import type { AccessControlSettings } from '../../types/configure';

export const accessControlService = createSingletonClient<AccessControlSettings>({
  resource: 'accesscontrol',
  path: '/v1/accesscontrol',
});
