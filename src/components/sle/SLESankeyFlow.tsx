/**
 * SLE Sankey Flow - Visual flow diagram showing client success/failure
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

  const height = 300;
  const pad = { top: 40, bottom: 40, left: 20, right: 20 };
  const flowH = height - pad.top - pad.bottom;
  const barW = 28;

  // Column x positions (left edge of each bar)
  const col0 = pad.left;
  const col1 = width * 0.32;
  const col2 = width * 0.64;

  // Ensure minimum band height for visibility
  const minBand = 6;

  // --- Stage 1: Total → Success + Affected ---
  const successFrac = sle.successRate / 100;
  const affectedFrac = 1 - successFrac;

  const successH = Math.max(minBand, successFrac * flowH);
  const affectedH = Math.max(minBand, affectedFrac * flowH);
  // Normalize so they fit exactly
  const totalSplitH = successH + affectedH;
  const normSuccessH = (successH / totalSplitH) * flowH;
  const normAffectedH = (affectedH / totalSplitH) * flowH;

  // Total bar (col0)
  const totalY = pad.top;

  // Success bar (col1, top)
  const successY = pad.top;

  // Affected bar (col1, below success)
  const affectedY = pad.top + normSuccessH;

  // --- Stage 2: Affected → Classifiers ---
  const activeClassifiers = sle.classifiers.filter(c => c.impactPercent > 0 || c.affectedClients > 0);
  const totalImpact = activeClassifiers.reduce((s, c) => s + c.impactPercent, 0) || 1;

  const classifierGap = 3;
  const totalGaps = Math.max(0, activeClassifiers.length - 1) * classifierGap;
  const classifierFlowH = Math.max(minBand, normAffectedH - totalGaps);

  let classifierRunY = pad.top; // classifiers start from top of col2
  const classifierBars = activeClassifiers.map(c => {
    const frac = c.impactPercent / totalImpact;
    const h = Math.max(minBand, frac * classifierFlowH);
    const bar = { classifier: c, y: classifierRunY, h };
    classifierRunY += h + classifierGap;
    return bar;
  });

  // Color helpers
  const successColor = SLE_STATUS_COLORS.good.hex;
  const affectedColor = SLE_STATUS_COLORS[sle.status === 'good' ? 'warn' : sle.status].hex;

  // Classifier colors: gradient from the affected color to lighter shades
  const classifierColors = activeClassifiers.map((_c, i) => {
    const opacity = 0.9 - (i * 0.12);
    return `${affectedColor}${Math.round(Math.max(0.4, opacity) * 255).toString(16).padStart(2, '0')}`;
  });

  // --- Affected side: map source positions on total bar for the affected→classifier flows ---
  // The affected portion on col1 runs from affectedY to affectedY + normAffectedH.
  // Each classifier band takes a proportional slice of that range.
  let affectedRunY = affectedY;
  const affectedSlices = classifierBars.map(bar => {
    const frac = bar.classifier.impactPercent / totalImpact;
    const h = frac * normAffectedH;
    const slice = { y: affectedRunY, h };
    affectedRunY += h;
    return slice;
  });

  return (
    <div ref={containerRef} className="w-full">
      <svg width={width} height={height} className="overflow-visible">
        {/* --- Flow bands: Total → Success --- */}
        <path
          d={bandPath(
            col0 + barW, totalY, totalY + normSuccessH,
            col1, successY, successY + normSuccessH,
          )}
          fill={successColor}
          opacity={hovered === null || hovered === '_success' ? 0.35 : 0.12}
          className="transition-opacity duration-200"
        />

        {/* --- Flow bands: Total → Affected --- */}
        <path
          d={bandPath(
            col0 + barW, totalY + normSuccessH, totalY + flowH,
            col1, affectedY, affectedY + normAffectedH,
          )}
          fill={affectedColor}
          opacity={hovered === null || hovered === '_affected' ? 0.35 : 0.12}
          className="transition-opacity duration-200"
        />

        {/* --- Flow bands: Affected → Each classifier --- */}
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
              opacity={hovered === null || isHovered ? 0.4 : 0.1}
              className="transition-opacity duration-200 cursor-pointer"
              onMouseEnter={() => setHovered(bar.classifier.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onClassifierClick?.(bar.classifier)}
            />
          );
        })}

        {/* --- Vertical bars --- */}

        {/* Total bar (col0) */}
        <rect
          x={col0} y={totalY}
          width={barW} height={flowH}
          rx={4}
          fill="rgba(255,255,255,0.15)"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth={1}
        />

        {/* Success bar (col1 top) */}
        <rect
          x={col1} y={successY}
          width={barW} height={normSuccessH}
          rx={4}
          fill={successColor}
          opacity={0.7}
        />

        {/* Affected bar (col1 bottom) */}
        <rect
          x={col1} y={affectedY}
          width={barW} height={normAffectedH}
          rx={4}
          fill={affectedColor}
          opacity={0.7}
        />

        {/* Classifier bars (col2) */}
        {classifierBars.map((bar, i) => {
          const isHovered = hovered === bar.classifier.id;
          return (
            <rect
              key={bar.classifier.id}
              x={col2} y={bar.y}
              width={barW} height={bar.h}
              rx={4}
              fill={classifierColors[i]}
              opacity={isHovered ? 1 : 0.8}
              stroke={isHovered ? '#fff' : 'none'}
              strokeWidth={1.5}
              className="transition-all duration-200 cursor-pointer"
              onMouseEnter={() => setHovered(bar.classifier.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onClassifierClick?.(bar.classifier)}
            />
          );
        })}

        {/* --- Labels --- */}

        {/* Total label */}
        <text x={col0 + barW / 2} y={totalY - 10} textAnchor="middle" className="fill-white/80 text-[11px] font-semibold">
          Total
        </text>
        <text x={col0 + barW / 2} y={totalY + flowH / 2} textAnchor="middle" dominantBaseline="middle" className="fill-white text-[11px] font-bold">
          {sle.totalUserMinutes}
        </text>

        {/* Success label */}
        <text x={col1 + barW + 8} y={successY + normSuccessH / 2 - 7} dominantBaseline="middle" className="fill-white/90 text-[11px] font-semibold">
          Success
        </text>
        <text x={col1 + barW + 8} y={successY + normSuccessH / 2 + 7} dominantBaseline="middle" className="fill-white/60 text-[10px]">
          {sle.successRate.toFixed(1)}% ({sle.totalUserMinutes - sle.affectedUserMinutes})
        </text>

        {/* Affected label */}
        {normAffectedH > 20 && (
          <>
            <text x={col1 + barW + 8} y={affectedY + normAffectedH / 2 - 7} dominantBaseline="middle" className="fill-white/90 text-[11px] font-semibold">
              Affected
            </text>
            <text x={col1 + barW + 8} y={affectedY + normAffectedH / 2 + 7} dominantBaseline="middle" className="fill-white/60 text-[10px]">
              {(100 - sle.successRate).toFixed(1)}% ({sle.affectedUserMinutes})
            </text>
          </>
        )}

        {/* Classifier labels */}
        {classifierBars.map((bar) => {
          const isHovered = hovered === bar.classifier.id;
          const labelY = bar.y + bar.h / 2;
          return (
            <g
              key={`label-${bar.classifier.id}`}
              className="cursor-pointer"
              onMouseEnter={() => setHovered(bar.classifier.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onClassifierClick?.(bar.classifier)}
            >
              <text
                x={col2 + barW + 10}
                y={labelY - 7}
                dominantBaseline="middle"
                className={`text-[11px] font-medium transition-all duration-200 ${isHovered ? 'fill-white' : 'fill-white/80'}`}
              >
                {bar.classifier.name}
              </text>
              <text
                x={col2 + barW + 10}
                y={labelY + 7}
                dominantBaseline="middle"
                className="fill-white/50 text-[10px]"
              >
                {bar.classifier.impactPercent.toFixed(1)}% &middot; {bar.classifier.affectedClients} {sle.id === 'ap_health' ? 'APs' : 'clients'}
              </text>
            </g>
          );
        })}

        {/* Column headers */}
        <text x={col0 + barW / 2} y={14} textAnchor="middle" className="fill-white/40 text-[9px] uppercase tracking-widest">
          Clients
        </text>
        <text x={col1 + barW / 2} y={14} textAnchor="middle" className="fill-white/40 text-[9px] uppercase tracking-widest">
          Outcome
        </text>
        <text x={col2 + barW / 2} y={14} textAnchor="middle" className="fill-white/40 text-[9px] uppercase tracking-widest">
          Root Cause
        </text>
      </svg>
    </div>
  );
}
