/**
 * Catalog of light-aware energy actions. Each declares the capability it needs
 * and its executability tier (spec §20). canExecute is false everywhere this
 * phase — actions are model + recommend only.
 */
export const ACTION_CATALOG = {
  reduceTxPower: { capabilityRequired: 'radioPowerControl', canModel: true, canRecommend: true, canExecute: false, label: 'Reduce Tx power' },
  reduceChains: { capabilityRequired: 'chainControl', canModel: true, canRecommend: true, canExecute: false, label: 'Reduce radio chains' },
  disableRadio: { capabilityRequired: 'radioEnableDisable', canModel: true, canRecommend: true, canExecute: false, label: 'Disable radio' },
  disableWlan: { capabilityRequired: 'wlanEnableDisable', canModel: true, canRecommend: true, canExecute: false, label: 'Disable WLAN' },
  lowPowerProfile: { capabilityRequired: 'energyProfileControl', canModel: true, canRecommend: true, canExecute: false, label: 'Apply low-power profile' },
};

export function isActionAllowed(action, capabilities = {}) {
  const def = ACTION_CATALOG[action?.kind];
  if (!def) return false;
  return !!capabilities[def.capabilityRequired];
}
