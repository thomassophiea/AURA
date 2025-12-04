import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { LucideIcon } from 'lucide-react';
import { TYPOGRAPHY, CARD_STYLES, ICON_SIZES, SPACING } from '../utils/ui-constants';
import { cn } from '../lib/utils';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  status?: 'healthy' | 'warning' | 'critical' | 'neutral';
  subtitle?: string;
  className?: string;
}

export function MetricCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  status = 'neutral',
  subtitle,
  className 
}: MetricCardProps) {
  const statusColors = {
    healthy: 'text-success',
    warning: 'text-warning',
    critical: 'text-destructive',
    neutral: 'text-primary',
  };

  return (
    <Card className={cn(CARD_STYLES.base, className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className={TYPOGRAPHY.metricLabel}>{title}</CardTitle>
          <Icon className={cn(ICON_SIZES.md, statusColors[status])} />
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className={SPACING.contentGapSm}>
          <div className={TYPOGRAPHY.metricValue}>{value}</div>
          {subtitle && (
            <div className={TYPOGRAPHY.captionText}>{subtitle}</div>
          )}
          {trend && (
            <div className={cn(
              TYPOGRAPHY.captionText,
              trend.isPositive ? 'text-success' : 'text-destructive'
            )}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
