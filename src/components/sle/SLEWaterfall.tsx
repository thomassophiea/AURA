/**
 * SLE Waterfall - Horizontal bar view sorted by success rate
 * Worst-performing SLEs at top. Classifier segments shown in failure portion.
 * Click a row to expand Sankey drill-down.
 */

import { useState } from 'react';
import { SLESankeyFlow } from './SLESankeyFlow';
import { SLERootCausePanel } from './SLERootCausePanel';
import { SLE_STATUS_COLORS } from '../../types/sle';
import type { SLEMetric, SLEClassifier, SLERootCause } from '../../types/sle';

interface SLEWaterfallProps {
  sles: SLEMetric[];
  stations: any[];
  aps: any[];
}

function buildRootCause(classifier: SLEClassifier, sle: SLEMetric, stations: any[], aps: any[]): SLERootCause {
  let affectedDevices: SLERootCause['affectedDevices'] = [];
  let affectedAPs: SLERootCause['affectedAPs'] = [];
  let recommendations: string[] = [];
  if (sle.id === 'coverage' && classifier.id === 'weak_signal') {
    affectedDevices = stations.filter(s => (s.rssi ?? s.rss ?? 0) < -70).slice(0, 30).map(s => ({ mac: s.macAddress || '', name: s.hostName || s.hostname || s.username || s.deviceType || s.macAddress || 'Unknown', ap: s.apName || s.apDisplayName || s.apHostname || s.accessPointName || s.apSerialNumber || s.apSerial || s.apSn || '-', rssi: s.rssi ?? s.rss }));
    recommendations = ['Consider adding additional access points to improve coverage in affected areas', 'Verify AP transmit power settings are appropriate', 'Check for physical obstructions between APs and client locations'];
  } else if (sle.id === 'ap_health' && classifier.id === 'ap_disconnected') {
    affectedAPs = aps.filter(ap => { const status = (ap.status || ap.connectionState || '').toLowerCase(); return status.includes('disconnect') || status.includes('offline'); }).slice(0, 20).map(ap => ({ serial: ap.serialNumber || ap.serial || '', name: ap.name || ap.hostname || ap.apName || ap.displayName || ap.serialNumber || ap.serial || 'Unknown AP', status: ap.status || ap.connectionState || 'offline' }));
    recommendations = ['Check network connectivity to disconnected access points', 'Verify PoE power delivery to affected APs', 'Review switch port status for AP uplinks'];
  } else {
    affectedDevices = stations.slice(0, 10).map(s => ({ mac: s.macAddress || '', name: s.hostName || s.hostname || s.username || s.deviceType || s.macAddress || 'Unknown', ap: s.apName || s.apDisplayName || s.apHostname || s.accessPointName || s.apSerialNumber || s.apSerial || s.apSn || '-' }));
    recommendations = ['Monitor this classifier for trends over time', 'Review network configuration for the affected segment'];
  }
  return { classifierId: classifier.id, classifierName: classifier.name, description: `${classifier.affectedClients} ${sle.id === 'ap_health' ? 'access points' : 'clients'} affected by ${classifier.name.toLowerCase()} issues`, affectedDevices, affectedAPs, recommendations };
}

const STATUS_DETAIL_BG: Record<string, string> = {
  good: 'rgba(22, 101, 52, 0.7)',
  warn: 'rgba(133, 77, 14, 0.7)',
  poor: 'rgba(153, 27, 27, 0.7)',
};
const STATUS_NODE_BORDER: Record<string, string> = {
  good: 'rgba(34, 197, 94, 0.6)',
  warn: 'rgba(245, 158, 11, 0.6)',
  poor: 'rgba(239, 68, 68, 0.6)',
};

