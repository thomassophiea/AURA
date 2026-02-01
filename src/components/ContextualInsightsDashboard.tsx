/**
 * Contextual Insights Dashboard
 * 
 * Organized view of AI-generated insights grouped by:
 * - Network Health: RFQI, connectivity, interference
 * - Capacity Planning: client density, throughput trends, load forecasting
 * - Anomaly Detection: unusual patterns, trend deviations, spikes
 * - Predictive Maintenance: AP health predictions, failure forecasting
 */

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { Progress } from './ui/progress';
import {
  Brain, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp,
  Radio, Activity, Zap, Users, Wifi, Clock, Lightbulb, Sparkles,
  CheckCircle2, TrendingUp, TrendingDown, Target, Wrench, BarChart3,
  ArrowUp, ArrowDown, Minus, Timer, RefreshCw, Database
} from 'lucide-react';
import { cn } from './ui/utils';
import { useOperationalContext } from '../hooks/useOperationalContext';
import {
  generateInsights, getInsightsSummary, getInsightsByGroup,
  INSIGHT_GROUP_META,
  type InsightCard, type MetricsSnapshot, type InsightGroup
} from '../services/aiInsights';
import { getEnvironmentProfile } from '../config/environmentProfiles';
import { RFQualityWidgetAnchored } from './RFQualityWidgetAnchored';
import { TimelineCursorControls } from './TimelineCursorControls';
import { EnvironmentProfileSelector } from './EnvironmentProfileSelector';
import { aiBaselineService } from '../services/aiBaselineService';
import { SaveToWorkspace } from './SaveToWorkspace';

