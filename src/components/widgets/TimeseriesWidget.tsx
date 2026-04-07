import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface TimeseriesDataPoint {
  timestamp: number;
  value: number;
}

interface TimeseriesStat {
  name: string;
  unit: string;
  values: TimeseriesDataPoint[];
}

interface TimeseriesWidgetProps {
  title: string;
  statistics: TimeseriesStat[];
  height?: number;
  showLegend?: boolean;
  fillArea?: boolean;
  unit?: string;
}

const COLORS = [
  'rgb(59, 130, 246)',   // blue-500
  'rgb(16, 185, 129)',   // green-500
  'rgb(245, 158, 11)',   // amber-500
  'rgb(239, 68, 68)',    // red-500
  'rgb(139, 92, 246)',   // purple-500
  'rgb(236, 72, 153)',   // pink-500
];

export const TimeseriesWidget: React.FC<TimeseriesWidgetProps> = ({
  title,
  statistics,
  height = 300,
  showLegend = true,
  fillArea = false,
  unit
}) => {
  if (!statistics || statistics.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 text-foreground">{title}</h3>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          No data available
        </div>
      </div>
    );
  }

  // Get all unique timestamps across all statistics
  const allTimestamps = Array.from(
    new Set(
      statistics.flatMap(stat => stat.values.map(v => v.timestamp))
    )
  ).sort((a, b) => a - b);

  // Format timestamps for labels
  const labels = allTimestamps.map(ts => {
    const date = new Date(ts);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  });

  // Create datasets for each statistic
  const datasets = statistics.map((stat, index) => {
    const color = COLORS[index % COLORS.length];

    // Create a map of timestamp to value for quick lookup
    const valueMap = new Map(
      stat.values.map(v => [v.timestamp, v.value])
    );

    // Map timestamps to values (null if not present)
    const data = allTimestamps.map(ts => valueMap.get(ts) ?? null);

    return {
      label: stat.name,
      data,
      borderColor: color,
      backgroundColor: fillArea ? color.replace('rgb', 'rgba').replace(')', ', 0.1)') : 'transparent',
      fill: fillArea,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 2
    };
  });

  const data = {
    labels,
    datasets
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: showLegend,
        position: 'top' as const,
        labels: {
          color: 'rgb(156, 163, 175)', // text-muted-foreground
          usePointStyle: true,
          padding: 16,
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgb(31, 41, 55)', // bg-card
        titleColor: 'rgb(243, 244, 246)', // text-foreground
        bodyColor: 'rgb(209, 213, 219)', // text-muted-foreground
        borderColor: 'rgb(75, 85, 99)', // border-border
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          label: function(context: any) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              // Format large numbers
              const value = context.parsed.y;
              const formatted = formatValue(value, unit || statistics[0]?.unit);
              label += formatted;
            }
            return label;
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          color: 'rgb(55, 65, 81)', // grid lines
          drawBorder: false
        },
        ticks: {
          color: 'rgb(156, 163, 175)', // text-muted-foreground
          maxRotation: 0,
          autoSkipPadding: 20
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgb(55, 65, 81)', // grid lines
          drawBorder: false
        },
        ticks: {
          color: 'rgb(156, 163, 175)', // text-muted-foreground
          callback: function(value: any) {
            return formatValue(value, unit || statistics[0]?.unit);
          }
        }
      }
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4 text-foreground">{title}</h3>
      <div style={{ height: `${height}px` }}>
        <Line data={data} options={options} />
      </div>
    </div>
  );
};

/**
 * Format values with appropriate units
 */
function formatValue(value: number, unit?: string): string {
  if (unit === 'bps') {
    // Convert bits per second to human-readable format
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)} Gbps`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)} Mbps`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)} Kbps`;
    return `${value.toFixed(0)} bps`;
  }

  if (unit === 'bytes') {
    // Convert bytes to human-readable format
    if (value >= 1e12) return `${(value / 1e12).toFixed(2)} TB`;
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)} GB`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)} MB`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)} KB`;
    return `${value.toFixed(0)} B`;
  }

  if (unit === 'users' || unit === 'count') {
    return value.toFixed(0);
  }

  if (unit === '%') {
    return `${value.toFixed(1)}%`;
  }

  // Default formatting
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(2);
}
