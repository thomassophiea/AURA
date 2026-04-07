/**
 * SLE Radial Map - Hub-spoke mind-map layout for SLE metrics
 * Center: overall score. Ring: SLE nodes. Click to expand detail panel.
 */

import { useState, useRef, useEffect, useMemo, Fragment } from 'react';
import { Wifi, Signal, Radio, Shield, Clock, Activity, Target } from 'lucide-react';
import { SLESankeyFlow } from './SLESankeyFlow';
import { SLERootCausePanel } from './SLERootCausePanel';
import { buildRootCause } from './sleRootCause';
import { SLE_STATUS_COLORS, getSLEStatus } from '../../types/sle';
import type { SLEMetric, SLERootCause } from '../../types/sle';

const SLE_ICONS: Record<string, React.ElementType> = {
  coverage: Signal,
  throughput: Activity,
  ap_health: Wifi,
  capacity: Target,
  successful_connects: Shield,
  time_to_connect: Clock,
  roaming: Radio,
};

const STATUS_NODE_BG = {
  good: 'rgba(22, 163, 74, 0.92)',
  warn: 'rgba(202, 138, 4, 0.92)',
  poor: 'rgba(220, 38, 38, 0.92)',
} as const;

const STATUS_NODE_BORDER = {
  good: 'rgba(34, 197, 94, 0.6)',
  warn: 'rgba(245, 158, 11, 0.6)',
  poor: 'rgba(239, 68, 68, 0.6)',
} as const;

const STATUS_LINE = {
  good: 'rgba(34, 197, 94, 0.55)',
  warn: 'rgba(245, 158, 11, 0.55)',
  poor: 'rgba(239, 68, 68, 0.55)',
} as const;

const STATUS_DETAIL_BG = {
  good: 'rgba(22, 101, 52, 0.7)',
  warn: 'rgba(133, 77, 14, 0.7)',
  poor: 'rgba(153, 27, 27, 0.7)',
} as const;

interface SLERadialMapProps {
  sles: SLEMetric[];
  stations: any[];
  aps: any[];
  onClientClick?: (mac: string) => void;
}

