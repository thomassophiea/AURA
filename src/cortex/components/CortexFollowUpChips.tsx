import React from 'react';

interface CortexFollowUpChipsProps {
  chips: string[];
  onSelect: (chip: string) => void;
}

export const CortexFollowUpChips: React.FC<CortexFollowUpChipsProps> = ({ chips, onSelect }) => {
  if (!chips.length) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => onSelect(chip)}
          className="rounded-full border border-violet-500/40 bg-violet-900/20 px-2.5 py-1 text-xs text-violet-300 hover:bg-violet-900/40 hover:border-violet-400/60 transition-colors"
        >
          {chip}
        </button>
      ))}
    </div>
  );
};
