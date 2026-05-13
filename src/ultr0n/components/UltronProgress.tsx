import React from 'react';

interface UltronProgressProps {
  stage: 'detecting' | 'planning' | 'fetching' | 'classifying' | 'generating';
}

const STAGE_LABELS: Record<UltronProgressProps['stage'], string> = {
  detecting: 'Detecting intent…',
  planning: 'Planning API calls…',
  fetching: 'Fetching live evidence…',
  classifying: 'Classifying root cause…',
  generating: 'Generating answer…',
};

export const UltronProgress: React.FC<UltronProgressProps> = ({ stage }) => (
  <div className="flex items-center gap-2 text-sm text-white/60 py-2">
    <span className="inline-block h-3 w-3 rounded-full bg-violet-500 animate-pulse" />
    <span>{STAGE_LABELS[stage]}</span>
  </div>
);
