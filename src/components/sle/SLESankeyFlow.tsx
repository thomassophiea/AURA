/**
 * SLE Sankey Flow - Bold visual flow diagram showing client success/failure
 * breakdown and classifier distribution as flowing bands.
 *
 * Total Clients → [Success | Affected] → Classifier buckets
 */

import { useState, useRef, useEffect } from 'react';
import { SLE_STATUS_COLORS } from '../../types/sle';
import type { SLEMetric, SLEClassifier } from '../../types/sle';

interface SLESankeyFlowProps {
  sle: SLEMetric;
  onClassifierClick?: (classifier: SLEClassifier) => void;
}

/** Create a smooth flowing band path between two vertical segments */
function bandPath(
  x1: number, y1Top: number, y1Bot: number,
  x2: number, y2Top: number, y2Bot: number,
): string {
  const mx = (x1 + x2) / 2;
  return [
    `M ${x1},${y1Top}`,
    `C ${mx},${y1Top} ${mx},${y2Top} ${x2},${y2Top}`,
    `L ${x2},${y2Bot}`,
    `C ${mx},${y2Bot} ${mx},${y1Bot} ${x1},${y1Bot}`,
    'Z',
  ].join(' ');
}

export function SLESankeyFlow({ sle, onClassifierClick }: SLESankeyFlowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      setWidth(entries[0].contentRect.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const pad = { top: 60, bottom: 30, left: 24, right: 24 };
  const barW = 40;

  // Column x positions
  const col0 = pad.left;
  const col1 = width * 0.30;
  const col2 = width * 0.62;

  // --- Classifier sizing first ---
  const activeClassifiers = sle.classifiers.filter(c => c.impactPercent > 0 || c.affectedClients > 0);
  const totalImpact = activeClassifiers.reduce((s, c) => s + c.impactPercent, 0) || 1;

  const minRowH = 38;
  const classifierGap = 6;
  const minClassifierH = activeClassifiers.length * minRowH + Math.max(0, activeClassifiers.length - 1) * classifierGap;

  const baseFlowH = 240;
  const flowH = Math.max(baseFlowH, minClassifierH);
  const height = flowH + pad.top + pad.bottom;

  const minBand = 10;

  // --- Stage 1: Total → Success + Affected ---
  const successFrac = sle.successRate / 100;

  const rawSuccessH = Math.max(minBand, successFrac * flowH);
  const rawAffectedH = Math.max(minBand, (1 - successFrac) * flowH);
  const totalSplitH = rawSuccessH + rawAffectedH;
  const normSuccessH = (rawSuccessH / totalSplitH) * flowH;
  const normAffectedH = (rawAffectedH / totalSplitH) * flowH;

  const totalY = pad.top;
  const successY = pad.top;
  const affectedY = pad.top + normSuccessH;

  const successCount = sle.totalUserMinutes - sle.affectedUserMinutes;
  const affectedCount = sle.affectedUserMinutes;

  // --- Stage 2: Affected → Classifiers ---
  const totalClassifierGaps = Math.max(0, activeClassifiers.length - 1) * classifierGap;
  const availableClassifierH = flowH - totalClassifierGaps;

  let rawClassifierHeights = activeClassifiers.map(c => {
    const frac = c.impactPercent / totalImpact;
    return Math.max(minRowH * 0.6, frac * availableClassifierH);
  });
  const rawTotal = rawClassifierHeights.reduce((s, h) => s + h, 0) || 1;
  rawClassifierHeights = rawClassifierHeights.map(h => (h / rawTotal) * availableClassifierH);

  let classifierRunY = pad.top;
  const classifierBars = activeClassifiers.map((c, i) => {
    const h = rawClassifierHeights[i];
    const bar = { classifier: c, y: classifierRunY, h };
    classifierRunY += h + classifierGap;
    return bar;
  });

  // Colors
  const successColor = SLE_STATUS_COLORS.good.hex;
  const affectedColor = SLE_STATUS_COLORS[sle.status === 'good' ? 'warn' : sle.status].hex;

  const classifierColors = activeClassifiers.map((_c, i) => {
    const opacity = 0.95 - (i * 0.08);
    return `${affectedColor}${Math.round(Math.max(0.5, opacity) * 255).toString(16).padStart(2, '0')}`;
  });

  // Source slices on affected bar
  let affectedRunY = affectedY;
  const affectedSlices = activeClassifiers.map(c => {
    const frac = c.impactPercent / totalImpact;
    const h = Math.max(2, frac * normAffectedH);
    const slice = { y: affectedRunY, h };
    affectedRunY += h;
    return slice;
  });

  const entityLabel = sle.id === 'ap_health' ? 'APs' : 'clients';

  return (
    <div ref={containerRef} className="w-full">
      <svg width={width} height={height} className="overflow-visible">
        {/* Glow filters */}
        <defs>
          <filter id="glowGreen" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feFlood floodColor={successColor} floodOpacity="0.3" />
            <feComposite in2="blur" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glowAffected" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feFlood floodColor={affectedColor} floodOpacity="0.3" />
            <feComposite in2="blur" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* === Column headers === */}
        <text x={col0 + barW / 2} y={20} textAnchor="middle" className="fill-white/60 text-[11px] font-semibold uppercase tracking-[0.2em]">
          Clients
        </text>
        <text x={col1 + barW / 2} y={20} textAnchor="middle" className="fill-white/60 text-[11px] font-semibold uppercase tracking-[0.2em]">
          Outcome
        </text>
        <text x={col2 + barW / 2} y={20} textAnchor="middle" className="fill-white/60 text-[11px] font-semibold uppercase tracking-[0.2em]">
          Root Cause
        </text>

        {/* === Flow bands: Total → Success === */}
        <path
          d={bandPath(
            col0 + barW, totalY, totalY + normSuccessH,
            col1, successY, successY + normSuccessH,
          )}
          fill={successColor}
          opacity={hovered === null || hovered === '_success' ? 0.45 : 0.15}
          className="transition-opacity duration-200"
        />

        {/* === Flow bands: Total → Affected === */}
        <path
          d={bandPath(
            col0 + barW, totalY + normSuccessH, totalY + flowH,
            col1, affectedY, affectedY + normAffectedH,
          )}
          fill={affectedColor}
          opacity={hovered === null || hovered === '_affected' ? 0.45 : 0.15}
          className="transition-opacity duration-200"
        />

        {/* === Flow bands: Affected → Classifiers === */}
        {classifierBars.map((bar, i) => {
          const slice = affectedSlices[i];
          const isHovered = hovered === bar.classifier.id;
          return (
            <path
              key={bar.classifier.id}
              d={bandPath(
                col1 + barW, slice.y, slice.y + slice.h,
                col2, bar.y, bar.y + bar.h,
              )}
              fill={classifierColors[i]}
              opacity={hovered === null || isHovered ? 0.5 : 0.1}
              className="transition-opacity duration-200 cursor-pointer"
              onMouseEnter={() => setHovered(bar.classifier.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onClassifierClick?.(bar.classifier)}
            />
          );
        })}

        {/* === Vertical bars === */}

        {/* Total bar */}
        <rect
          x={col0} y={totalY}
          width={barW} height={flowH}
          rx={6}
          fill="rgba(255,255,255,0.15)"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth={1.5}
        />
        {/* Total count — big and bold inside bar */}
        <text x={col0 + barW / 2} y={totalY + flowH / 2 - 8} textAnchor="middle" dominantBaseline="middle" className="fill-white text-[18px] font-bold">
          {sle.totalUserMinutes}
        </text>
        <text x={col0 + barW / 2} y={totalY + flowH / 2 + 10} textAnchor="middle" dominantBaseline="middle" className="fill-white/60 text-[9px]">
          total
        </text>

        {/* Success bar */}
        <rect
          x={col1} y={successY}
          width={barW} height={normSuccessH}
          rx={6}
          fill={successColor}
          opacity={0.85}
          filter="url(#glowGreen)"
        />

        {/* Affected bar */}
        <rect
          x={col1} y={affectedY}
          width={barW} height={normAffectedH}
          rx={6}
          fill={affectedColor}
          opacity={0.85}
          filter="url(#glowAffected)"
        />

        {/* Classifier bars */}
        {classifierBars.map((bar, i) => {
          const isHovered = hovered === bar.classifier.id;
          return (
            <rect
              key={bar.classifier.id}
              x={col2} y={bar.y}
              width={barW} height={bar.h}
              rx={6}
              fill={classifierColors[i]}
              opacity={isHovered ? 1 : 0.85}
              stroke={isHovered ? '#fff' : 'rgba(255,255,255,0.15)'}
              strokeWidth={isHovered ? 2 : 1}
              className="transition-all duration-200 cursor-pointer"
              onMouseEnter={() => setHovered(bar.classifier.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onClassifierClick?.(bar.classifier)}
            />
          );
        })}

        {/* === Labels === */}

        {/* Success — prominent label block */}
        <text x={col1 + barW + 14} y={successY + normSuccessH / 2 - 14} dominantBaseline="middle" className="fill-white text-[13px] font-bold">
          Success
        </text>
        <text x={col1 + barW + 14} y={successY + normSuccessH / 2 + 2} dominantBaseline="middle" style={{ fill: successColor }} className="text-[18px] font-bold">
          {successCount}
        </text>
        <text x={col1 + barW + 14} y={successY + normSuccessH / 2 + 18} dominantBaseline="middle" className="fill-white/50 text-[11px]">
          {sle.successRate.toFixed(1)}% of {entityLabel}
        </text>

        {/* Affected — prominent label block */}
        {normAffectedH > 30 ? (
          <>
            <text x={col1 + barW + 14} y={affectedY + normAffectedH / 2 - 14} dominantBaseline="middle" className="fill-white text-[13px] font-bold">
              Affected
            </text>
            <text x={col1 + barW + 14} y={affectedY + normAffectedH / 2 + 2} dominantBaseline="middle" style={{ fill: affectedColor }} className="text-[18px] font-bold">
              {affectedCount}
            </text>
            <text x={col1 + barW + 14} y={affectedY + normAffectedH / 2 + 18} dominantBaseline="middle" className="fill-white/50 text-[11px]">
              {(100 - sle.successRate).toFixed(1)}% of {entityLabel}
            </text>
          </>
        ) : affectedCount > 0 && (
          <>
            <text x={col1 + barW + 14} y={affectedY + normAffectedH / 2 - 2} dominantBaseline="middle" className="fill-white text-[12px] font-bold">
              Affected
            </text>
            <text x={col1 + barW + 14 + 70} y={affectedY + normAffectedH / 2 - 2} dominantBaseline="middle" style={{ fill: affectedColor }} className="text-[14px] font-bold">
              {affectedCount} ({(100 - sle.successRate).toFixed(1)}%)
            </text>
          </>
        )}

        {/* Classifier labels */}
        {classifierBars.map((bar) => {
          const isHovered = hovered === bar.classifier.id;
          const cy = bar.y + bar.h / 2;
          return (
            <g
              key={`label-${bar.classifier.id}`}
              className="cursor-pointer"
              onMouseEnter={() => setHovered(bar.classifier.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onClassifierClick?.(bar.classifier)}
            >
              <text
                x={col2 + barW + 12}
                y={cy - 8}
                dominantBaseline="middle"
                className={`text-[12px] font-semibold transition-all duration-200 ${isHovered ? 'fill-white' : 'fill-white/90'}`}
              >
                {bar.classifier.name}
              </text>
              <text
                x={col2 + barW + 12}
                y={cy + 8}
                dominantBaseline="middle"
                className="fill-white/50 text-[11px]"
              >
                {bar.classifier.impactPercent.toFixed(0)}% · {bar.classifier.affectedClients} {entityLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
