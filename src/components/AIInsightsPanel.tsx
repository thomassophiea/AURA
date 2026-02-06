/**
 * AI Insights Panel
 * 
 * Displays ranked AI-generated insight cards based on current metrics and context.
 * Each card shows: what happened, why it matters, evidence, and recommended action.
 */

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Alert, AlertDescription } from './ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { 
  Brain, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp,
  Radio, Activity, Zap, Users, Wifi, Clock, ExternalLink, Lightbulb,
  CheckCircle2, TrendingUp, TrendingDown, Target, Wrench, BarChart3,
  ArrowUp, ArrowDown, Minus, Timer
} from 'lucide-react';
import { cn } from './ui/utils';
import { useOperationalContext } from '../hooks/useOperationalContext';
import { 
  generateInsights, getInsightsSummary, getInsightsByGroup,
  INSIGHT_GROUP_META,
  type InsightCard, type MetricsSnapshot, type InsightGroup
} from '../services/aiInsights';
import { getEnvironmentProfile } from '../config/environmentProfiles';

interface AIInsightsPanelProps {
  metrics: MetricsSnapshot;
  className?: string;
  groupedView?: boolean;
}

const categoryIcons: Record<string, React.ElementType> = {
  rf_quality: Radio,
  interference: Zap,
  channel_utilization: Activity,
  client_performance: Users,
  connectivity: Wifi,
  capacity: TrendingUp,
  anomaly: AlertTriangle,
  trending: BarChart3,
  predictive: Timer,
  historical: Clock
};

const groupIcons: Record<InsightGroup, React.ElementType> = {
  network_health: Activity,
  capacity_planning: TrendingUp,
  anomaly_detection: AlertTriangle,
  predictive_maintenance: Wrench
};

const groupColors: Record<InsightGroup, string> = {
  network_health: 'blue',
  capacity_planning: 'purple',
  anomaly_detection: 'amber',
  predictive_maintenance: 'red'
};

const severityStyles: Record<string, { bg: string; border: string; icon: React.ElementType }> = {
  critical: { 
    bg: 'bg-red-500/10', 
    border: 'border-red-500/30', 
    icon: AlertCircle 
  },
  warning: { 
    bg: 'bg-amber-500/10', 
    border: 'border-amber-500/30', 
    icon: AlertTriangle 
  },
  info: { 
    bg: 'bg-blue-500/10', 
    border: 'border-blue-500/30', 
    icon: Info 
  }
};

