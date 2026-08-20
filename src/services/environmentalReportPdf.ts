import type { EnvironmentalReport } from '@/types/energy';

type JsPDFModule = typeof import('jspdf');
type AutoTableModule = typeof import('jspdf-autotable');
type JsPDFDocument = InstanceType<JsPDFModule['default']>;
type PdfWithTable = JsPDFDocument & { lastAutoTable: { finalY: number } };

const BRAND_PURPLE = [106, 90, 205] as [number, number, number];
const BRAND_DARK = [30, 30, 46] as [number, number, number];
const EVIDENCE_GREEN = [67, 128, 53] as [number, number, number];

function formatNumber(value: number | null, digits = 1): string {
  return value == null || !Number.isFinite(value) ? 'Not available' : value.toFixed(digits);
}

function statusLabel(status: EnvironmentalReport['evidenceStatus']): string {
  return status
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function addSectionHeader(doc: JsPDFDocument, title: string, y: number): number {
  doc.setFillColor(...BRAND_PURPLE);
  doc.rect(14, y, 182, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 17, y + 5.5);
  doc.setTextColor(0, 0, 0);
  return y + 12;
}

function pageBreak(doc: JsPDFDocument, y: number, needed: number): number {
  if (y + needed <= 274) return y;
  doc.addPage();
  return 18;
}

function addWrappedText(doc: JsPDFDocument, text: string, y: number): number {
  const lines = doc.splitTextToSize(text, 182) as string[];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(lines, 14, y);
  return y + lines.length * 4.5 + 4;
}

export async function createEnvironmentalReportPdf(
  report: EnvironmentalReport
): Promise<JsPDFDocument> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf') as Promise<JsPDFModule>,
    import('jspdf-autotable') as Promise<AutoTableModule>,
  ]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 0, 210, 42, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(report.title, 14, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(report.subtitle, 14, 24);
  doc.text(`Report ID: ${report.reportId}`, 14, 31);
  doc.text(`Generated: ${new Date(report.generatedAt).toISOString().replace('T', ' ').slice(0, 19)} UTC`, 14, 37);
  doc.setTextColor(0, 0, 0);

  let y = 50;
  autoTable(doc, {
    startY: y,
    head: [['Report context', 'Value']],
    body: [
      ['Scope', report.scope.label],
      ['Reporting period', `${report.reportingPeriod.start.slice(0, 10)} to ${report.reportingPeriod.end.slice(0, 10)}`],
      ['Evidence status', statusLabel(report.evidenceStatus)],
      ['AURA version', report.auraVersion],
    ],
    headStyles: { fillColor: BRAND_PURPLE, textColor: [255, 255, 255] },
    styles: { fontSize: 8.5 },
    margin: { left: 14, right: 14 },
  });
  y = (doc as PdfWithTable).lastAutoTable.finalY + 9;

  y = addSectionHeader(doc, 'Executive Environmental Performance Summary', y);
  const symbol = report.financials?.currencySymbol ?? '';
  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value', 'Evidence']],
    body: [
      ['AP telemetry coverage', `${report.baseline.reportingApCount} / ${report.baseline.totalApCount} (${formatNumber(report.baseline.coveragePercent)}%)`, 'Measured'],
      ['Total energy in period', `${formatNumber(report.baseline.measuredKwh, 2)} kWh`, 'Measured'],
      ['Average power per AP', `${formatNumber(report.baseline.averageWattsPerAp)} W`, 'Measured'],
      ['Annualized energy', `${formatNumber(report.baseline.annualKwhProjected)} kWh`, 'Projected'],
      ['Annual electricity cost', report.baseline.annualCostProjected == null ? 'Not included' : `${symbol}${formatNumber(report.baseline.annualCostProjected, 2)}`, 'Projected'],
      ['Projected annual energy avoided', `${formatNumber(report.improvement.annualSavingsKwh)} kWh`, 'Modeled'],
      ['Projected annual cost avoided', report.improvement.annualCostSavings == null ? 'Not included' : `${symbol}${formatNumber(report.improvement.annualCostSavings, 2)}`, 'Modeled'],
      ['Projected reduction', `${formatNumber(report.improvement.annualSavingsPercent)}%`, 'Modeled'],
      ['Projected CO2e avoided', report.carbon ? `${formatNumber(report.carbon.avoidedKgCo2e)} kg CO2e` : 'Not calculated', 'Modeled'],
    ],
    headStyles: { fillColor: EVIDENCE_GREEN, textColor: [255, 255, 255] },
    styles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
  });
  y = (doc as PdfWithTable).lastAutoTable.finalY + 9;

  y = pageBreak(doc, y, 38);
  y = addSectionHeader(doc, 'Environmental Aspect', y);
  y = addWrappedText(doc, report.environmentalAspect, y);
  y = addSectionHeader(doc, 'Environmental Objective', y);
  y = addWrappedText(doc, report.environmentalObjective, y);

  y = pageBreak(doc, y, 65);
  y = addSectionHeader(doc, 'Baseline Performance', y);
  autoTable(doc, {
    startY: y,
    body: [
      ['Measured energy', `${formatNumber(report.baseline.measuredKwh, 2)} kWh`],
      ['Current / peak draw', `${formatNumber(report.baseline.currentWatts)} W / ${formatNumber(report.baseline.peakWatts)} W`],
      ['Annualized energy', `${formatNumber(report.baseline.annualKwhProjected)} kWh`],
      ['Reporting APs', String(report.baseline.reportingApCount)],
      ['Total AP population', String(report.baseline.totalApCount)],
      ['Missing power telemetry', `${report.baseline.missingApCount} AP(s)`],
    ],
    styles: { fontSize: 8.5 },
    margin: { left: 14, right: 14 },
  });
  y = (doc as PdfWithTable).lastAutoTable.finalY + 9;

  y = pageBreak(doc, y, 55);
  y = addSectionHeader(doc, 'Savings Calculation Chain', y);
  autoTable(doc, {
    startY: y,
    head: [['Baseline annual energy', 'Optimized annual energy', 'Energy avoided', 'Reduction', 'Annual cost avoided']],
    body: [[
      `${formatNumber(report.improvement.baselineAnnualKwh)} kWh`,
      `${formatNumber(report.improvement.optimizedAnnualKwh)} kWh`,
      `${formatNumber(report.improvement.annualSavingsKwh)} kWh`,
      `${formatNumber(report.improvement.annualSavingsPercent)}%`,
      report.improvement.annualCostSavings == null ? 'Not included' : `${symbol}${formatNumber(report.improvement.annualCostSavings, 2)}`,
    ]],
    headStyles: { fillColor: BRAND_PURPLE, textColor: [255, 255, 255] },
    styles: { fontSize: 7.5, halign: 'center' },
    margin: { left: 14, right: 14 },
  });
  y = (doc as PdfWithTable).lastAutoTable.finalY + 5;
  y = addWrappedText(doc, report.improvement.aggregationMethod, y);
  if (report.carbon) {
    y = addWrappedText(
      doc,
      `CO2e calculation: ${formatNumber(report.improvement.annualSavingsKwh)} kWh x ${report.carbon.factor} ${report.carbon.factorUnit} = ${formatNumber(report.carbon.avoidedKgCo2e)} kg CO2e. Source: ${report.carbon.source}; geographic scope: ${report.carbon.geographicScope ?? 'not specified'}; source year: ${report.carbon.sourceYear ?? 'not specified'}.`,
      y
    );
  }

  y = pageBreak(doc, y, 55);
  y = addSectionHeader(doc, 'Identified Improvement Opportunities', y);
  if (report.improvement.opportunities.length === 0) {
    y = addWrappedText(doc, 'No modeled optimization opportunities were included in this report.', y);
  } else {
    for (const opportunity of report.improvement.opportunities) {
      y = pageBreak(doc, y, 45);
      autoTable(doc, {
        startY: y,
        head: [[opportunity.recommendation, 'Value']],
        body: [
          ['Technical action', opportunity.technicalAction],
          ['Scope / affected APs', `${opportunity.scope} / ${opportunity.affectedApCount}`],
          ['Projected annual energy reduction', `${formatNumber(opportunity.projectedAnnualSavingsKwh)} kWh`],
          ['Projected reduction', `${formatNumber(opportunity.projectedReductionPercent)}%`],
          ['Projected annual cost reduction', opportunity.projectedAnnualCostSavings == null ? 'Not included' : `${symbol}${formatNumber(opportunity.projectedAnnualCostSavings, 2)}`],
          ['Evidence / confidence', `${statusLabel(opportunity.evidenceStatus)} / ${opportunity.confidence}`],
          ['Operational assumptions', JSON.stringify(opportunity.assumptions)],
        ],
        headStyles: { fillColor: EVIDENCE_GREEN, textColor: [255, 255, 255] },
        styles: { fontSize: 7.5, overflow: 'linebreak' },
        columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 127 } },
        margin: { left: 14, right: 14 },
      });
      y = (doc as PdfWithTable).lastAutoTable.finalY + 7;
    }
  }

  y = pageBreak(doc, y, 85);
  y = addSectionHeader(doc, 'Monitoring and Measurement Evidence', y);
  autoTable(doc, {
    startY: y,
    body: [
      ['Telemetry source', report.provenance.telemetrySource],
      ['Sampling interval', report.provenance.samplingIntervalSeconds == null ? 'Not available' : `${report.provenance.samplingIntervalSeconds} seconds (median)`],
      ['Baseline methodology', report.provenance.baselineMethodology],
      ['Projection methodology', report.provenance.projectionMethodology],
      ['Electricity rate', report.financials ? `${report.financials.currencySymbol}${report.financials.electricityRate}/kWh (${report.financials.currency})` : 'Not included'],
      ['Carbon factor', report.carbon ? `${report.carbon.factor} ${report.carbon.factorUnit}; ${report.carbon.source}` : 'Not configured or not included'],
      ['Excluded devices', String(report.provenance.excludedDeviceCount)],
      ['Data quality', report.provenance.dataQuality],
      ['Scenario/model version', report.provenance.scenarioModelVersion],
      ['Generated timestamp', report.provenance.reportGeneratedAt],
    ],
    styles: { fontSize: 7.5, overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: 48 }, 1: { cellWidth: 134 } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as PdfWithTable).lastAutoTable.finalY + 10;
  y = pageBreak(doc, y, 35);
  y = addSectionHeader(doc, 'Report Positioning and Disclaimer', y);
  addWrappedText(doc, report.disclaimer, y);

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(210, 210, 210);
    doc.line(14, 284, 196, 284);
    doc.setFontSize(7);
    doc.setTextColor(90, 90, 90);
    doc.text(`Report ${report.reportId} | Page ${page} of ${pageCount}`, 14, 289);
    doc.text('Environmental performance evidence; not ISO certification or an audit opinion.', 196, 289, {
      align: 'right',
    });
  }

  return doc;
}

export async function downloadEnvironmentalReportPdf(report: EnvironmentalReport): Promise<void> {
  const doc = await createEnvironmentalReportPdf(report);
  const timestamp = report.generatedAt.slice(0, 19).replace(/:/g, '-');
  doc.save(`EP1_Environmental_Performance_${report.reportId}_${timestamp}.pdf`);
}