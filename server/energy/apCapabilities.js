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

const SENSOR_MODELS = ['AP4020', 'AP4060', 'AP5020'];

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
