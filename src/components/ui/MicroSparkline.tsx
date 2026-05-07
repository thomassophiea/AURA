interface MicroSparklineProps {
  /** Series of numeric values to render. Empty array = no render. */
  data: number[];
  /** Width in px. Default 60. */
  width?: number;
  /** Height in px. Default 18. */
  height?: number;
  /** Stroke color. Defaults to amber via CSS var. */
  stroke?: string;
  /** Stroke width. Default 1.25. */
  strokeWidth?: number;
  /** Whether to fill the area under the curve. Default true. */
  filled?: boolean;
  /** ARIA label for screen readers. */
  ariaLabel?: string;
  className?: string;
}

/**
 * MicroSparkline — minimal SVG sparkline. No axes, no grid, no tooltip.
 * Pure presentational; the caller passes the data array. Intended for
 * inline placement inside KPI card feet.
 */
export function MicroSparkline({
  data,
  width = 60,
  height = 18,
  stroke = 'var(--aura-amber)',
  strokeWidth = 1.25,
  filled = true,
  ariaLabel,
  className,
}: MicroSparklineProps) {
  if (!data || data.length < 2) return null;

  // Filter out non-finite values; if too few remain, bail.
  const series = data.filter((v) => Number.isFinite(v));
  if (series.length < 2) return null;

  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const stepX = width / (series.length - 1);
  const padY = strokeWidth + 1;
  const usableH = height - padY * 2;

  const points = series.map((v, i) => {
    const x = i * stepX;
    const y = padY + usableH - ((v - min) / range) * usableH;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const linePath = `M${points.join(' L')}`;
  const areaPath = filled
    ? `${linePath} L${(series.length - 1) * stepX},${height} L0,${height} Z`
    : '';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={ariaLabel ?? 'trend sparkline'}
    >
      {filled && <path d={areaPath} fill={stroke} fillOpacity={0.15} stroke="none" />}
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
