/** UI mirror of server/energy/apCapabilities.js. Keep SENSOR_MODELS in sync.
 *  Confirmed sensor families: AP4020/4020X/4020FX, AP4060/4060X, AP5020. */
const SENSOR_MODELS = ['AP4020', 'AP4060', 'AP5020'];

export function supportsLightSensor(model: string | undefined | null): boolean {
  if (!model) return false;
  const m = model.toUpperCase();
  return SENSOR_MODELS.some((s) => m.includes(s));
}
