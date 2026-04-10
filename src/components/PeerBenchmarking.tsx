import { useState } from 'react';
import { Card, CardContent } from './ui/card';
import { cn } from './ui/utils';
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
  AlertCircle,
  History,
} from 'lucide-react';
import { usePeerBenchmark } from '../hooks/usePeerBenchmark';
import { VERTICALS, SELF_BENCHMARK_WINDOWS, Recommendation } from '../services/peerBenchmarkData';

function DeltaIndicator({ deltaPercent, isBetter, isNeutral }: {
  deltaPercent: number;
  isBetter: boolean;
  isNeutral: boolean;
}) {
  if (isNeutral) {
    return (
      <span className="text-muted-foreground flex items-center gap-1 text-sm">
        <Minus className="h-3 w-3" />
        <span>—</span>
      </span>
    );
  }

  return (
    <span className={cn(
      'flex items-center gap-1 text-sm',
      isBetter ? 'text-emerald-500' : 'text-orange-400'
    )}>
      {isBetter
        ? <TrendingUp className="h-3 w-3" />
        : <TrendingDown className="h-3 w-3" />
      }
      <span>{deltaPercent.toFixed(1)}%</span>
    </span>
  );
}

function RecommendationItem({ rec }: { rec: Recommendation }) {
  const severityIcon = {
    critical: <AlertCircle className="h-4 w-4 text-destructive" />,
    warning: <AlertTriangle className="h-4 w-4 text-orange-400" />,
    info: <Info className="h-4 w-4 text-blue-400" />,
  };

  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 shrink-0">{severityIcon[rec.severity]}</div>
      <div>
        <p className="text-sm font-medium text-foreground">{rec.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{rec.description}</p>
      </div>
    </div>
  );
}

export function PeerBenchmarking() {
  const {
    selectedVertical,
    setSelectedVertical,
    benchmarkMode,
    setBenchmarkMode,
    selfWindow,
    setSelfWindow,
    score,
    recommendations,
  } = usePeerBenchmark();

  const [showRecommendations, setShowRecommendations] = useState(false);

  const isSelf = benchmarkMode === 'self';

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Header row: title + score + tabs */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: Title and score */}
          <div className="flex items-center gap-3">
            <Trophy className="h-5 w-5 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <h3 className="text-base font-medium text-foreground">Peer Benchmarking</h3>
              {!isSelf && (
                <>
                  <span className="text-sm font-medium text-emerald-500">
                    Top {score.topPercent}%
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {score.overall}/100
                  </span>
                  <span className="text-xs text-muted-foreground">
                    · {score.peerCount.toLocaleString()} {score.vertical} peers
                  </span>
                </>
              )}
              {isSelf && (
                <span className="text-sm text-muted-foreground">
                  vs. your network {selfWindow} days ago
                </span>
              )}
            </div>
          </div>

          {/* Right: Vertical tabs + Self toggle */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {VERTICALS.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedVertical(v.id)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap',
                  !isSelf && selectedVertical === v.id
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                {v.name}
              </button>
            ))}
            <div className="w-px h-4 bg-border mx-1" />
            <button
              onClick={() => setBenchmarkMode(isSelf ? 'vertical' : 'self')}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1',
                isSelf
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <History className="h-3 w-3" />
              Self
            </button>
          </div>
        </div>

        {/* Self-benchmark window selector */}
        {isSelf && (
          <div className="flex items-center gap-2 mt-3">
            {SELF_BENCHMARK_WINDOWS.map((w) => (
              <button
                key={w.days}
                onClick={() => setSelfWindow(w.days)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  selfWindow === w.days
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        )}

        {/* Metrics rows */}
        <div className="mt-4 divide-y divide-border">
          {score.metrics.map((metric) => (
            <div
              key={metric.key}
              className="flex items-center justify-between py-2.5 first:pt-0"
            >
              <span className="text-sm text-muted-foreground">{metric.label}</span>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-foreground tabular-nums">
                  {metric.value}
                  {metric.unit ? ` ${metric.unit}` : ''}
                </span>
                <DeltaIndicator
                  deltaPercent={metric.deltaPercent}
                  isBetter={metric.isBetter}
                  isNeutral={metric.isNeutral}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Recommendations toggle */}
        {recommendations.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowRecommendations(!showRecommendations)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showRecommendations ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {showRecommendations ? 'Hide' : 'Show'} {recommendations.length} improvement recommendation{recommendations.length !== 1 ? 's' : ''}
            </button>

            {showRecommendations && (
              <div className="mt-2 divide-y divide-border">
                {recommendations.map((rec) => (
                  <RecommendationItem key={rec.id} rec={rec} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
