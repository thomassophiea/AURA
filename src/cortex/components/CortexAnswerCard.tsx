import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { CortexWirelessAnswer } from '@/cortex/types';
import { ROOT_CAUSE_LABELS, ROOT_CAUSE_COLORS, CONFIDENCE_COLORS } from '@/cortex/types';
import { CortexEvidenceAccordion } from './CortexEvidenceAccordion';
import { CortexFollowUpChips } from './CortexFollowUpChips';

interface CortexAnswerCardProps {
  answer: CortexWirelessAnswer;
  onFollowUp: (chip: string) => void;
  onConfirm?: (token: string) => void;
}

export const CortexAnswerCard: React.FC<CortexAnswerCardProps> = ({
  answer,
  onFollowUp,
  onConfirm,
}) => {
  const rcColor = ROOT_CAUSE_COLORS[answer.rootCause.category];
  const confColor = CONFIDENCE_COLORS[answer.confidence];

  if (answer.requiresConfirmation) {
    return (
      <div className="rounded-lg border border-orange-500/40 bg-orange-900/20 p-4 space-y-3">
        <div className="flex items-start gap-2 text-orange-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-sm">{answer.requiresConfirmation.action}</p>
            <p className="text-xs text-orange-300/70 mt-0.5">
              {answer.requiresConfirmation.description}
            </p>
          </div>
        </div>
        {onConfirm && (
          <button
            type="button"
            onClick={() => onConfirm(answer.requiresConfirmation!.confirmationToken)}
            className="rounded-md bg-orange-600 hover:bg-orange-500 px-3 py-1.5 text-xs font-medium text-white transition-colors"
          >
            Confirm &amp; Execute
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${rcColor}`}>
          {ROOT_CAUSE_LABELS[answer.rootCause.category]}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${confColor}`}>
          {answer.confidence} confidence
        </span>
      </div>

      {/* Narrative */}
      <div className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">
        {answer.narrative}
      </div>

      {/* Evidence accordion */}
      <CortexEvidenceAccordion
        apiEvidenceUsed={answer.apiEvidenceUsed}
        missingData={answer.missingData}
      />

      {/* Follow-up chips */}
      <CortexFollowUpChips chips={answer.followUpChips} onSelect={onFollowUp} />
    </div>
  );
};
