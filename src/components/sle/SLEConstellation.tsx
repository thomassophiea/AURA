/**
 * SLE Constellation - Stars in space visualization
 * Each SLE = a glowing star. Size & brightness ∝ success rate.
 * Constellation lines connect stars. Click to expand Sankey.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { SLESankeyFlow } from './SLESankeyFlow';
import { SLERootCausePanel } from './SLERootCausePanel';
import { SLE_STATUS_COLORS, getSLEStatus } from '../../types/sle';
import type { SLEMetric, SLEClassifier, SLERootCause } from '../../types/sle';

interface SLEConstellationProps {
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

/** Generate SVG path for a 5-pointed star centered at (cx,cy) */
function starPath(scx: number, scy: number, outerR: number, innerR: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(`${scx + r * Math.cos(angle)},${scy + r * Math.sin(angle)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

/** Deterministic pseudo-random background stars */
function makeBgStars(count: number, w: number, h: number) {
  return Array.from({ length: count }, (_, i) => ({
    x: ((i * 7919 + 1234) % 10000) / 10000 * w,
    y: ((i * 6271 + 5678) % 10000) / 10000 * h,
    r: ((i * 3571) % 10000) / 10000 * 1.2 + 0.3,
    op: ((i * 4127) % 10000) / 10000 * 0.5 + 0.1,
  }));
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

export function SLEConstellation({ sles, stations, aps }: SLEConstellationProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [rootCause, setRootCause] = useState<SLERootCause | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(800);

  const selected = sles.find(s => s.id === selectedId) || null;
  const overallScore = sles.length > 0 ? sles.reduce((sum, s) => sum + s.successRate, 0) / sles.length : 0;
  const overallStatus = getSLEStatus(overallScore);
  const containerH = Math.max(380, containerW * 0.5);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => setContainerW(entries[0].contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const cx = containerW / 2;
  const cy = containerH / 2;
  const orbitR = Math.min(containerW * 0.33, containerH * 0.38);

  const stars = useMemo(() => sles.map((sle, i) => {
    const angle = (i * 2 * Math.PI / sles.length) - Math.PI / 2;
    const x = cx + Math.cos(angle) * orbitR;
    const y = cy + Math.sin(angle) * orbitR;
    const outerR = 14 + (sle.successRate / 100) * 20;
    const innerR = outerR * 0.42;
    const opacity = 0.45 + (sle.successRate / 100) * 0.55;
    const color = SLE_STATUS_COLORS[sle.status].hex;
    return { sle, x, y, outerR, innerR, opacity, color, angle };
  }), [sles, cx, cy, orbitR]);

  const bgStarList = useMemo(() => makeBgStars(80, containerW, containerH), [containerW, containerH]);

  const lines = useMemo(() => stars.map((star, i) => {
    const next = stars[(i + 1) % stars.length];
    return { x1: star.x, y1: star.y, x2: next.x, y2: next.y };
  }), [stars]);

  return (
    <>
      <div ref={containerRef} className="relative w-full" style={{ height: containerH }}>
        <svg width={containerW} height={containerH} className="absolute inset-0 rounded-xl overflow-hidden">
          <defs>
            <radialGradient id="cSpaceBg" cx="50%" cy="50%" r="70%">
              <stop offset="0%" stopColor="rgba(15,10,35,1)" />
              <stop offset="100%" stopColor="rgba(5,5,15,1)" />
            </radialGradient>
            {stars.map(({ sle, color }) => (
              <filter key={`cGlow-${sle.id}`} id={`cGlow-${sle.id}`} x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feFlood floodColor={color} floodOpacity="0.6" result="c" />
                <feComposite in="c" in2="blur" operator="in" result="g" />
                <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            ))}
            <filter id="cBodyGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="15" result="blur" />
              <feFlood floodColor={SLE_STATUS_COLORS[overallStatus].hex} floodOpacity="0.3" result="c" />
              <feComposite in="c" in2="blur" operator="in" result="g" />
              <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Space background */}
          <rect width={containerW} height={containerH} fill="url(#cSpaceBg)" />

          {/* Background stars */}
          {bgStarList.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="white" opacity={s.op} />
          ))}

          {/* Constellation lines */}
          {lines.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="4 6" />
          ))}

          {/* Center overall */}
          <circle cx={cx} cy={cy} r={36} fill="rgba(10,10,20,0.8)"
            stroke={SLE_STATUS_COLORS[overallStatus].hex} strokeWidth={1} strokeOpacity={0.4}
            filter="url(#cBodyGlow)" />
          <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="middle"
            fontSize={14} fontWeight="bold" fill={SLE_STATUS_COLORS[overallStatus].hex}>
            {overallScore.toFixed(1)}%
          </text>
          <text x={cx} y={cy + 11} textAnchor="middle" dominantBaseline="middle"
            fontSize={8} fill="rgba(255,255,255,0.45)">
            OVERALL
          </text>

          {/* Stars */}
          {stars.map(({ sle, x, y, outerR, innerR, opacity, color }) => {
            const isSelected = sle.id === selectedId;
            const isHovered = sle.id === hoveredId;
            const active = isSelected || isHovered;
            return (
              <g
                key={sle.id}
                className="cursor-pointer"
                onClick={() => setSelectedId(isSelected ? null : sle.id)}
                onMouseEnter={() => setHoveredId(sle.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Glow halo */}
                <circle cx={x} cy={y} r={outerR * (active ? 1.9 : 1.6)} fill={color}
                  opacity={active ? 0.18 : 0.07} className="transition-all duration-300" />
                {/* Star shape */}
                <path
                  d={starPath(x, y, active ? outerR * 1.25 : outerR, active ? innerR * 1.25 : innerR)}
                  fill={color}
                  opacity={active ? Math.min(1, opacity + 0.2) : opacity}
                  filter={active ? `url(#cGlow-${sle.id})` : undefined}
                  stroke={active ? 'rgba(255,255,255,0.6)' : 'transparent'}
                  strokeWidth={1}
                  className="transition-all duration-300"
                />
              </g>
            );
          })}

          {/* Labels */}
          {stars.map(({ sle, x, y, outerR, color, angle }) => {
            const labelDist = outerR + 20;
            const lx = x + Math.cos(angle) * labelDist;
            const ly = y + Math.sin(angle) * labelDist;
            const anchor = Math.cos(angle) > 0.15 ? 'start' : Math.cos(angle) < -0.15 ? 'end' : 'middle';
            return (
              <g key={`lbl-${sle.id}`} className="pointer-events-none">
                <text x={lx} y={ly - 5} textAnchor={anchor} fontSize={9} fontWeight="600"
                  fill={color} opacity={0.9}>
                  {sle.name.toUpperCase()}
                </text>
                <text x={lx} y={ly + 7} textAnchor={anchor} fontSize={11} fontWeight="bold"
                  fill={color} opacity={0.75}>
                  {sle.successRate.toFixed(1)}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {selected && (
        <div
          className="rounded-xl overflow-hidden transition-all duration-300 mt-2"
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