export function SLERadialMap({ sles, stations, aps, onClientClick }: SLERadialMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rootCause, setRootCause] = useState<SLERootCause | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(800);

  const selected = sles.find(s => s.id === selectedId) || null;

  // Overall score
  const overallScore = sles.length > 0
    ? sles.reduce((sum, s) => sum + s.successRate, 0) / sles.length
    : 0;
  const overallStatus = getSLEStatus(overallScore);

  // Responsive: measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      setContainerW(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Derived dimensions
  const containerH = Math.max(440, containerW * 0.60);
  const centerX = containerW / 2;
  const centerY = containerH / 2;
  const ringRadius = Math.min(containerW * 0.34, containerH * 0.36);
  const nodeSize = Math.max(52, Math.min(68, containerW * 0.08));
  const hubSize = Math.max(90, Math.min(120, containerW * 0.13));

  // Node positions around the ring
  const nodePositions = useMemo(() => {
    return sles.map((_sle, i) => {
      const angle = (i * 2 * Math.PI / sles.length) - Math.PI / 2;
      return {
        x: centerX + Math.cos(angle) * ringRadius,
        y: centerY + Math.sin(angle) * ringRadius,
      };
    });
  }, [sles.length, centerX, centerY, ringRadius]);

  return (
    <>
      {/* Radial map container */}
      <div
        ref={containerRef}
        className="relative w-full"
        style={{ height: containerH }}
      >
        {/* SVG connection lines */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={containerW}
          height={containerH}
        >
          {sles.map((sle, i) => {
            const pos = nodePositions[i];
            const isSelected = sle.id === selectedId;
            return (
              <line
                key={sle.id}
                x1={centerX}
                y1={centerY}
                x2={pos.x}
                y2={pos.y}
                stroke={isSelected ? SLE_STATUS_COLORS[sle.status].hex : STATUS_LINE[sle.status]}
                strokeWidth={isSelected ? 3 : 1.5}
                strokeDasharray={isSelected ? 'none' : '6 4'}
                className="transition-all duration-300"
              />
            );
          })}
        </svg>

        {/* Center hub */}
        <div
          className="absolute flex flex-col items-center justify-center rounded-full z-10"
          style={{
            width: hubSize,
            height: hubSize,
            left: centerX - hubSize / 2,
            top: centerY - hubSize / 2,
            background: 'radial-gradient(circle, rgba(25,25,35,0.95) 0%, rgba(15,15,25,0.9) 100%)',
            border: `2px solid ${SLE_STATUS_COLORS[overallStatus].hex}80`,
            boxShadow: `0 0 30px rgba(0,0,0,0.5), 0 0 60px ${SLE_STATUS_COLORS[overallStatus].hex}30`,
          }}
        >
          <span
            className="text-xl font-bold"
            style={{ color: SLE_STATUS_COLORS[overallStatus].hex }}
          >
            {overallScore.toFixed(1)}%
          </span>
          <span className="text-[9px] text-white/70 uppercase tracking-widest">Overall</span>
        </div>

        {/* SLE nodes */}
        {sles.map((sle, i) => {
          const pos = nodePositions[i];
          const angle = (i * 2 * Math.PI / sles.length) - Math.PI / 2;
          const Icon = SLE_ICONS[sle.id] || Target;
          const isSelected = sle.id === selectedId;
          const activeCount = sle.classifiers.filter(c => c.affectedClients > 0).length;

          // Place text just outside the bubble, radiating away from center
          const labelGap = nodeSize / 2 + 18;
          const labelX = pos.x + Math.cos(angle) * labelGap;
          const labelY = pos.y + Math.sin(angle) * labelGap;
          const cosA = Math.cos(angle);
          const textAlign = cosA < -0.25 ? 'right' : cosA > 0.25 ? 'left' : 'center';
          const translateX = cosA < -0.25 ? '-100%' : cosA > 0.25 ? '0%' : '-50%';

          return (
            <Fragment key={sle.id}>
              {/* Bubble — icon only */}
              <button
                onClick={() => setSelectedId(isSelected ? null : sle.id)}
                className={`absolute flex items-center justify-center rounded-full transition-all duration-300 z-10 hover:brightness-110 sle-node-bubble sle-node-${sle.status}`}
                style={{
                  width: nodeSize,
                  height: nodeSize,
                  left: pos.x - nodeSize / 2,
                  top: pos.y - nodeSize / 2,
                  border: `2px solid ${SLE_STATUS_COLORS[sle.status].hex}${isSelected ? '' : 'aa'}`,
                  boxShadow: isSelected
                    ? `0 0 20px ${SLE_STATUS_COLORS[sle.status].hex}70, 0 0 40px ${SLE_STATUS_COLORS[sle.status].hex}35`
                    : `0 4px 16px rgba(0,0,0,0.5), 0 0 14px ${SLE_STATUS_COLORS[sle.status].hex}55`,
                  transform: isSelected ? 'scale(1.14)' : 'scale(1)',
                }}
              >
                <Icon className="h-4 w-4 text-white/90" />

                {/* Active classifier badge */}
                {activeCount > 0 && (
                  <span
                    className="absolute flex items-center justify-center rounded-full text-[8px] font-bold text-white"
                    style={{
                      width: 18,
                      height: 18,
                      bottom: -3,
                      right: -3,
                      background: 'rgba(239, 68, 68, 0.95)',
                      border: '1.5px solid rgba(0,0,0,0.4)',
                    }}
                  >
                    {activeCount}
                  </span>
                )}
              </button>

              {/* Labels outside the bubble */}
              <div
                className="absolute z-10 pointer-events-none"
                style={{
                  left: labelX,
                  top: labelY,
                  textAlign,
                  transform: `translate(${translateX}, -50%)`,
                  lineHeight: 1.2,
                }}
              >
                <div className="text-sm font-bold text-foreground whitespace-nowrap">
                  {sle.successRate.toFixed(1)}%
                </div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-widest whitespace-nowrap mt-0.5">
                  {sle.name}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      {/* Sankey flow diagram for selected SLE */}
      {selected && (
        <div
          className="rounded-xl overflow-hidden transition-all duration-300"
          style={{
            background: STATUS_DETAIL_BG[selected.status],
            border: `1px solid ${STATUS_NODE_BORDER[selected.status]}`,
          }}
        >
          {/* Compact header */}
          <div className="flex items-center gap-2.5 px-5 pt-4 pb-2">
            <div className="p-1.5 rounded-lg bg-white/15">
              {(() => {
                const Icon = SLE_ICONS[selected.id] || Target;
                return <Icon className="h-4 w-4 text-white/90" />;
              })()}
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-white">
                {selected.name}
              </h3>
              <p className="text-[11px] text-white/60">{selected.description}</p>
            </div>
            <span
              className="ml-auto text-xl font-bold"
              style={{ color: SLE_STATUS_COLORS[selected.status].hex }}
            >
              {selected.successRate.toFixed(1)}%
            </span>
          </div>

          {/* Sankey flow */}
          <div className="px-3 pb-4">
            <SLESankeyFlow
              sle={selected}
              onClassifierClick={(c) => {
                setRootCause(buildRootCause(c, selected, stations, aps));
              }}
            />
          </div>
        </div>
      )}

      {/* Root Cause Panel */}
      <SLERootCausePanel
        open={rootCause !== null}
        onClose={() => setRootCause(null)}
        rootCause={rootCause}
        onClientClick={onClientClick}
      />
    </>
  );
}
