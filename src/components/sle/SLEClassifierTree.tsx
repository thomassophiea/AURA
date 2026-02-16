/**
 * SLE Classifier Tree - Expandable accordion of classifiers with impact bars
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import { Progress } from '../ui/progress';
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
          className={`flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer transition-colors ${depth > 0 ? 'ml-4' : ''}`}
          onClick={() => {
            if (hasSubs) toggle(c.id);
            else onClassifierClick?.(c);
          }}
        >
          {/* Expand icon */}
          <div className="w-4 flex-shrink-0">
            {hasSubs && (
              isExpanded
                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>

          {/* Name */}
          <span className="text-xs font-medium flex-shrink-0 min-w-[120px]">{c.name}</span>

          {/* Impact bar */}
          <div className="flex-1 min-w-[60px]">
            <Progress value={c.impactPercent} className="h-1.5" />
          </div>

          {/* Impact % */}
          <span className="text-xs text-muted-foreground w-12 text-right flex-shrink-0">
            {c.impactPercent > 0 ? `${c.impactPercent.toFixed(1)}%` : '-'}
          </span>

          {/* Affected count */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground w-16 justify-end flex-shrink-0">
            <Users className="h-3 w-3" />
            {c.affectedClients}
          </div>
        </div>

        {/* Sub-classifiers */}
        {hasSubs && isExpanded && (
          <div className="border-l border-border/50 ml-4">
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
