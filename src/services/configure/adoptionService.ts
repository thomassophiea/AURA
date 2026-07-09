/**
 * AP adoption / registration settings (`/v1/aps/registration`, singleton
 * GET/PUT) — the REAL endpoint behind Adoption Rules. Replaces the four
 * speculative adoption-rules paths in api.ts (~5901) that 404 on every
 * modern controller; those are kept only until ConfigureAdoptionRules.tsx is
 * rewired in a later phase.
 */
import { createSingletonClient } from './resourceClient';
import type { ApRegistrationSettings } from '../../types/configure';

export const adoptionService = createSingletonClient<ApRegistrationSettings>({
  resource: 'aps-registration',
  path: '/v1/aps/registration',
});
