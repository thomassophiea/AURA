/**
 * SLE Octopus - Organic tentacle visualization
 * Center body = overall score. Each tentacle = one SLE metric.
 * Tentacle length ∝ success rate. Color = status. Suckers along spine.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { SLESankeyFlow } from './SLESankeyFlow';
import { SLERootCausePanel } from './SLERootCausePanel';
import { buildRootCause } from './sleRootCause';
import { SLE_STATUS_COLORS, getSLEStatus } from '../../types/sle';
import type { SLEMetric, SLERootCause } from '../../types/sle';

interface SLEOctopusProps {
  sles: SLEMetric[];
  stations: any[];
  aps: any[];
  onClientClick?: (mac: string) => void;
}

/** Evaluate quadratic bezier at parameter t */
function qbez(p0: [number, number], p1: [number, number], p2: [number, number], t: number): [number, number] {
  const mt = 1 - t;
  return [mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0], mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]];
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

export function SLEOctopus({ sles, stations, aps, onClientClick }: SLEOctopusProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rootCause, setRootCause] = useState<SLERootCause | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(800);

  const selected = sles.find(s => s.id === selectedId) || null;
  const overallScore = sles.length > 0 ? sles.reduce((sum, s) => sum + s.successRate, 0) / sles.length : 0;
  const overallStatus = getSLEStatus(overallScore);

  const containerH = Math.max(420, containerW * 0.56);
  const cx = containerW / 2;
  const cy = containerH / 2;
  const maxLen = Math.min(containerW * 0.36, containerH * 0.42);
  const bodyR = Math.max(48, Math.min(72, containerW * 0.082));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => setContainerW(entries[0].contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const tentacles = useMemo(() => {
    return sles.map((sle, i) => {
      const angle = (i * 2 * Math.PI / sles.length) - Math.PI / 2;
      const len = maxLen * (sle.successRate / 100);
      const ex = cx + Math.cos(angle) * len;
      const ey = cy + Math.sin(angle) * len;
      const ghostEx = cx + Math.cos(angle) * maxLen;
      const ghostEy = cy + Math.sin(angle) * maxLen;
      const perp = len * 0.38;
      const cpx = cx + Math.cos(angle) * len * 0.5 - Math.sin(angle) * perp;
      const cpy = cy + Math.sin(angle) * len * 0.5 + Math.cos(angle) * perp;
      const ghostPerp = maxLen * 0.38;
      const gcpx = cx + Math.cos(angle) * maxLen * 0.5 - Math.sin(angle) * ghostPerp;
      const gcpy = cy + Math.sin(angle) * maxLen * 0.5 + Math.cos(angle) * ghostPerp;
      const suckers = [0.28, 0.52, 0.76].map(t => ({
        pos: qbez([cx, cy], [cpx, cpy], [ex, ey], t),
        r: Math.max(3.5, 7 * (1 - t * 0.35)),
      }));
      const labelPad = 32;
      const lx = cx + Math.cos(angle) * (maxLen + labelPad);
      const ly = cy + Math.sin(angle) * (maxLen + labelPad);
      return { sle, angle, len, ex, ey, cpx, cpy, ghostEx, ghostEy, gcpx, gcpy, suckers, lx, ly };
    });
  }, [sles, cx, cy, maxLen]);

  return (
    <>
      <div ref={containerRef} className="relative w-full select-none" style={{ height: containerH }}>
        <svg width={containerW} height={containerH} className="absolute inset-0 overflow-visible">
          <defs>
            {sles.map(sle => (
              <filter key={`glow-${sle.id}`} id={`octGlow-${sle.id}`} x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feFlood floodColor={SLE_STATUS_COLORS[sle.status].hex} floodOpacity="0.5" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            ))}
          </defs>

          {/* Ghost tentacles */}
          {tentacles.map(({ sle, gcpx, gcpy, ghostEx, ghostEy }) => (
            <path
              key={`ghost-${sle.id}`}
              d={`M ${cx} ${cy} Q ${gcpx} ${gcpy} ${ghostEx} ${ghostEy}`}
              fill="none"
              stroke={SLE_STATUS_COLORS[sle.status].hex}
              strokeWidth={4}
              strokeOpacity={0.06}
              strokeLinecap="round"
            />
          ))}

          {/* Tentacles */}
          {tentacles.map(({ sle, cpx, cpy, ex, ey, suckers }) => {
            const isSelected = sle.id === selectedId;
            const color = SLE_STATUS_COLORS[sle.status].hex;
            return (
              <g key={sle.id}>
                <path
                  d={`M ${cx} ${cy} Q ${cpx} ${cpy} ${ex} ${ey}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={isSelected ? 8 : 5}
                  strokeOpacity={isSelected ? 0.95 : 0.65}
                  strokeLinecap="round"
                  filter={isSelected ? `url(#octGlow-${sle.id})` : undefined}
                  className="transition-all duration-300"
                />
                {suckers.map((s, si) => (
                  <circle
                    key={si}
                    cx={s.pos[0]}
                    cy={s.pos[1]}
                    r={s.r}
                    fill="rgba(0,0,0,0.65)"
                    stroke={color}
                    strokeWidth={1.5}
                    strokeOpacity={0.55}
                  />
                ))}
                <circle
                  cx={ex}
                  cy={ey}
                  r={isSelected ? 15 : 12}
                  fill={color}
                  fillOpacity={isSelected ? 0.95 : 0.8}
                  stroke={isSelected ? 'rgba(255,255,255,0.5)' : color}
                  strokeWidth={isSelected ? 2 : 1}
                  filter={isSelected ? `url(#octGlow-${sle.id})` : undefined}
                  className="cursor-pointer transition-all duration-300"
                  onClick={() => setSelectedId(isSelected ? null : sle.id)}
                />
                <text
                  x={ex}
                  y={ey + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={8}
                  fontWeight="bold"
                  fill="white"
                  className="pointer-events-none"
                >
                  {sle.successRate.toFixed(0)}%
                </text>
              </g>
            );
          })}

          {/* Center body outline */}
          <circle
            cx={cx}
            cy={cy}
            r={bodyR + 10}
            fill="rgba(0,0,0,0.2)"
            stroke={SLE_STATUS_COLORS[overallStatus].hex}
            strokeWidth={1}
            strokeOpacity={0.15}
          />
        </svg>

        {/* Center body: HTML overlay for gradient */}
        <div
          className="absolute flex flex-col items-center justify-center rounded-full pointer-events-none"
          style={{
            width: bodyR * 2,
            height: bodyR * 2,
            left: cx - bodyR,
            top: cy - bodyR,
            background: 'radial-gradient(circle, rgba(22,22,35,0.97) 0%, rgba(8,8,18,0.95) 100%)',
            border: `2px solid ${SLE_STATUS_COLORS[overallStatus].hex}55`,
            boxShadow: `0 0 40px rgba(0,0,0,0.7), 0 0 80px ${SLE_STATUS_COLORS[overallStatus].hex}18`,
          }}
        >
          <span className="text-xl font-bold leading-none" style={{ color: SLE_STATUS_COLORS[overallStatus].hex }}>
            {overallScore.toFixed(1)}%
          </span>
          <span className="text-[9px] text-white/55 uppercase tracking-widest mt-0.5">Overall</span>
        </div>

        {/* SLE name labels */}
        {tentacles.map(({ sle, lx, ly }) => (
          <div
            key={`lbl-${sle.id}`}
            className="absolute pointer-events-none"
            style={{ left: lx, top: ly, transform: 'translate(-50%, -50%)' }}
          >
            <div
              className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap px-1.5 py-0.5 rounded"
              style={{ color: SLE_STATUS_COLORS[sle.status].hex, background: 'rgba(0,0,0,0.55)' }}
            >
              {sle.name}
            </div>
          </div>
        ))}
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
            <SLESankeyFlow
              sle={selected}
              onClassifierClick={c => setRootCause(buildRootCause(c, selected, stations, aps))}
            />
          </div>
        </div>
      )}

      <SLERootCausePanel open={rootCause !== null} onClose={() => setRootCause(null)} rootCause={rootCause} onClientClick={onClientClick} />
    </>
  );
}
