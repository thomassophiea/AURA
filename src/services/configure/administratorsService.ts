/**
 * Controller administrators (`/v1/administrators`) — typed CRUD (new
 * resource, absent from api.ts). Administrator records are keyed by userId.
 */
import { createResourceClient } from './resourceClient';
import type { Administrator } from '../../types/configure';

const client = createResourceClient<Administrator>({
  resource: 'administrators',
  basePaths: ['/v1/administrators'],
  supportsDefault: false,
});

export const administratorsService = {
  list: client.list,
  /** `userId` is the record key (there is no separate id field). */
  get: (userId: string) => client.get(userId),
  create: client.create,
  update: (userId: string, payload: Partial<Administrator>) => client.update(userId, payload),
  remove: (userId: string) => client.remove(userId),
};
