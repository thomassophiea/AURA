import React from 'react';
import type { CortexScope, CortexImpact } from '@/services/cortexApiClient';

interface CortexScopeBarProps {
  scope?: CortexScope;
  impact?: CortexImpact | null;
  /** Re-ask the same question at a different scope. */
  onRescope?: (override: { siteNames?: string[]; level?: 'fleet' }) => void;
  /** Sites the operator can switch to, when we know them. */
  knownSites?: string[];
}

/**
 * What this answer actually covered.
 *
 * The defect this exists for: an operator on one site asked "do we have unhappy
 * clients?" and received an estate-wide count with nothing saying so. The
 * number was true and the reader's conclusion was wrong, and there was no
 * visible cue anywhere that the two did not match.
 *
 * So scope is never implied. It is stated on every answer, and the way to
 * change it is one click rather than a re-typed question.
 */
export const CortexScopeBar: React.FC<CortexScopeBarProps> = ({
  scope,
  impact,
  onRescope,
  knownSites = [],
}) => {
  if (!scope) return null;

  const label =
    scope.level === 'fleet'
      ? 'All sites'
      : scope.level === 'entity'
        ? 'One device'
        : (scope.siteNames ?? []).join(', ') || 'One site';

  const alternatives =
    scope.level === 'fleet'
      ? knownSites.slice(0, 4).map((name) => ({ label: `Just ${name}`, override: { siteNames: [name] } }))
      : scope.level === 'site'
        ? [{ label: 'All sites', override: { level: 'fleet' as const } }]
        : [];

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-900/20 px-2 py-0.5 text-violet-200"
        title={scope.reason}
      >
        <span className="opacity-70">Covered:</span>
        <span className="font-medium">{label}</span>
      </span>

      {impact ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/70">
          <span className="font-medium text-white/90">
            {impact.affected}
            {impact.total !== null ? ` of ${impact.total}` : ''}
          </span>
          <span>{impact.unit} affected</span>
        </span>
      ) : null}

      {onRescope
        ? alternatives.map((alt) => (
            <button
              key={alt.label}
              type="button"
              onClick={() => onRescope(alt.override)}
              className="rounded-full border border-white/15 px-2 py-0.5 text-white/60 transition-colors hover:border-violet-400/60 hover:text-violet-200"
            >
              {alt.label}
            </button>
          ))
        : null}
    </div>
  );
};
