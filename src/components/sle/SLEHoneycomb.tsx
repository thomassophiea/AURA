/**
 * SLE Honeycomb - Hex grid visualization
 * Each hexagon = one SLE metric. Fill level (bottom-up) = success rate.
 * Click to expand Sankey drill-down.
 */

import { useState, useRef, useEffect } from 'react';
import { SLESankeyFlow } from './SLESankeyFlow';
import { SLERootCausePanel } from './SLERootCausePanel';
import { SLE_STATUS_COLORS, getSLEStatus } from '../../types/sle';
import type { SLEMetric, SLEClassifier, SLERootCause } from '../../types/sle';

interface SLEHoneycombProps {
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

/** Generate pointy-top hexagon vertex string */
function hexPoints(hcx: number, hcy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${hcx + r * Math.cos(angle)},${hcy + r * Math.sin(angle)}`;
  }).join(' ');
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

export function SLEHoneycomb({ sles, stations, aps }: SLEHoneycombProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [rootCause, setRootCause] = useState<SLERootCause | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(800);

  const selected = sles.find(s => s.id === selectedId) || null;
  const overallScore = sles.length > 0 ? sles.reduce((sum, s) => sum + s.successRate, 0) / sles.length : 0;
  const overallStatus = getSLEStatus(overallScore);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => setContainerW(entries[0].contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const hexR = Math.max(52, Math.min(80, containerW * 0.09));
  const hexW = Math.sqrt(3) * hexR;
  const hexH = 2 * hexR;
  const rowGap = hexH * 0.75;

  const n = sles.length;
  const row0Count = Math.ceil(n / 2);
  const row1Count = Math.floor(n / 2);

  const svgW = Math.max(containerW, row0Count * hexW + hexW + 40);
  const row0Y = hexR + 20;
  const row1Y = row0Y + rowGap;
  const svgH = row1Y + hexR + 40;

  const row0StartX = (svgW - (row0Count - 1) * hexW) / 2;
  const row1StartX = (svgW - (row1Count - 1) * hexW) / 2;

  const hexPositions = sles.map((sle, i) => {
    if (i < row0Count) {
      return { sle, hcx: row0StartX + i * hexW, hcy: row0Y };
    } else {
      const j = i - row0Count;
      return { sle, hcx: row1StartX + j * hexW, hcy: row1Y };
    }
  });

  return (
    <>
      <div ref={containerRef} className="w-full">
        <svg width={containerW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="w-full overflow-visible">
          <defs>
            {sles.map(sle => {
              const color = SLE_STATUS_COLORS[sle.status].hex;
              return (
                <filter key={`hcGlow-${sle.id}`} id={`hcGlow-${sle.id}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feFlood floodColor={color} floodOpacity="0.5" result="c" />
                  <feComposite in="c" in2="blur" operator="in" result="g" />
                  <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              );
            })}
            {hexPositions.map(({ sle, hcx, hcy }) => {
              const fillH = hexH * (sle.successRate / 100);
              const clipY = hcy + hexR - fillH;
              return (
                <clipPath key={`hcClip-${sle.id}`} id={`hcClip-${sle.id}`}>
                  <rect x={hcx - hexW / 2 - 2} y={clipY} width={hexW + 4} height={fillH + 4} />
                </clipPath>
              );
            })}
          </defs>

          {hexPositions.map(({ sle, hcx, hcy }) => {
            const isSelected = sle.id === selectedId;
            const isHovered = sle.id === hoveredId;
            const color = SLE_STATUS_COLORS[sle.status].hex;
            const pts = hexPoints(hcx, hcy, hexR - 2);
            const active = isSelected || isHovered;

            return (
              <g
                key={sle.id}
                className="cursor-pointer"
                onClick={() => setSelectedId(isSelected ? null : sle.id)}
                onMouseEnter={() => setHoveredId(sle.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Dark background hex */}
                <polygon
                  points={pts}
                  fill="rgba(12,12,22,0.92)"
                  stroke={color}
                  strokeWidth={active ? 2.5 : 1.5}
                  strokeOpacity={active ? 0.9 : 0.45}
                  filter={active ? `url(#hcGlow-${sle.id})` : undefined}
                />
                {/* Colored fill rising from bottom */}
                <polygon
                  points={pts}
                  fill={color}
                  fillOpacity={0.22}
                  clipPath={`url(#hcClip-${sle.id})`}
                />
                {/* Name */}
                <text
                  x={hcx}
                  y={hcy - hexR * 0.2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={Math.max(8, hexR * 0.155)}
                  fontWeight="600"
                  fill="rgba(255,255,255,0.7)"
                >
                  {sle.name}
                </text>
                {/* Score */}
                <text
                  x={hcx}
                  y={hcy + hexR * 0.22}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={Math.max(14, hexR * 0.33)}
                  fontWeight="bold"
                  fill={color}
                >
                  {sle.successRate.toFixed(1)}%
                </text>
              </g>
            );
          })}

          <text
            x={svgW / 2}
            y={svgH - 12}
            textAnchor="middle"
            fontSize={11}
            fill="rgba(255,255,255,0.35)"
          >
            Overall: {overallScore.toFixed(1)}% — {overallStatus.toUpperCase()}
          </text>
        </svg>
      </div>

      {selected && (
        <div
          className="rounded-xl overflow-hidden transition-all duration-300"
          style={{ background: STATUS_DETAIL_BG[selected.status], border: `1px solid ${STATUS_NODE_BORDER[selected.status]}` }}
        >
          <div className="flex items-center gap-2.5 px-5 pt-4 pb-2">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-white">{selected.name}</h3>
              <p className="text-[11px] text-white/60">{selected.description}</p>
            </div>
            <span className="ml-auto text-xl font-bold" style={{ color: SLE_STATUS_COLORS[selected.status].hex }}>
              {selected.successRate.toFixed(1)}%
            </span>
          </div>
          <div className="px-3 pb-4">
            <SLESankeyFlow sle={selected} onClassifierClick={c => setRootCause(buildRootCause(c, selected, stations, aps))} />
          </div>
        </div>
      )}

      <SLERootCausePanel open={rootCause !== null} onClose={() => setRootCause(null)} rootCause={rootCause} />
    </>
  );
}
