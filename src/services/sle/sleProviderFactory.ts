/**
 * SLE Provider Factory
 *
 * Maps a resolved `SLESiteContext` to the correct SLE data provider. Adding a
 * new source system is a one-line registration here plus a provider module.
 */

import type { SLESiteContext } from '../../types/sleContext';
import type { SLEProvider } from '../../types/slePageModel';
import { gatewaySleProvider } from './gatewaySleProvider';
import { xiqSleProvider } from './xiqSleProvider';

export function getSleProvider(context: SLESiteContext): SLEProvider {
  switch (context.source) {
    case 'xiq':
      return xiqSleProvider;
    case 'controller':
    default:
      return gatewaySleProvider;
  }
}
