/**
 * SLE Classifier Tree - Expandable classifier rows with impact bars
 * Designed to render on full-color gradient backgrounds (white text)
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import type { SLEClassifier } from '../../types/sle';

interface SLEClassifierTreeProps {
  classifiers: SLEClassifier[];
  onClassifierClick?: (classifier: SLEClassifier) => void;
}

export function SLEClassifierTree({ classifiers, onClassifierClick }: SLEClassifierTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderClassifier = (c: SLEClassifier, depth = 0) => {
    const hasSubs = c.subClassifiers && c.subClassifiers.length > 0;
    const isExpanded = expanded.has(c.id);

    return (
      <div key={c.id}>
        <div
          className={`flex items-center gap-2 py-1.5 px-2 rounded hover:bg-white/10 cursor-pointer transition-colors ${depth > 0 ? 'ml-4' : ''}`}
          onClick={() => {
            if (hasSubs) toggle(c.id);
            else onClassifierClick?.(c);
          }}
        >
          {/* Expand icon */}
          <div className="w-4 flex-shrink-0">
            {hasSubs && (
              isExpanded
                ? <ChevronDown className="h-3.5 w-3.5 text-white/50" />
                : <ChevronRight className="h-3.5 w-3.5 text-white/50" />
            )}
          </div>

          {/* Name */}
          <span className="text-xs font-medium text-white/90 flex-shrink-0 min-w-[120px]">{c.name}</span>

          {/* Impact bar - white-based for gradient backgrounds */}
          <div className="flex-1 min-w-[60px]">
            <div className="h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full rounded-full bg-white/60 transition-all"
                style={{ width: `${Math.min(c.impactPercent, 100)}%` }}
              />
            </div>
          </div>

          {/* Impact % */}
          <span className="text-xs text-white/50 w-12 text-right flex-shrink-0">
            {c.impactPercent > 0 ? `${c.impactPercent.toFixed(1)}%` : '-'}
          </span>

          {/* Affected count */}
          <div className="flex items-center gap-1 text-xs text-white/50 w-16 justify-end flex-shrink-0">
            <Users className="h-3 w-3" />
            {c.affectedClients}
          </div>
        </div>

        {/* Sub-classifiers */}
        {hasSubs && isExpanded && (
          <div className="border-l border-white/15 ml-4">
            {c.subClassifiers!.map(sub => renderClassifier(sub, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-0.5">
      {classifiers.map(c => renderClassifier(c))}
    </div>
  );
}
