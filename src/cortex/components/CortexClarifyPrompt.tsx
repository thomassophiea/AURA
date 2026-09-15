import React from 'react';
import type { CortexClarification } from '@/services/cortexApiClient';

interface CortexClarifyPromptProps {
  clarification: CortexClarification;
  onChoose: (override: { siteNames?: string[]; level?: 'fleet' }) => void;
}

/**
 * The one question Cortex asks back.
 *
 * It fires only when guessing would mislead — two sites match the name, or the
 * page's site matches no telemetry at all and filtering on it would produce an
 * empty result that reads like good news. Everything else is answered with the
 * scope stated and a re-scope chip.
 *
 * This renders BEFORE any model call, so the ask costs nothing. That is what
 * makes it affordable to be careful here rather than confident.
 */
export const CortexClarifyPrompt: React.FC<CortexClarifyPromptProps> = ({
  clarification,
  onChoose,
}) => (
  <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
    <p className="text-xs leading-relaxed text-amber-100/90">{clarification.question}</p>

    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {clarification.candidates.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChoose({ siteNames: [c.value] })}
          className="rounded-full border border-amber-400/40 bg-amber-900/30 px-2.5 py-1 text-xs text-amber-100 transition-colors hover:border-amber-300/70 hover:bg-amber-900/50"
        >
          {c.label}
        </button>
      ))}

      <button
        type="button"
        onClick={() => onChoose({ level: 'fleet' })}
        className="rounded-full border border-white/20 px-2.5 py-1 text-xs text-white/70 transition-colors hover:border-white/40 hover:text-white"
      >
        {clarification.allOption.label}
      </button>
    </div>

    {clarification.unresolved.length ? (
      <p className="mt-2 text-[11px] text-amber-200/50">
        No site matched {clarification.unresolved.map((u) => `"${u}"`).join(', ')}.
      </p>
    ) : null}
  </div>
);
