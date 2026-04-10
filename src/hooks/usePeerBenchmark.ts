import { useState, useMemo, useCallback } from 'react';
import {
  BenchmarkMetrics,
  BenchmarkScore,
  Recommendation,
  VERTICALS,
  SELF_BENCHMARK_WINDOWS,
  calculateBenchmarkScore,
  calculateSelfBenchmarkScore,
  generateRecommendations,
  generateMockHistoricalMetrics,
} from '../services/peerBenchmarkData';

export type BenchmarkMode = 'vertical' | 'self';

interface UsePeerBenchmarkReturn {
  selectedVertical: string;
  setSelectedVertical: (id: string) => void;
  benchmarkMode: BenchmarkMode;
  setBenchmarkMode: (mode: BenchmarkMode) => void;
  selfWindow: number;
  setSelfWindow: (days: number) => void;
  score: BenchmarkScore;
  recommendations: Recommendation[];
  currentMetrics: BenchmarkMetrics;
}

// Simulated "current network" metrics — in production these come from SLE engine
function getCurrentNetworkMetrics(): BenchmarkMetrics {
  return {
    avgThroughput: 187.4,
    apUptime: 99.2,
    roamingSuccessRate: 94.7,
    meanTimeToAssociate: 4.1,
    clientDensityPerAP: 28.3,
    highBandAdoption: 61.3,
  };
}

export function usePeerBenchmark(): UsePeerBenchmarkReturn {
  const [selectedVertical, setSelectedVertical] = useState('education');
  const [benchmarkMode, setBenchmarkMode] = useState<BenchmarkMode>('vertical');
  const [selfWindow, setSelfWindow] = useState(SELF_BENCHMARK_WINDOWS[0].days);

  const currentMetrics = useMemo(() => getCurrentNetworkMetrics(), []);

  const score = useMemo(() => {
    if (benchmarkMode === 'self') {
      const historical = generateMockHistoricalMetrics(currentMetrics, selfWindow);
      return calculateSelfBenchmarkScore(currentMetrics, historical);
    }

    const vertical = VERTICALS.find((v) => v.id === selectedVertical) || VERTICALS[0];
    return calculateBenchmarkScore(currentMetrics, vertical);
  }, [benchmarkMode, selectedVertical, selfWindow, currentMetrics]);

  const recommendations = useMemo(() => generateRecommendations(score), [score]);

  const handleSetVertical = useCallback((id: string) => {
    setBenchmarkMode('vertical');
    setSelectedVertical(id);
  }, []);

  return {
    selectedVertical,
    setSelectedVertical: handleSetVertical,
    benchmarkMode,
    setBenchmarkMode,
    selfWindow,
    setSelfWindow,
    score,
    recommendations,
    currentMetrics,
  };
}
