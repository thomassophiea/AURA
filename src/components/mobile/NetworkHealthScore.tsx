/**
 * NetworkHealthScore - Single 0-100 health score
 * Large circular indicator on home screen
 */

import React from 'react';
import { Activity, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface NetworkHealthScoreProps {
  score: number; // 0-100
  onClick?: () => void;
}

export function NetworkHealthScore({ score, onClick }: NetworkHealthScoreProps) {
  const getScoreStatus = (s: number) => {
    if (s >= 90) return { label: 'Excellent', color: 'text-green-500', icon: CheckCircle2 };
    if (s >= 70) return { label: 'Good', color: 'text-blue-500', icon: Activity };
    if (s >= 50) return { label: 'Fair', color: 'text-yellow-500', icon: AlertTriangle };
    return { label: 'Poor', color: 'text-red-500', icon: XCircle };
  };

  const status = getScoreStatus(score);
  const StatusIcon = status.icon;

  // Calculate stroke dasharray for circular progress
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <button
      onClick={onClick}
      className={`
        relative w-full p-6 rounded-xl border-2 bg-card
        transition-all active:scale-95
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
        border-border
      `}
    >
      <div className="flex flex-col items-center">
        {/* Circular Progress */}
        <div className="relative w-40 h-40">
          <svg className="transform -rotate-90 w-40 h-40">
            {/* Background circle */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              className="text-muted"
            />
            {/* Progress circle */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className={`${status.color} transition-all duration-1000`}
              strokeLinecap="round"
            />
          </svg>
          {/* Score */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <StatusIcon className={`h-8 w-8 mb-1 ${status.color}`} />
            <span className={`text-4xl font-bold ${status.color}`}>
              {score}
            </span>
          </div>
        </div>

        {/* Label */}
        <div className="mt-4 text-center">
          <p className="text-sm text-muted-foreground font-medium">Network Experience</p>
          <p className={`text-lg font-semibold mt-1 ${status.color}`}>
            {status.label}
          </p>
        </div>
      </div>
    </button>
  );
}