export function SLEWaterfall({ sles, stations, aps }: SLEWaterfallProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rootCause, setRootCause] = useState<SLERootCause | null>(null);

  // Sort worst to best (ascending success rate)
  const sorted = [...sles].sort((a, b) => a.successRate - b.successRate);

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-3 px-2 pb-1 border-b border-border/30">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest w-36 shrink-0">Metric</span>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex-1">Performance</span>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest w-16 text-right">Score</span>
      </div>

      {sorted.map(sle => {
        const isSelected = sle.id === selectedId;
        const color = SLE_STATUS_COLORS[sle.status].hex;
        const successPct = sle.successRate;
        const failPct = 100 - successPct;
        const activeClassifiers = sle.classifiers.filter(c => c.impactPercent > 0 || c.affectedClients > 0);
        const totalImpact = activeClassifiers.reduce((s, c) => s + c.impactPercent, 0) || 1;

        return (
          <div key={sle.id}>
            <button
              className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-lg transition-all duration-200 text-left ${isSelected ? 'bg-white/5' : 'hover:bg-white/[0.03]'}`}
              onClick={() => setSelectedId(isSelected ? null : sle.id)}
            >
              {/* Label */}
              <div className="w-36 shrink-0">
                <div className="text-xs font-semibold text-white/90 uppercase tracking-wide">{sle.name}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{sle.totalUserMinutes} clients</div>
              </div>

              {/* Bar */}
              <div className="flex-1 relative h-8 rounded overflow-hidden bg-white/5">
                {/* Success portion */}
                <div
                  className="absolute left-0 top-0 h-full transition-all duration-500"
                  style={{ width: `${successPct}%`, background: `${color}28`, borderRight: `1px solid ${color}50` }}
                />
                {/* Classifier segments in failure portion */}
                {failPct > 0.5 && activeClassifiers.map((c, i) => {
                  const segW = (c.impactPercent / totalImpact) * failPct;
                  const prevW = activeClassifiers.slice(0, i).reduce((acc, pc) => acc + (pc.impactPercent / totalImpact) * failPct, 0);
                  const opacity = Math.max(0.3, 0.7 - i * 0.1);
                  return (
                    <div
                      key={c.id}
                      className="absolute top-0 h-full"
                      style={{
                        left: `${successPct + prevW}%`,
                        width: `${segW}%`,
                        background: `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`,
                        borderRight: '1px solid rgba(0,0,0,0.3)',
                      }}
                      title={`${c.name}: ${c.impactPercent.toFixed(0)}%`}
                    />
                  );
                })}
                {/* Classifier names overlay */}
                <div className="absolute inset-0 flex items-center px-2">
                  <span className="text-[10px] font-medium text-white/45 truncate">
                    {activeClassifiers.length > 0 ? activeClassifiers.map(c => c.name).join(' · ') : 'No issues detected'}
                  </span>
                </div>
              </div>

              {/* Score */}
              <div className="w-16 text-right shrink-0">
                <span className="text-sm font-bold" style={{ color }}>{sle.successRate.toFixed(1)}%</span>
              </div>
            </button>

            {/* Sankey drill-down inline */}
            {isSelected && (
              <div
                className="mx-2 mb-2 rounded-xl overflow-hidden"
                style={{ background: STATUS_DETAIL_BG[sle.status], border: `1px solid ${STATUS_NODE_BORDER[sle.status]}` }}
              >
                <div className="flex items-center gap-2.5 px-5 pt-4 pb-2">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-widest text-white">{sle.name}</h3>
                    <p className="text-[11px] text-white/60">{sle.description}</p>
                  </div>
                  <span className="ml-auto text-xl font-bold" style={{ color }}>
                    {sle.successRate.toFixed(1)}%
                  </span>
                </div>
                <div className="px-3 pb-4">
                  <SLESankeyFlow sle={sle} onClassifierClick={c => setRootCause(buildRootCause(c, sle, stations, aps))} />
                </div>
              </div>
            )}
          </div>
        );
      })}

      <SLERootCausePanel open={rootCause !== null} onClose={() => setRootCause(null)} rootCause={rootCause} />
    </div>
  );
}