interface ContextualInsightsDashboardProps {
  metrics: MetricsSnapshot;
  rfqiTimeSeries?: Array<{ timestamp: number }>;
  className?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const groupIcons: Record<InsightGroup, React.ElementType> = {
  network_health: Activity,
  capacity_planning: TrendingUp,
  anomaly_detection: AlertTriangle,
  predictive_maintenance: Wrench
};

const groupStyles: Record<InsightGroup, { bg: string; border: string; iconColor: string }> = {
  network_health: {
    bg: 'bg-blue-500/5',
    border: 'border-blue-500/20',
    iconColor: 'text-blue-500'
  },
  capacity_planning: {
    bg: 'bg-purple-500/5',
    border: 'border-purple-500/20',
    iconColor: 'text-purple-500'
  },
  anomaly_detection: {
    bg: 'bg-amber-500/5',
    border: 'border-amber-500/20',
    iconColor: 'text-amber-500'
  },
  predictive_maintenance: {
    bg: 'bg-red-500/5',
    border: 'border-red-500/20',
    iconColor: 'text-red-500'
  }
};

const severityStyles: Record<string, { bg: string; border: string }> = {
  critical: { bg: 'bg-red-500/10', border: 'border-red-500/30' },
  warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30' }
};

export function ContextualInsightsDashboard({ 
  metrics, 
  rfqiTimeSeries = [],
  className,
  onRefresh,
  isRefreshing
}: ContextualInsightsDashboardProps) {
  const { ctx, setTimeCursor } = useOperationalContext();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<InsightGroup | 'all'>('all');
  const [aiBaselineSummary, setAiBaselineSummary] = useState<ReturnType<typeof aiBaselineService.getSummary> | null>(null);
  
  const profile = getEnvironmentProfile(ctx.environmentProfile.id);
  const isAIProfile = ctx.environmentProfile.id === 'AI_BASELINE';
  
  // Load AI Baseline summary when AI profile is selected
  useEffect(() => {
    if (isAIProfile) {
      setAiBaselineSummary(aiBaselineService.getSummary());
    }
  }, [isAIProfile]);
  
  const insights = useMemo(() => {
    return generateInsights(metrics, profile);
  }, [metrics, profile]);
  
  const summary = useMemo(() => getInsightsSummary(insights), [insights]);
  const groupedInsights = useMemo(() => getInsightsByGroup(insights), [insights]);
  
  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  
  const handleEvidenceClick = (timestamp?: number) => {
    if (timestamp) {
      setTimeCursor(timestamp);
    }
  };

  const renderInsightCard = (insight: InsightCard) => {
    const styles = severityStyles[insight.severity];
    const isExpanded = expandedIds.has(insight.id);
    
    return (
      <Collapsible 
        key={insight.id} 
        open={isExpanded}
        onOpenChange={() => toggleExpanded(insight.id)}
      >
        <div className={cn(
          "rounded-lg border transition-all",
          styles.bg,
          styles.border,
          isExpanded && "ring-1 ring-purple-500/20"
        )}>
          <CollapsibleTrigger className="w-full">
            <div className="p-3 flex items-start gap-3">
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{insight.title}</span>
                  {insight.trend && (
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[10px] px-1.5 h-4 gap-0.5",
                        insight.trend.direction === 'improving' && "border-green-500/50 text-green-600",
                        insight.trend.direction === 'degrading' && "border-red-500/50 text-red-600"
                      )}
                    >
                      {insight.trend.direction === 'improving' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                      {insight.trend.changePercent.toFixed(0)}%
                    </Badge>
                  )}
                  {insight.prediction && (
                    <Badge 
                      variant="outline" 
                      className="text-[10px] px-1.5 h-4 gap-0.5 border-purple-500/50 text-purple-600"
                    >
                      <Timer className="h-2.5 w-2.5" />
                      {insight.prediction.timeframe}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                  {insight.whyItMatters}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Badge 
                  variant={insight.severity === 'critical' ? 'destructive' : insight.severity === 'warning' ? 'secondary' : 'outline'}
                  className="text-[10px] h-5"
                >
                  {insight.severity}
                </Badge>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <div className="px-3 pb-3 space-y-2 border-t border-border/50 pt-2 mx-3">
              {/* Evidence */}
              <div className="grid grid-cols-2 gap-1.5">
                {insight.evidence.map((ev, i) => (
                  <button
                    key={i}
                    onClick={() => handleEvidenceClick(ev.timestamp)}
                    className={cn(
                      "p-1.5 rounded text-left bg-background/50 text-xs",
                      ev.timestamp && "hover:bg-purple-500/10 cursor-pointer"
                    )}
                  >
                    <span className="text-muted-foreground">{ev.label}: </span>
                    <span className="font-medium">{ev.value}{ev.unit}</span>
                  </button>
                ))}
              </div>
              
              {/* Recommended Action */}
              <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
                <div className="flex items-start gap-1.5">
                  <Lightbulb className="h-3 w-3 text-green-600 mt-0.5 shrink-0" />
                  <p className="text-xs">{insight.recommendedAction}</p>
                </div>
              </div>
              
              {/* Prediction details */}
              {insight.prediction && (
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Timer className="h-3 w-3" />
                  <span>Likelihood: {(insight.prediction.likelihood * 100).toFixed(0)}% • Based on: {insight.prediction.basedOn}</span>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  };

  const renderGroupSection = (group: InsightGroup, groupInsights: InsightCard[]) => {
    const GroupIcon = groupIcons[group];
    const styles = groupStyles[group];
    const meta = INSIGHT_GROUP_META[group];
    
    if (groupInsights.length === 0) {
      return (
        <Card key={group} className={cn("border", styles.border, styles.bg)}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <GroupIcon className={cn("h-5 w-5", styles.iconColor)} />
              <CardTitle className="text-base">{meta.name}</CardTitle>
              <Badge variant="outline" className="text-xs">0</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-4 text-center">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm">No issues detected</span>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card key={group} className={cn("border", styles.border, styles.bg)}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GroupIcon className={cn("h-5 w-5", styles.iconColor)} />
              <CardTitle className="text-base">{meta.name}</CardTitle>
              <Badge
                variant={groupInsights.some(i => i.severity === 'critical') ? 'destructive' :
                         groupInsights.some(i => i.severity === 'warning') ? 'secondary' : 'outline'}
                className="text-xs"
              >
                {groupInsights.length}
              </Badge>
            </div>
            <SaveToWorkspace
              widgetId={`contextual-insights-${group}`}
              widgetType="insights_card"
              title={meta.name}
              endpointRefs={['contextual_insights.' + group]}
              sourcePage="contextual-insights"
              catalogId={`insights_${group}`}
            />
          </div>
          <CardDescription className="text-xs">{meta.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {groupInsights.slice(0, 3).map(renderInsightCard)}
          {groupInsights.length > 3 && (
            <Button variant="ghost" size="sm" className="w-full text-xs">
              View {groupInsights.length - 3} more insights
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-500" />
            <h2 className="text-lg font-semibold">Contextual Insights</h2>
          </div>
          <Badge variant="outline">
            {summary.total} insight{summary.total !== 1 ? 's' : ''}
          </Badge>
          {summary.critical > 0 && (
            <Badge variant="destructive">{summary.critical} critical</Badge>
          )}
          {summary.warning > 0 && (
            <Badge variant="secondary" className="bg-amber-500/20 text-amber-600">
              {summary.warning} warning
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <TimelineCursorControls 
            showNavigation={rfqiTimeSeries.length > 0}
            timeSeriesData={rfqiTimeSeries}
          />
          <EnvironmentProfileSelector showThresholds />
          {onRefresh && (
            <Button variant="outline" size="icon" onClick={onRefresh} disabled={isRefreshing}>
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          )}
        </div>
      </div>

      {/* RFQI Anchor Widget */}
      <RFQualityWidgetAnchored />

      {/* AI Baseline Status Banner */}
      {isAIProfile && aiBaselineSummary && (
        <Card className="border-purple-500/20 bg-gradient-to-r from-purple-500/5 to-blue-500/5">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Sparkles className="h-4 w-4 text-purple-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">AI Baseline Active</span>
                    <Badge variant="outline" className="text-[10px] h-4 border-purple-500/30 text-purple-400">
                      {aiBaselineSummary.confidenceLevel}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {aiBaselineSummary.confidenceDescription}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5" />
                  <span>{aiBaselineSummary.sampleCount} samples</span>
                </div>
                {aiBaselineSummary.timeRangeHours > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{aiBaselineSummary.timeRangeHours}h of data</span>
                  </div>
                )}
                {aiBaselineSummary.thresholds && (
                  <div className="hidden sm:flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] h-4 border-purple-500/20">
                      RFQI ≥{aiBaselineSummary.thresholds.rfqiTarget}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] h-4 border-purple-500/20">
                      Ch.Util ≤{aiBaselineSummary.thresholds.channelUtilizationPct}%
                    </Badge>
                  </div>
                )}
              </div>
            </div>
            {aiBaselineSummary.confidenceLevel !== 'high' && (
              <div className="mt-2">
                <Progress 
                  value={aiBaselineSummary.sampleCount >= 50 ? 100 : (aiBaselineSummary.sampleCount / 50) * 100} 
                  className="h-1 bg-purple-500/10"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {aiBaselineSummary.sampleCount < 50 
                    ? `${50 - aiBaselineSummary.sampleCount} more samples needed for high confidence`
                    : 'Baseline fully trained'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Insight Groups - 2x2 Grid (Anomaly & Predictive prioritized) */}
      <div className="grid gap-4 md:grid-cols-2">
        {renderGroupSection('anomaly_detection', groupedInsights.anomaly_detection)}
        {renderGroupSection('predictive_maintenance', groupedInsights.predictive_maintenance)}
        {renderGroupSection('network_health', groupedInsights.network_health)}
        {renderGroupSection('capacity_planning', groupedInsights.capacity_planning)}
      </div>

      {/* All Healthy State */}
      {insights.length === 0 && (
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              <p className="font-medium text-green-600">All Systems Healthy</p>
              <p className="text-sm text-muted-foreground mt-1">
                No issues detected for {profile.name} environment
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
