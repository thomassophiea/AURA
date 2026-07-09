/**
 * Device (AP) profiles (`/v3/profiles`, `/v1/profiles` fallback) — typed CRUD.
 * No /default template: new profiles are seeded by cloning the predefined
 * profile for the target platform (platform-clone semantics).
 */
import { createResourceClient } from './resourceClient';
import type { ApProfile } from '../../types/configure';

export const profilesService = createResourceClient<ApProfile>({
  resource: 'profiles',
  basePaths: ['/v3/profiles', '/v1/profiles'],
  supportsDefault: false,
});

/** Seed a new profile by cloning the predefined profile of a platform. */
export async function cloneProfileForPlatform(
  apPlatform: string,
  name: string
): Promise<Partial<ApProfile> | null> {
  const all = await profilesService.list();
  const template = all.find((p) => p.predefined && p.apPlatform === apPlatform);
  if (!template) return null;
  const { id: _id, predefined: _predefined, ...rest } = template;
  return { ...rest, name };
}
