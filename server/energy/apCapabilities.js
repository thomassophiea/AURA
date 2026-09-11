/**
 * Single source of truth for AP hardware capabilities (spec §4). Sensor
 * eligibility derives from the AP MODEL, never from whether the AP currently
 * appears in the light feed. Unknown models default to no sensor / conservative
 * capabilities so adding a new Extreme model can never silently enable actions.
 *
 * SENSOR_MODELS: Extreme AP families whose hardware requirements specify an
 * onboard ambient light sensor (visible through the radome) that software can
 * read as an environmental signal. Substrings match model variants, so 'AP4020'
 * covers AP4020 / AP4020X / AP4020FX and 'AP4060' covers AP4060 / AP4060X.
 * Add new families here — the only edit needed to support them.
 */

const SENSOR_MODELS = ['AP4020', 'AP4060', 'AP5020', 'AP5022'];

/**
 * Models on which disabling a radio has been OBSERVED to work safely: the
 * radio actually leaves the air, and the AP stays in service.
 *
 * This is an allow-list, not a deny-list, and it is empty until a model has
 * been tested. An untested model is not assumed safe.
 *
 * Verified 2026-09-11 on XCC 10.20.1.0-020R:
 *   AP5020  — 6 GHz disable: txPower → 0, AP stays InService, draw −2.2 W.
 *   AP5022  — same radio layout and firmware; observed InService throughout.
 *
 * Deliberately NOT listed:
 *   AP4020X — accepted the disable, reported adminState=false while STILL
 *             transmitting at 17 dBm, then went `critical`, dropped to 0 W and
 *             left the network entirely. Restoring the configuration was
 *             verified but did not bring the AP back. Do not re-add without a
 *             firmware fix and a repeated test.
 */
const RADIO_DISABLE_VERIFIED_MODELS = ['AP5020', 'AP5022'];

const CAPABLE_DEFAULTS = {
  ambientLightSensor: false,
  radioPowerControl: false,
  radioEnableDisable: false,
  chainControl: false,
  wlanEnableDisable: false,
  energyProfileControl: false,
};

function normalize(model) {
  return typeof model === 'string' ? model.toUpperCase() : '';
}

export function supportsLightSensor(model) {
  const m = normalize(model);
  return SENSOR_MODELS.some((s) => m.includes(s));
}

/**
 * May this model's radios be administratively disabled as an energy action?
 * Unknown models answer `false`: an untested AP is not a safe AP.
 */
export function supportsVerifiedRadioDisable(model) {
  const m = normalize(model);
  if (!m) return false;
  // Substring matching would let 'AP4020X' match nothing here, which is the
  // intent — but it would also let a future 'AP5020-LITE' inherit the
  // verification. Prefix matching on the family is the closest honest rule.
  return RADIO_DISABLE_VERIFIED_MODELS.some((verified) => m.startsWith(verified));
}

export function capabilitiesForModel(model) {
  const m = normalize(model);
  const hasSensor = supportsLightSensor(model);
  // Wi-Fi 7 sensor-bearing models also expose the radio/WLAN/profile controls we
  // model against. Everything else stays at conservative defaults.
  if (hasSensor) {
    return {
      ambientLightSensor: true,
      radioPowerControl: true,
      radioEnableDisable: true,
      chainControl: true,
      wlanEnableDisable: true,
      energyProfileControl: true,
    };
  }
  // Tri-band non-sensor models still support radio enable/disable + Tx control.
  const triBand = ['AP4000', 'AP5010'].some((s) => m.includes(s));
  return {
    ...CAPABLE_DEFAULTS,
    radioPowerControl: triBand,
    radioEnableDisable: triBand,
  };
}
