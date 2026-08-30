import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Leaf } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  createEnvironmentalReport,
  getLatestEnvironmentalReport,
} from '@/services/energyService';
import { downloadEnvironmentalReportPdf } from '@/services/environmentalReportPdf';
import { formatCurrency, formatKwh } from '@/lib/energyCalc';
import type {
  EnergyOverview,
  EnergyPreferences,
  EnergyRecommendation,
  EnvironmentalReport,
} from '@/types/energy';

interface EnvironmentalReportCardProps {
  overview: EnergyOverview | null;
  recommendations: EnergyRecommendation[] | null;
  preferences: EnergyPreferences | null;
  siteId: string;
  siteName: string;
  range: {
    startIso: string;
    endIso: string;
    label: string;
  };
  onConfigureCarbon: () => void;
}

type PeriodChoice = 'current' | '7d' | '30d' | 'custom';

function evidenceLabel(hasRecommendations: boolean): string {
  return hasRecommendations ? 'Partially Measured' : 'Measured';
}

function dateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

export function EnvironmentalReportCard({
  overview,
  recommendations,
  preferences,
  siteId,
  siteName,
  range,
  onConfigureCarbon,
}: EnvironmentalReportCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [latest, setLatest] = useState<EnvironmentalReport | null>(null);
  const [periodChoice, setPeriodChoice] = useState<PeriodChoice>('current');
  const [customStart, setCustomStart] = useState(dateInputValue(range.startIso));
  const [customEnd, setCustomEnd] = useState(dateInputValue(range.endIso));
  const [includeFinancials, setIncludeFinancials] = useState(true);
  const [includeCarbon, setIncludeCarbon] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableRecommendations = useMemo(() => recommendations ?? [], [recommendations]);
  const hasRecommendations = availableRecommendations.length > 0;
  const carbonConfigured = Boolean(
    preferences?.emissionsFactorKgPerKwh && preferences.emissionsFactorSource
  );
  const annualSavingsKwh = useMemo(
    () =>
      availableRecommendations.reduce(
        (largest, recommendation) =>
          Math.max(largest, recommendation.annualSavingsKwh ?? 0),
        0
      ),
    [availableRecommendations]
  );
  const annualFinancialSavings = useMemo(
    () =>
      availableRecommendations.reduce(
        (largest, recommendation) =>
          Math.max(largest, recommendation.estimatedAnnualSaving ?? 0),
        0
      ),
    [availableRecommendations]
  );

  useEffect(() => {
    const controller = new AbortController();
    getLatestEnvironmentalReport(siteId === 'all' ? undefined : siteId, controller.signal)
      .then(setLatest)
      .catch(() => setLatest(null));
    return () => controller.abort();
  }, [siteId]);

  useEffect(() => {
    setSelectedTypes(availableRecommendations.map((recommendation) => recommendation.type));
  }, [availableRecommendations]);

  function resolvePeriod(): { windowStart: string; windowEnd: string } | null {
    if (periodChoice === 'current') {
      return { windowStart: range.startIso, windowEnd: range.endIso };
    }
    if (periodChoice === 'custom') {
      const start = new Date(`${customStart}T00:00:00`);
      const end = new Date(`${customEnd}T00:00:00`);
      end.setDate(end.getDate() + 1);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) return null;
      return { windowStart: start.toISOString(), windowEnd: end.toISOString() };
    }
    const end = new Date(range.endIso);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (periodChoice === '7d' ? 7 : 30));
    return { windowStart: start.toISOString(), windowEnd: end.toISOString() };
  }

  async function generateReport() {
    const period = resolvePeriod();
    if (!period) {
      setError('Choose a valid reporting period.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const report = await createEnvironmentalReport({
        siteId: siteId === 'all' ? undefined : siteId,
        siteName: siteId === 'all' ? undefined : siteName,
        ...period,
        includeFinancials,
        includeCarbon: includeCarbon && carbonConfigured,
        recommendationTypes: selectedTypes,
      });
      setLatest(report);
      setDialogOpen(false);
      await downloadEnvironmentalReportPdf(report);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Report generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function viewLatest() {
    if (!latest) return;
    setError(null);
    try {
      await downloadEnvironmentalReportPdf(latest);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Report download failed');
    }
  }

  return (
    <>
      <Card className="gap-0">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Leaf className="h-4 w-4 text-[color:var(--status-success)]" aria-hidden />
              <h3 className="text-sm font-semibold text-foreground">Environmental Report</h3>
            </div>
            <Badge variant="outline">{evidenceLabel(hasRecommendations)}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            ISO 14001:2026-aligned energy performance evidence
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            <span className="font-medium text-foreground">{siteName}</span>
            <span className="text-muted-foreground"> · {range.label}</span>
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Projected annual savings</p>
              <p className="mt-1 font-semibold text-foreground">{formatKwh(annualSavingsKwh)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Projected cost savings</p>
              <p className="mt-1 font-semibold text-foreground">
                {formatCurrency(annualFinancialSavings, overview?.currencySymbol ?? '$')}
              </p>
            </div>
          </div>
          {latest ? (
            <p className="text-xs text-muted-foreground" title={latest.reportId}>
              Latest: {new Date(latest.generatedAt).toLocaleString()}
            </p>
          ) : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              disabled={!overview || overview.apWithDataCount === 0}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileText className="h-4 w-4" aria-hidden />
              Generate report
            </button>
            {latest ? (
              <button
                type="button"
                onClick={viewLatest}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                <Download className="h-4 w-4" aria-hidden />
                View latest
              </button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate Environmental Report</DialogTitle>
            <DialogDescription>
              Review the evidence scope and reporting options before creating the PDF.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 sm:grid-cols-2">
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Scope and baseline</h4>
              <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                <p className="font-medium text-foreground">{siteName}</p>
                <p className="text-xs text-muted-foreground">Current Energy selection</p>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">Reporting period</span>
                <select
                  value={periodChoice}
                  onChange={(event) => setPeriodChoice(event.target.value as PeriodChoice)}
                  className="h-9 w-full rounded-md border border-border bg-background px-3"
                >
                  <option value="current">Current dashboard period ({range.label})</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="custom">Custom range</option>
                </select>
              </label>
              {periodChoice === 'custom' ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-muted-foreground">
                    Start
                    <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-foreground" />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    End
                    <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-foreground" />
                  </label>
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Baseline: measured consumption in the selected period, annualized for comparison.
              </p>
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Optimization evidence</h4>
              {availableRecommendations.length > 0 ? (
                availableRecommendations.map((recommendation) => (
                  <label key={recommendation.type} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedTypes.includes(recommendation.type)}
                      onChange={(event) =>
                        setSelectedTypes((current) =>
                          event.target.checked
                            ? [...current, recommendation.type]
                            : current.filter((type) => type !== recommendation.type)
                        )
                      }
                    />
                    <span>
                      {recommendation.title}
                      <span className="block text-xs text-muted-foreground">Modeled · {recommendation.confidenceLevel} confidence</span>
                    </span>
                  </label>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No modeled opportunities are available for this context.</p>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeFinancials} onChange={(event) => setIncludeFinancials(event.target.checked)} />
                Include financial savings
              </label>
              <div className="flex items-start gap-2 text-sm">
                <input
                  aria-label="Include CO2e estimate"
                  type="checkbox"
                  checked={includeCarbon}
                  disabled={!carbonConfigured}
                  onChange={(event) => setIncludeCarbon(event.target.checked)}
                />
                <span>
                  Include CO2e estimate
                  {!carbonConfigured ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDialogOpen(false);
                        onConfigureCarbon();
                      }}
                      className="block text-left text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Configure a documented emissions factor in Electricity rate first.
                    </button>
                  ) : null}
                </span>
              </div>
            </section>
          </div>

          <p className="text-xs text-muted-foreground">
            This evidence may support an Environmental Management System. It is not ISO certification, an audit opinion, or a determination of conformity.
          </p>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <button type="button" onClick={() => setDialogOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground">Cancel</button>
            <button type="button" onClick={generateReport} disabled={generating} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {generating ? 'Generating…' : 'Generate PDF'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}