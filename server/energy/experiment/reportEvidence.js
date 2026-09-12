/**
 * Bridge from a completed Treatment-vs-Control experiment to the environmental report.
 *
 * Kept out of environmentalReport.js so that module stays pure and testable
 * without a database, and out of the engine so report generation cannot alter
 * experiment state.
 */

import { listSources } from '../../monitoring/sourceRepository.js';
import { listExperiments, listDevices } from './experimentRepository.js';
import { summarize } from './experimentEngine.js';

/**
 * The most recent experiment on this source whose controller writes landed and
 * whose measurement window actually supports a claim. Returns null — never a
 * partial or a placeholder — when no such experiment exists.
 */
export async function loadExperimentEvidence({ sourceId, siteId = null }) {
  if (!sourceId) return null;
  const sources = await listSources({ enabledOnly: false });
  const source = sources.find((s) => s.id === sourceId);
  if (!source) return null;

  const experiments = await listExperiments(sourceId, 10);
  const candidate = experiments.find(
    (e) =>
      e.controller_writes_applied &&
      e.treatment_start &&
      // A site-scoped report only cites an experiment whose treatment site it
      // is actually about.
      (!siteId || e.treatment_site_id === siteId || e.control_site_id === siteId)
  );
  if (!candidate) return null;

  const summary = await summarize({ source, experiment: candidate });
  if (!summary.savings?.claimSupported) return null;

  const devices = await listDevices(candidate.id);

  return {
    experiment: {
      id: candidate.id,
      name: candidate.name,
      treatment: { siteId: candidate.treatment_site_id, siteName: candidate.treatment_site_name },
      control: { siteId: candidate.control_site_id, siteName: candidate.control_site_name },
      treatmentStart: candidate.treatment_start,
      treatmentEnd: candidate.treatment_end,
      triggerSource: candidate.trigger_source,
      controllerWritesApplied: candidate.controller_writes_applied,
    },
    savings: summary.savings,
    quality: summary.quality,
    baselineKwh: summary.baseline?.treatment?.kwh ?? null,
    treatmentApCount: devices.filter((d) => d.side === 'treatment').length,
  };
}
