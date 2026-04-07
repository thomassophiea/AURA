import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface RankingItem {
  name: string;
  value: number;
  unit?: string;
  percentage?: number;
  additionalInfo?: Record<string, any>;
}

interface RankingWidgetProps {
  title: string;
  items: RankingItem[];
  type?: 'top' | 'worst';
  maxItems?: number;
  showBar?: boolean;
  unit?: string;
}

export const RankingWidget: React.FC<RankingWidgetProps> = ({
  title,
  items,
  type = 'top',
  maxItems = 10,
  showBar = true,
  unit
}) => {
  if (!items || items.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 text-foreground">{title}</h3>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          No data available
        </div>
      </div>
    );
  }

  // Limit to maxItems
  const displayItems = items.slice(0, maxItems);

  // Find max value for bar sizing
  const maxValue = Math.max(...displayItems.map(item => item.value), 1);

  const TrendIcon = type === 'top' ? TrendingUp : TrendingDown;
  const trendColor = type === 'top' ? 'text-green-500' : 'text-red-500';
  const barColor = type === 'top' ? 'bg-blue-500' : 'bg-orange-500';

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendIcon className={`w-5 h-5 ${trendColor}`} />
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      </div>

      <div className="space-y-3">
        {displayItems.map((item, index) => {
          const barWidth = (item.value / maxValue) * 100;
          const formattedValue = formatValue(item.value, unit || item.unit);

          return (
            <div key={index} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-muted-foreground font-mono w-6 flex-shrink-0">
                    {index + 1}.
                  </span>
                  <span className="text-foreground truncate" title={item.name}>
                    {item.name}
                  </span>
                </div>
                <span className="text-foreground font-semibold ml-2 flex-shrink-0">
                  {formattedValue}
                </span>
              </div>

              {showBar && (
                <div className="ml-8">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${barColor} rounded-full transition-all duration-300`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              )}

              {item.percentage !== undefined && (
                <div className="ml-8 text-xs text-muted-foreground">
                  {item.percentage.toFixed(1)}% of total
                </div>
              )}
            </div>
          );
        })}
      </div>

      {items.length > maxItems && (
        <div className="mt-4 pt-4 border-t border-border text-center text-sm text-muted-foreground">
          Showing top {maxItems} of {items.length} items
        </div>
      )}
    </div>
  );
};

/**
 * Format values with appropriate units
 */
function formatValue(value: number, unit?: string): string {
  // Handle missing, empty, or invalid units
  const validUnit = unit && unit !== 'undefined' && unit !== 'null' ? unit : undefined;

  if (!validUnit) {
    // Auto-format large numbers with appropriate unit
    if (value >= 1e12) return `${(value / 1e12).toFixed(2)} TB`;
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)} GB`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)} MB`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)} KB`;
    return value.toFixed(2);
  }

  if (validUnit === 'bps') {
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)} Gbps`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)} Mbps`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)} Kbps`;
    return `${value.toFixed(0)} bps`;
  }

  if (validUnit === 'bytes') {
    if (value >= 1e12) return `${(value / 1e12).toFixed(2)} TB`;
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)} GB`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)} MB`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)} KB`;
    return `${value.toFixed(0)} B`;
  }

  if (validUnit === 'users' || validUnit === 'count' || validUnit === 'clients') {
    return value.toFixed(0);
  }

  if (validUnit === '%' || validUnit === 'percent') {
    return `${value.toFixed(1)}%`;
  }

  if (validUnit === 'ms' || validUnit === 'milliseconds') {
    if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
    return `${value.toFixed(0)} ms`;
  }

  if (validUnit === 'dBm') {
    return `${value.toFixed(0)} dBm`;
  }

  if (validUnit === 'dB') {
    return `${value.toFixed(0)} dB`;
  }

  // Default: append unit
  return `${value.toFixed(2)} ${validUnit}`;
}
