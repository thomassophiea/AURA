/**
 * Typed client for AURA's energy API (`/api/energy/*`). Reuses the monitoring
 * auth headers (controller token + X-Controller-URL) and resolves the global
 * time-range token to concrete start/end instants, exactly like the monitoring
 * history client, so responses are scoped to the controller in view.
 */

import { buildMonitoringHeaders } from './monitoringHistory';
import { resolveTimeRange } from '../lib/timeRange';
import type {
  EnergyOverview,
  EnergySite,
  EnergyAp,
  EnergyRecommendation,
  EnergyScenarioPolicy,
  EnergyScenarioResult,
  EnergyPreferences,
  EnvironmentalReportSummary,
  LightAwareSummary,
  LightAwareApRow,
  LightAwarePolicy,
  LightAwareObserved,
} from '../types/energy';

const BASE = '/api/energy';

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === 'all') continue;
    search.set(key, value);
  }
  const q = search.toString();
  return q ? `?${q}` : '';
}

function windowParams(timeRange: string): { start: string; end: string } {
  const { startIso, endIso } = resolveTimeRange(timeRange);
  return { start: startIso, end: endIso };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...buildMonitoringHeaders(), ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) detail = body.error;
    } catch {
      // non-JSON error body; keep the status-based message
    }
    throw new Error(`Energy request failed: ${detail}`);
  }
  return (await response.json()) as T;
}

export function getEnergyOverview(
  params: { site: string; timeRange: string },
  signal?: AbortSignal
): Promise<EnergyOverview> {
  const { start, end } = windowParams(params.timeRange);
  return request<EnergyOverview>(
    `/overview${buildQuery({ start, end, siteId: params.site })}`,
    { signal }
  );
}

export function getEnergySites(
  params: { timeRange: string },
  signal?: AbortSignal
): Promise<{ sites: EnergySite[] }> {
  const { start, end } = windowParams(params.timeRange);
  return request<{ sites: EnergySite[] }>(`/sites${buildQuery({ start, end })}`, { signal });
}

export function getEnergyAps(
  params: { site: string; timeRange: string },
  signal?: AbortSignal
): Promise<{ aps: EnergyAp[] }> {
  const { start, end } = windowParams(params.timeRange);
  return request<{ aps: EnergyAp[] }>(
    `/aps${buildQuery({ start, end, siteId: params.site })}`,
    { signal }
  );
}

export function getEnergyRecommendations(
  params: { site: string; timeRange: string },
  signal?: AbortSignal
): Promise<{ recommendations: EnergyRecommendation[] }> {
  const { start, end } = windowParams(params.timeRange);
  return request<{ recommendations: EnergyRecommendation[] }>(
    `/recommendations${buildQuery({ start, end, siteId: params.site })}`,
    { signal }
  );
}

export function postEnergyScenario(
  body: { name: string; policy: EnergyScenarioPolicy; siteId?: string },
  signal?: AbortSignal
): Promise<EnergyScenarioResult> {
  return request<EnergyScenarioResult>('/scenarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

export function getEnergyPreferences(signal?: AbortSignal): Promise<EnergyPreferences> {
  return request<EnergyPreferences>('/preferences', { signal });
}

export function putEnergyPreferences(
  body: { currencyCode: string; ratePerKwh: number },
  signal?: AbortSignal
): Promise<EnergyPreferences> {
  return request<EnergyPreferences>('/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

export function getEnvironmentalReport(
  filters: { site: string; timeRange: string },
  signal?: AbortSignal
): Promise<EnvironmentalReportSummary> {
  const { start, end } = windowParams(filters.timeRange);
  return request<EnvironmentalReportSummary>(
    `/report${buildQuery({ start, end, siteId: filters.site })}`,
    { signal }
  );
}

export async function downloadEnvironmentalReportPdf(
  report: EnvironmentalReportSummary
): Promise<void> {
  const [jsPDFModule, autoTableModule] = await Promise.all([
    import('jspdf') as Promise<typeof import('jspdf')>,
    import('jspdf-autotable') as Promise<typeof import('jspdf-autotable')>,
  ]);

  const { default: jsPDF } = jsPDFModule;
  const { default: autoTable } = autoTableModule;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const generatedAt = new Date(report.generatedAt ?? Date.now()).toISOString().slice(0, 19).replace('T', ' ');
  const filename = `AURA_Environmental_Report_${new Date(report.generatedAt ?? Date.now())
    .toISOString()
    .slice(0, 19)
    .replace(/:/g, '-')}.pdf`;

  doc.setFillColor(30, 30, 46);
  doc.rect(0, 0, 210, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('AURA Environmental Report', 14, 18);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${generatedAt}`, 14, 26);
  doc.text(`Scope: ${report.scopeLabel}`, 14, 31);
  doc.setTextColor(0, 0, 0);

  let y = 44;
  doc.setFillColor(106, 90, 205);
  doc.rect(14, y, 182, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Environmental performance summary', 17, y + 5.5);
  doc.setTextColor(0, 0, 0);
  y += 16;

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Reporting window', `${report.windowStart.slice(0, 10)} to ${report.windowEnd.slice(0, 10)}`],
      ['Annualized energy', `${report.annualKwhProjected ?? 0} kWh/yr`],
      ['Annual cost', `${report.currencySymbol}${(report.annualCost ?? 0).toFixed(2)}`],
      ['APs reporting', String(report.apWithDataCount)],
      ['Projected savings', `${report.projectedSavingsKwh.toFixed(1)} kWh`],
      ['Data window', `${report.dataWindowDays ?? 0} days`],
    ],
    headStyles: { fillColor: [106, 90, 205], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Important note', 14, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  const noteLines = [
    'This report provides evidence of measured electrical performance from AP telemetry and',
    'is aligned with ISO 14001 environmental management concepts. It is not a certification,',
    'nor does it determine ISO conformity or conformance status.',
  ];
  noteLines.forEach((line) => {
    doc.text(line, 14, y);
    y += 6;
  });

  doc.save(filename);
}

export function getLightAwareSummary(
  filters: { site: string; timeRange: string },
  signal?: AbortSignal
): Promise<LightAwareSummary> {
  const { start, end } = windowParams(filters.timeRange);
  return request<LightAwareSummary>(
    `/light-aware/summary${buildQuery({ siteId: filters.site, start, end })}`,
    { signal }
  );
}

export function getLightAwareAps(
  filters: { site: string; timeRange: string },
  signal?: AbortSignal
): Promise<{ aps: LightAwareApRow[] }> {
  const { start, end } = windowParams(filters.timeRange);
  return request<{ aps: LightAwareApRow[] }>(
    `/light-aware/aps${buildQuery({ siteId: filters.site, start, end })}`,
    { signal }
  );
}

export function getLightAwarePolicy(
  filters: { site: string },
  signal?: AbortSignal
): Promise<LightAwarePolicy> {
  return request<LightAwarePolicy>(
    `/light-aware/policy${buildQuery({ siteId: filters.site })}`,
    { signal }
  );
}

export function putLightAwarePolicy(body: {
  enabled: boolean;
  policy: LightAwarePolicy['policy'];
  siteId?: string;
}): Promise<LightAwarePolicy> {
  return request<LightAwarePolicy>('/light-aware/policy', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function getLightAwareObserved(
  filters: { site: string; timeRange: string },
  signal?: AbortSignal
): Promise<LightAwareObserved> {
  const { start, end } = windowParams(filters.timeRange);
  return request<LightAwareObserved>(
    `/light-aware/observed${buildQuery({ siteId: filters.site, start, end })}`,
    { signal }
  );
}
