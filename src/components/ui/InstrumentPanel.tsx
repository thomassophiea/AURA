import { ReactNode, KeyboardEvent } from 'react';
import { cn } from './utils';

interface InstrumentPanelProps {
  /** Channel code, e.g. "CH-01". Rendered in amber mono. */
  channel: string;
  /** Eyebrow label after the channel code, e.g. "Access Points". */
  label: string;
  /** Optional icon (Lucide icon, sized by the panel). */
  icon?: ReactNode;
  /** Big numeric value (rendered in Fraunces serif). Strings allowed for "—". */
  value: ReactNode;
  /** Unit suffix beside the value (rendered in Plex Mono amber), e.g. "AP", "MBPS". */
  unit?: string;
  /** Optional left-side foot text. Use the `tone` prop or wrap your own with className. */
  footLeft?: ReactNode;
  /** Optional right-side foot text. */
  footRight?: ReactNode;
  /** Foot text tone, applied to footLeft only by default. */
  footLeftTone?: 'good' | 'warn' | 'bad' | 'default';
  /** Foot text tone, applied to footRight. */
  footRightTone?: 'good' | 'warn' | 'bad' | 'default';
  /** Click handler — when present, the panel becomes a button with role + tabIndex. */
  onClick?: () => void;
  /** aria-label override for click handlers. */
  ariaLabel?: string;
  /** Stagger reveal index (0..N). Each step delays the entry animation by 60ms. */
  revealIndex?: number;
  /** Optional extra className. */
  className?: string;
}

/**
 * InstrumentPanel — Observatory KPI card primitive.
 *
 * Visual: hairline grid inset, top-left + bottom-right corner ticks,
 * monumental Fraunces value, amber Plex Mono channel + unit.
 * The CSS lives in src/index.css (.aura-kpi-* classes added in 851a6ea).
 */
export function InstrumentPanel({
  channel,
  label,
  icon,
  value,
  unit,
  footLeft,
  footRight,
  footLeftTone = 'good',
  footRightTone = 'default',
  onClick,
  ariaLabel,
  revealIndex,
  className,
}: InstrumentPanelProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  const toneClass = (tone: 'good' | 'warn' | 'bad' | 'default') => {
    switch (tone) {
      case 'good':
        return 'aura-kpi-foot-good';
      case 'warn':
        return 'aura-kpi-foot-warn';
      case 'bad':
        return 'aura-kpi-foot-bad';
      default:
        return '';
    }
  };

  // Stagger reveal: when revealIndex is provided, override the default
  // 1n-child cascade with an explicit delay so panels can be composed
  // outside the original 4-card grid context.
  const staggerStyle =
    typeof revealIndex === 'number' ? { animationDelay: `${120 + revealIndex * 60}ms` } : undefined;

  return (
    <div
      className={cn('aura-kpi', className)}
      onClick={onClick}
      onKeyDown={onClick ? handleKeyDown : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : -1}
      aria-label={ariaLabel}
      style={staggerStyle}
    >
      <div className="aura-kpi-eyebrow">
        <span>
          <span className="aura-kpi-eyebrow-channel">{channel}</span> · {label}
        </span>
        {icon}
      </div>
      <div className="aura-kpi-figure">
        {value}
        {unit ? <span className="aura-kpi-figure-unit">{unit}</span> : null}
      </div>
      {(footLeft || footRight) && (
        <div className="aura-kpi-foot">
          <span className={toneClass(footLeftTone)}>{footLeft}</span>
          <span className={toneClass(footRightTone)}>{footRight}</span>
        </div>
      )}
      <span className="aura-kpi-corner-br" aria-hidden="true" />
    </div>
  );
}
