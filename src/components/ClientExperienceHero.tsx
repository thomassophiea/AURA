import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import {
  Smile,
  Frown,
  Meh,
  TrendingUp,
  TrendingDown,
  Zap,
  Signal,
  Radio,
  Target,
  CheckCircle,
  AlertCircle,
  Activity,
  Users,
  Gauge
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, RadialBarChart, RadialBar } from 'recharts';
import { SaveToWorkspace } from './SaveToWorkspace';

interface ClientExperienceMetrics {
  reliability?: number;
  uptime?: number;
  latency?: number;
  jitter?: number;
  packetLoss?: number;
  averageRssi?: number;
  averageSnr?: number;
  successRate?: number;
  errorRate?: number;
  clientCount?: number;
}

interface ClientExperienceHeroProps {
  metrics: ClientExperienceMetrics;
  serviceName?: string;
  timeSeries?: Array<{
    timestamp: number;
    time: string;
    experienceScore: number;
    clientCount: number;
    latency: number;
  }>;
}

/**
 * Client Experience Hero Section
 *
 * Massive, prominent display of overall client experience
 * with comprehensive metrics and visual indicators
 */
export function ClientExperienceHero({ metrics, serviceName, timeSeries = [] }: ClientExperienceHeroProps) {
  // Calculate overall Client Experience Score (0-100)
  const calculateExperienceScore = (): number => {
    let score = 0;
    let factors = 0;

    // Reliability (25%)
    if (metrics.reliability !== undefined) {
      score += (metrics.reliability / 100) * 25;
      factors++;
    }

    // Success Rate (20%)
    if (metrics.successRate !== undefined) {
      score += (metrics.successRate / 100) * 20;
      factors++;
    }

    // Latency (20%) - Lower is better
    if (metrics.latency !== undefined) {
      const latencyScore = Math.max(0, 100 - (metrics.latency / 2)); // Perfect at 0ms, 0% at 200ms
      score += (latencyScore / 100) * 20;
      factors++;
    }

    // Signal Quality (20%) - RSSI
    if (metrics.averageRssi !== undefined) {
      const signalScore = Math.max(0, Math.min(100, ((metrics.averageRssi + 100) / 50) * 100));
      score += (signalScore / 100) * 20;
      factors++;
    }

    // Packet Loss (15%) - Lower is better
    if (metrics.packetLoss !== undefined) {
      const plScore = Math.max(0, 100 - (metrics.packetLoss * 20));
      score += (plScore / 100) * 15;
      factors++;
    }

    return factors > 0 ? score : 75; // Default to 75 if no metrics
  };

  const experienceScore = calculateExperienceScore();

  // Get experience level and styling
  const getExperienceLevel = (score: number) => {
    if (score >= 90) return { level: 'Excellent', icon: Smile, color: 'text-green-600', bgColor: 'bg-green-50', borderColor: 'border-green-600' };
    if (score >= 75) return { level: 'Good', icon: Smile, color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-600' };
    if (score >= 60) return { level: 'Fair', icon: Meh, color: 'text-yellow-600', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-600' };
    return { level: 'Poor', icon: Frown, color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-600' };
  };

  const experience = getExperienceLevel(experienceScore);
  const ExperienceIcon = experience.icon;

  // Prepare radial chart data
  const radialData = [
    {
      name: 'Experience',
      value: experienceScore,
      fill: experienceScore >= 90 ? '#10b981' : experienceScore >= 75 ? '#3b82f6' : experienceScore >= 60 ? '#f59e0b' : '#ef4444'
    }
  ];

  // Format metric values
  const formatMetric = (value: number | undefined, suffix: string = ''): string => {
    if (value === undefined) return 'N/A';
    return `${value.toFixed(value < 10 ? 2 : 1)}${suffix}`;
  };

  const getMetricStatus = (value: number | undefined, good: number, warn: number, reverse = false): 'excellent' | 'good' | 'fair' | 'poor' => {
    if (value === undefined) return 'good';

    if (reverse) {
      // For metrics where lower is better (latency, jitter, packet loss, error rate)
      if (value <= good) return 'excellent';
      if (value <= warn) return 'good';
      if (value <= warn * 2) return 'fair';
      return 'poor';
    } else {
      // For metrics where higher is better (reliability, success rate, signal, SNR)
      if (value >= good) return 'excellent';
      if (value >= warn) return 'good';
      if (value >= warn * 0.9) return 'fair';
      return 'poor';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'text-green-600';
      case 'good': return 'text-blue-600';
      case 'fair': return 'text-yellow-600';
      case 'poor': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'excellent': return CheckCircle;
      case 'good': return CheckCircle;
      case 'fair': return AlertCircle;
      case 'poor': return AlertCircle;
      default: return Activity;
    }
  };

  return (
    <div className="space-y-4">
      {/* Hero Card - Client Experience Score */}
      <Card className={`border-2 ${experience.borderColor} ${experience.bgColor}`}>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-3">
                <Users className="h-8 w-8 text-primary" />
                Client Experience
              </CardTitle>
              <CardDescription className="text-base mt-1">
                Overall network quality from the client perspective
                {serviceName && <span className="ml-2">• {serviceName}</span>}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <SaveToWorkspace
                widgetId="client-experience-hero"
                widgetType="experience_score"
                title="Client Experience Score"
                endpointRefs={['client_experience.metrics']}
                sourcePage="client-experience"
                catalogId="metric_experience_score"
                size="md"
              />
              <ExperienceIcon className={`h-16 w-16 ${experience.color}`} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Left: Score Display */}
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="relative">
                <ResponsiveContainer width={280} height={280}>
                  <RadialBarChart
                    cx="50%"
                    cy="50%"
                    innerRadius="80%"
                    outerRadius="100%"
                    data={radialData}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <RadialBar
                      background
                      dataKey="value"
                      cornerRadius={10}
                    />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className={`text-6xl font-bold ${experience.color}`}>
                    {Math.round(experienceScore)}
                  </div>
                  <div className="text-2xl font-medium text-muted-foreground">/ 100</div>
                </div>
              </div>
              <div className="text-center">
                <Badge variant="outline" className={`text-lg px-4 py-2 ${experience.borderColor} ${experience.color}`}>
                  {experience.level} Experience
                </Badge>
                <p className="text-sm text-muted-foreground mt-2">
                  {experienceScore >= 90 && 'Outstanding network performance - clients are experiencing optimal connectivity'}
                  {experienceScore >= 75 && experienceScore < 90 && 'Good network performance - clients have reliable connectivity'}
                  {experienceScore >= 60 && experienceScore < 75 && 'Fair network performance - some improvements recommended'}
                  {experienceScore < 60 && 'Poor network performance - immediate attention required'}
                </p>
              </div>
            </div>

            {/* Right: Key Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Signal Strength */}
              {metrics.averageRssi !== undefined && (
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <Radio className={`h-5 w-5 ${getStatusColor(getMetricStatus(metrics.averageRssi, -50, -70))}`} />
                    <span className={`text-2xl font-bold ${getStatusColor(getMetricStatus(metrics.averageRssi, -50, -70))}`}>
                      {metrics.averageRssi}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">Signal (dBm)</div>
                  <Progress
                    value={Math.max(0, Math.min(100, (metrics.averageRssi + 100) * 1.25))}
                    className="h-1.5 mt-2"
                  />
                </div>
              )}

              {/* Signal Quality (SNR) */}
              {metrics.averageSnr !== undefined && (
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <Signal className={`h-5 w-5 ${getStatusColor(getMetricStatus(metrics.averageSnr, 40, 25))}`} />
                    <span className={`text-2xl font-bold ${getStatusColor(getMetricStatus(metrics.averageSnr, 40, 25))}`}>
                      {metrics.averageSnr}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">Quality (dB)</div>
                  <Progress
                    value={Math.max(0, Math.min(100, (metrics.averageSnr / 50) * 100))}
                    className="h-1.5 mt-2"
                  />
                </div>
              )}

              {/* Latency */}
              {metrics.latency !== undefined && (
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <Zap className={`h-5 w-5 ${getStatusColor(getMetricStatus(metrics.latency, 20, 50, true))}`} />
                    <span className={`text-2xl font-bold ${getStatusColor(getMetricStatus(metrics.latency, 20, 50, true))}`}>
                      {formatMetric(metrics.latency)}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">Latency (ms)</div>
                  <Progress
                    value={Math.max(0, 100 - (metrics.latency / 2))}
                    className="h-1.5 mt-2"
                  />
                </div>
              )}

              {/* Packet Loss */}
              {metrics.packetLoss !== undefined && (
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <Target className={`h-5 w-5 ${getStatusColor(getMetricStatus(metrics.packetLoss, 0.5, 2, true))}`} />
                    <span className={`text-2xl font-bold ${getStatusColor(getMetricStatus(metrics.packetLoss, 0.5, 2, true))}`}>
                      {formatMetric(metrics.packetLoss)}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">Loss (%)</div>
                  <Progress
                    value={Math.max(0, 100 - (metrics.packetLoss * 20))}
                    className="h-1.5 mt-2"
                  />
                </div>
              )}

              {/* Success Rate */}
              {metrics.successRate !== undefined && (
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <CheckCircle className={`h-5 w-5 ${getStatusColor(getMetricStatus(metrics.successRate, 98, 95))}`} />
                    <span className={`text-2xl font-bold ${getStatusColor(getMetricStatus(metrics.successRate, 98, 95))}`}>
                      {formatMetric(metrics.successRate, '%')}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">Success Rate</div>
                  <Progress value={metrics.successRate} className="h-1.5 mt-2" />
                </div>
              )}

              {/* Reliability */}
              {metrics.reliability !== undefined && (
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <Gauge className={`h-5 w-5 ${getStatusColor(getMetricStatus(metrics.reliability, 95, 90))}`} />
                    <span className={`text-2xl font-bold ${getStatusColor(getMetricStatus(metrics.reliability, 95, 90))}`}>
                      {formatMetric(metrics.reliability, '%')}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">Reliability</div>
                  <Progress value={metrics.reliability} className="h-1.5 mt-2" />
                </div>
              )}

              {/* Connected Clients */}
              {metrics.clientCount !== undefined && (
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <Users className="h-5 w-5 text-primary" />
                    <span className="text-2xl font-bold text-primary">
                      {metrics.clientCount}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">Active Clients</div>
                  <div className="text-xs text-muted-foreground mt-2">Currently connected</div>
                </div>
              )}

              {/* Jitter */}
              {metrics.jitter !== undefined && (
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <Activity className={`h-5 w-5 ${getStatusColor(getMetricStatus(metrics.jitter, 10, 30, true))}`} />
                    <span className={`text-2xl font-bold ${getStatusColor(getMetricStatus(metrics.jitter, 10, 30, true))}`}>
                      {formatMetric(metrics.jitter)}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">Jitter (ms)</div>
                  <Progress
                    value={Math.max(0, 100 - (metrics.jitter / 0.5))}
                    className="h-1.5 mt-2"
                  />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Experience Trend Chart */}
      {timeSeries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Client Experience Trend
            </CardTitle>
            <CardDescription>Historical experience score and key metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={timeSeries}>
                <defs>
                  <linearGradient id="experienceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="time"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis
                  domain={[0, 100]}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="experienceScore"
                  stroke="#10b981"
                  fillOpacity={1}
                  fill="url(#experienceGradient)"
                  name="Experience Score"
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
