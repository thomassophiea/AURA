import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface UltronEvidenceAccordionProps {
  apiEvidenceUsed: string[];
  missingData?: string[];
}

export const UltronEvidenceAccordion: React.FC<UltronEvidenceAccordionProps> = ({
  apiEvidenceUsed,
  missingData = [],
}) => {
  const [open, setOpen] = useState(false);

  if (!apiEvidenceUsed.length && !missingData.length) return null;

  return (
    <div className="mt-2 rounded-md border border-white/10 bg-white/5 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-white/50 hover:text-white/80 transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span>
          Evidence: {apiEvidenceUsed.length} APIs called
          {missingData.length > 0 && `, ${missingData.length} missing`}
        </span>
      </button>

      {open && (
        <div className="border-t border-white/10 px-3 pb-3 pt-2 space-y-2">
          {apiEvidenceUsed.length > 0 && (
            <div>
              <p className="mb-1 font-medium text-white/40 uppercase tracking-wide text-[10px]">
                Fetched
              </p>
              <ul className="space-y-0.5">
                {apiEvidenceUsed.map((api) => (
                  <li key={api} className="font-mono text-white/60">
                    {api}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {missingData.length > 0 && (
            <div>
              <p className="mb-1 font-medium text-orange-400/70 uppercase tracking-wide text-[10px]">
                Missing / No data
              </p>
              <ul className="space-y-0.5">
                {missingData.map((api) => (
                  <li key={api} className="font-mono text-orange-400/60">
                    {api}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
