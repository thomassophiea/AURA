import React from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import { formatCompactNumber } from '../../lib/units';
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface DistributionItem {
  label: string;
  value: number;
  percentage?: number;
  color?: string;
}

interface DistributionWidgetProps {
  title: string;
  items: DistributionItem[];
  type?: 'pie' | 'doughnut' | 'bar';
  height?: number;
  showLegend?: boolean;
  showPercentages?: boolean;
}

const DEFAULT_COLORS = [
  'rgb(59, 130, 246)',   // blue-500
  'rgb(16, 185, 129)',   // green-500
  'rgb(245, 158, 11)',   // amber-500
  'rgb(239, 68, 68)',    // red-500
  'rgb(139, 92, 246)',   // purple-500
  'rgb(236, 72, 153)',   // pink-500
  'rgb(14, 165, 233)',   // sky-500
  'rgb(34, 197, 94)',    // lime-500
  'rgb(251, 146, 60)',   // orange-500
  'rgb(168, 85, 247)',   // violet-500
];

export const DistributionWidget: React.FC<DistributionWidgetProps> = ({
  title,
  items,
  type = 'doughnut',
  height = 300,
  showLegend = true,
  showPercentages = true
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

  // Calculate total if percentages not provided
  const total = items.reduce((sum, item) => sum + item.value, 0);

  // Prepare data with percentages
  const dataWithPercentages = items.map((item, index) => ({
    ...item,
    percentage: item.percentage ?? (total > 0 ? (item.value / total) * 100 : 0),
    color: item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]
  }));

  const chartData = {
    labels: dataWithPercentages.map(item => item.label),
    datasets: [
      {
        data: dataWithPercentages.map(item => item.value),
        backgroundColor: dataWithPercentages.map(item => item.color),
        borderColor: 'rgb(31, 41, 55)', // bg-card
        borderWidth: 2
      }
    ]
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: showLegend,
        position: 'right' as const,
        labels: {
          color: 'rgb(156, 163, 175)', // text-muted-foreground
          padding: 16,
          usePointStyle: true,
          font: {
            size: 12
          },
          generateLabels: (chart: any) => {
            const data = chart.data;
            if (data.labels.length && data.datasets.length) {
              return data.labels.map((label: string, i: number) => {
                const value = data.datasets[0].data[i];
                const percentage = dataWithPercentages[i].percentage;
                const formattedValue = formatValue(value);

                return {
                  text: showPercentages
                    ? `${label}: ${formattedValue} (${percentage.toFixed(1)}%)`
                    : `${label}: ${formattedValue}`,
                  fillStyle: data.datasets[0].backgroundColor[i],
                  hidden: false,
                  index: i
                };
              });
            }
            return [];
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
        callbacks: {
          label: function(context: any) {
            const label = context.label || '';
            const value = context.parsed || context.parsed.y || 0;
            const percentage = dataWithPercentages[context.dataIndex].percentage;
            const formattedValue = formatValue(value);

            return showPercentages
              ? `${label}: ${formattedValue} (${percentage.toFixed(1)}%)`
              : `${label}: ${formattedValue}`;
          }
        }
      }
    }
  };

  // Bar chart specific options
  if (type === 'bar') {
    options.indexAxis = 'y';
    options.scales = {
      x: {
        beginAtZero: true,
        grid: {
          color: 'rgb(55, 65, 81)',
          drawBorder: false
        },
        ticks: {
          color: 'rgb(156, 163, 175)',
          callback: function(value: any) {
            return formatValue(value);
          }
        }
      },
      y: {
        grid: {
          display: false
        },
        ticks: {
          color: 'rgb(156, 163, 175)'
        }
      }
    };
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4 text-foreground">{title}</h3>
      <div style={{ height: `${height}px` }}>
        {type === 'bar' ? (
          <Bar data={chartData} options={options} />
        ) : (
          <Doughnut data={chartData} options={options} />
        )}
      </div>

      {/* Optional: Show summary table below chart */}
      {!showLegend && (
        <div className="mt-4 space-y-2">
          {dataWithPercentages.map((item, index) => (
            <div key={index} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-foreground">{item.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-foreground font-semibold">
                  {formatValue(item.value)}
                </span>
                {showPercentages && (
                  <span className="text-muted-foreground w-12 text-right">
                    {item.percentage.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Format values - use shared utility
 */
const formatValue = formatCompactNumber;
