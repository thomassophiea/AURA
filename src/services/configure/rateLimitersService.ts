/** Rate limiters (`/v1/ratelimiters`) — typed CRUD + /default seeder. */
import { createResourceClient } from './resourceClient';
import type { RateLimiter } from '../../types/configure';

export const rateLimitersService = createResourceClient<RateLimiter>({
  resource: 'ratelimiters',
  basePaths: ['/v1/ratelimiters'],
});