export function AIInsightsPanel({ metrics, className }: AIInsightsPanelProps) {
  const { ctx, setTimeCursor } = useOperationalContext();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  
  const profile = getEnvironmentProfile(ctx.environmentProfile.id);
  
  // Generate insights from current metrics
  const insights = useMemo(() => {
    return generateInsights(metrics, profile);
  }, [metrics, profile]);
  
  const summary = useMemo(() => getInsightsSummary(insights), [insights]);
  
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

  if (insights.length === 0) {
    return (
      <Card className={cn("border-green-500/20", className)}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <CardTitle className="text-base">Network Health</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <p className="font-medium text-green-500">All Systems Healthy</p>
            <p className="text-sm text-muted-foreground mt-1">
              No issues detected for {profile.name} environment
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-500" />
            <CardTitle className="text-base">AI Insights</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {summary.critical > 0 && (
              <Badge variant="destructive" className="text-xs">
                {summary.critical} Critical
              </Badge>
            )}
            {summary.warning > 0 && (
              <Badge variant="secondary" className="text-xs bg-amber-500/20 text-amber-600">
                {summary.warning} Warning
              </Badge>
            )}
            {summary.info > 0 && (
              <Badge variant="outline" className="text-xs">
                {summary.info} Info
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          {summary.total} insight{summary.total !== 1 ? 's' : ''} for {profile.name} • 
          Ranked by impact and confidence
        </CardDescription>
      </CardHeader>
      
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          <div className="p-4 pt-0 space-y-3">
            {insights.map((insight, index) => {
              const styles = severityStyles[insight.severity];
              const CategoryIcon = categoryIcons[insight.category] || AlertTriangle;
              const isExpanded = expandedIds.has(insight.id);
              
              return (
                <Collapsible 
                  key={insight.id} 
                  open={isExpanded}
                  onOpenChange={() => toggleExpanded(insight.id)}
                >
                  <div className={cn(
                    "rounded-lg border-2 transition-all",
                    styles.bg,
                    styles.border,
                    isExpanded && "ring-2 ring-purple-500/20"
                  )}>
                    {/* Header - always visible */}
                    <CollapsibleTrigger className="w-full">
                      <div className="p-3 flex items-start gap-3">
                        <div className={cn(
                          "p-2 rounded-lg",
                          insight.severity === 'critical' && "bg-red-500/20",
                          insight.severity === 'warning' && "bg-amber-500/20",
                          insight.severity === 'info' && "bg-blue-500/20"
                        )}>
                          <CategoryIcon className={cn(
                            "h-4 w-4",
                            insight.severity === 'critical' && "text-red-500",
                            insight.severity === 'warning' && "text-amber-500",
                            insight.severity === 'info' && "text-blue-500"
                          )} />
                        </div>
                        
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{insight.title}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 h-4">
                              {insight.scope}
                            </Badge>
                            {/* Trend indicator */}
                            {insight.trend && (
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "text-[10px] px-1.5 h-4 gap-0.5",
                                  insight.trend.direction === 'improving' && "border-green-500/20 text-green-500",
                                  insight.trend.direction === 'degrading' && "border-red-500/20 text-red-500",
                                  insight.trend.direction === 'stable' && "border-gray-500/50 text-gray-600"
                                )}
                              >
                                {insight.trend.direction === 'improving' && <ArrowUp className="h-2.5 w-2.5" />}
                                {insight.trend.direction === 'degrading' && <ArrowDown className="h-2.5 w-2.5" />}
                                {insight.trend.direction === 'stable' && <Minus className="h-2.5 w-2.5" />}
                                {insight.trend.changePercent.toFixed(0)}%
                              </Badge>
                            )}
                            {/* Prediction indicator */}
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
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {insight.whyItMatters}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Score</p>
                            <p className="text-sm font-semibold">{(insight.rankScore * 100).toFixed(0)}</p>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    
                    {/* Expanded content */}
                    <CollapsibleContent>
                      <div className="px-3 pb-3 space-y-3 border-t border-border/50 pt-3 mx-3">
                        {/* Evidence */}
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            Evidence
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {insight.evidence.map((ev, i) => (
                              <button
                                key={i}
                                onClick={() => handleEvidenceClick(ev.timestamp)}
                                className={cn(
                                  "p-2 rounded-md bg-background/50 text-left transition-colors",
                                  ev.timestamp && "hover:bg-purple-500/10 cursor-pointer"
                                )}
                              >
                                <p className="text-[10px] text-muted-foreground">{ev.label}</p>
                                <p className="text-sm font-medium">
                                  {ev.value}{ev.unit && <span className="text-xs text-muted-foreground ml-0.5">{ev.unit}</span>}
                                </p>
                                {ev.timestamp && (
                                  <p className="text-[10px] text-purple-500 mt-0.5">
                                    <Clock className="h-2.5 w-2.5 inline mr-0.5" />
                                    Click to view
                                  </p>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                        
                        {/* Recommended Action */}
                        <div className="p-2 rounded-md bg-green-500/10 border border-green-500/20">
                          <p className="text-xs font-medium text-green-500 mb-1 flex items-center gap-1">
                            <Lightbulb className="h-3 w-3" />
                            Recommended Action
                          </p>
                          <p className="text-xs">{insight.recommendedAction}</p>
                        </div>
                        
                        {/* Ranking factors */}
                        <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-1">
                          <span>Impact: {(insight.impact * 100).toFixed(0)}%</span>
                          <span>Confidence: {(insight.confidence * 100).toFixed(0)}%</span>
                          <span>Recurrence: {(insight.recurrence * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
