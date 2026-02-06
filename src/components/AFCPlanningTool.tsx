import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import {
  Radio,
  Play,
  Download,
  RefreshCw,
  MapPin,
  Wifi,
  BarChart3,
  Settings,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Zap
} from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

interface AFCPlan {
  id: string;
  name: string;
  siteId: string;
  siteName: string;
  status: 'draft' | 'analyzing' | 'completed' | 'failed';
  createdAt: string;
  lastRun?: string;
  apCount: number;
  channelPlan?: ChannelAssignment[];
  powerPlan?: PowerAssignment[];
  interferenceScore?: number;
  coverageScore?: number;
  // AFC-specific configuration
  height?: number;
  country?: string;
  latitude?: number;
  longitude?: number;
  afcPowerLimits?: AFCPowerLimits;
}

interface AFCPowerLimits {
  unii5: { [key in ChannelWidth]: number };  // 5925-6425 MHz
  unii6: { [key in ChannelWidth]: number };  // 6425-6525 MHz
  unii7: { [key in ChannelWidth]: number };  // 6525-6875 MHz
  unii8: { [key in ChannelWidth]: number };  // 6875-7125 MHz
}

type ChannelWidth = '20' | '40' | '80' | '160';

interface ChannelAssignment {
  apSerial: string;
  apName: string;
  radioIndex: number;
  currentChannel: number;
  recommendedChannel: number;
  band: '2.4GHz' | '5GHz' | '6GHz';
  interference: number;
  neighbors: number;
}

interface PowerAssignment {
  apSerial: string;
  apName: string;
  radioIndex: number;
  currentPower: number;
  recommendedPower: number;
  coverage: number;
}

// Default AFC power limits (example values in dBm EIRP)
const getDefaultPowerLimits = (): AFCPowerLimits => ({
  unii5: { '20': 30, '40': 27, '80': 24, '160': 21 },  // 5925-6425 MHz
  unii6: { '20': 24, '40': 21, '80': 18, '160': 15 },  // 6425-6525 MHz (indoor only)
  unii7: { '20': 30, '40': 27, '80': 24, '160': 21 },  // 6525-6875 MHz
  unii8: { '20': 30, '40': 27, '80': 24, '160': 21 },  // 6875-7125 MHz
});

export function AFCPlanningTool() {
  const [plans, setPlans] = useState<AFCPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<AFCPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState('plans');

  // New plan state
  const [newPlanName, setNewPlanName] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [sites, setSites] = useState<any[]>([]);
  const [height, setHeight] = useState<number>(10);
  const [country, setCountry] = useState<string>('United States');
  const [latitude, setLatitude] = useState<number>(37.7749);
  const [longitude, setLongitude] = useState<number>(-122.4194);
  const [selectedChannelWidth, setSelectedChannelWidth] = useState<ChannelWidth>('160');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sitesData] = await Promise.allSettled([
        apiService.getSites()
      ]);

      if (sitesData.status === 'fulfilled') {
        setSites(sitesData.value);
      }

      // Load existing AFC plans from API
      const plansData = await apiService.getAFCPlans();
      setPlans(Array.isArray(plansData) ? plansData : []);
    } catch (error) {
      console.error('Failed to load AFC data:', error);
      toast.error('Failed to load AFC planning data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlan = async () => {
    if (!newPlanName.trim() || !selectedSiteId) {
      toast.error('Please enter plan name and select a site');
      return;
    }

    try {
      const site = sites.find(s => s.id === selectedSiteId);

      await apiService.createAFCPlan({
        name: newPlanName,
        siteId: selectedSiteId,
        siteName: site?.name || 'Unknown Site',
        height,
        country,
        latitude,
        longitude
      });

      toast.success('AFC plan created');
      setNewPlanName('');
      setSelectedSiteId('');
      await loadData();
    } catch (error) {
      console.error('Failed to create plan:', error);
      toast.error('Failed to create plan');
    }
  };

  const handleRunAnalysis = async (plan: AFCPlan) => {
    setRunning(true);
    setSelectedPlan({ ...plan, status: 'analyzing' });

    try {
      toast.info('Running AFC analysis...');

      // Call API to run AFC analysis
      const completedPlan = await apiService.runAFCAnalysis(plan.id);

      setPlans(plans.map(p => p.id === plan.id ? completedPlan : p));
      setSelectedPlan(completedPlan);
      setActiveTab('results');
      toast.success('AFC analysis completed');
    } catch (error) {
      console.error('AFC analysis failed:', error);
      toast.error('Analysis failed');
      setSelectedPlan({ ...plan, status: 'failed' });
      setPlans(plans.map(p => p.id === plan.id ? { ...p, status: 'failed' as const } : p));
    } finally {
      setRunning(false);
    }
  };

  const handleApplyPlan = async (plan: AFCPlan) => {
    if (!plan.channelPlan && !plan.powerPlan) {
      toast.error('No recommendations available');
      return;
    }

    try {
      toast.info('Applying channel and power recommendations...');

      const response = await apiService.makeAuthenticatedRequest(`/v1/afc/plans/${plan.id}/apply`, {
        method: 'POST'
      });

      if (response.ok) {
        toast.success('AFC plan applied successfully');
      } else {
        throw new Error('Failed to apply plan');
      }
    } catch (error) {
      console.error('Failed to apply AFC plan:', error);
      toast.error('Failed to apply plan');
    }
  };

  const getStatusBadge = (status: AFCPlan['status']) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'analyzing':
        return <Badge variant="default">Analyzing...</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Radio className="h-6 w-6" />
          AFC Planning Tool
        </h2>
        <p className="text-muted-foreground">
          Automated Frequency Coordination - Optimize channel and power settings

      <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Important Context:</strong> AFC (Automated Frequency Coordination) planning in 6GHz spectrum requires registration with an AFC service provider. 
          The recommendations generated here are based on current AP deployments and RF environment analysis. 
          Actual frequency assignments and power levels must comply with AFC service provider approvals and regulatory requirements. 
          Always verify that planned changes align with your AFC registration and local regulations before implementation.
        </AlertDescription>
      </Alert>
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="create">Create Plan</TabsTrigger>
          {selectedPlan && <TabsTrigger value="results">Results</TabsTrigger>}
        </TabsList>

        {/* Plans List */}
        <TabsContent value="plans" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AFC Plans</CardTitle>
              <CardDescription>Manage and execute RF optimization plans</CardDescription>
            </CardHeader>
            <CardContent>
              {plans.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No AFC plans created yet. Create a new plan to get started.
                  </AlertDescription>
                </Alert>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>APs</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Run</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plans.map(plan => (
                      <TableRow key={plan.id}>
                        <TableCell className="font-medium">{plan.name}</TableCell>
                        <TableCell>{plan.siteName}</TableCell>
                        <TableCell>{plan.apCount}</TableCell>
                        <TableCell>{getStatusBadge(plan.status)}</TableCell>
                        <TableCell>
                          {plan.lastRun ? new Date(plan.lastRun).toLocaleString() : 'Never'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleRunAnalysis(plan)}
                              disabled={running || plan.status === 'analyzing'}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              {plan.status === 'analyzing' ? 'Analyzing...' : 'Run'}
                            </Button>
                            {plan.status === 'completed' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedPlan(plan);
                                  setActiveTab('results');
                                }}
                              >
                                View Results
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Create Plan */}
        <TabsContent value="create" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create AFC Plan</CardTitle>
              <CardDescription>Configure a new RF optimization plan with AFC parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Plan Name</Label>
                <Input
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  placeholder="e.g., AFC Report"
                />
              </div>

              <div className="space-y-2">
                <Label>Site</Label>
                <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map(site => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Height (meters)</Label>
                  <Input
                    type="number"
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value))}
                    placeholder="10"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Country</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="United States">United States</SelectItem>
                      <SelectItem value="Canada">Canada</SelectItem>
                      <SelectItem value="United Kingdom">United Kingdom</SelectItem>
                      <SelectItem value="Germany">Germany</SelectItem>
                      <SelectItem value="France">France</SelectItem>
                      <SelectItem value="Japan">Japan</SelectItem>
                      <SelectItem value="Australia">Australia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Latitude</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={latitude}
                    onChange={(e) => setLatitude(Number(e.target.value))}
                    placeholder="37.7749"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Longitude</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={longitude}
                    onChange={(e) => setLongitude(Number(e.target.value))}
                    placeholder="-122.4194"
                  />
                </div>
              </div>

              <Button onClick={handleCreatePlan} className="w-full">
                Create AFC Plan
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Results */}
        {selectedPlan && (
          <TabsContent value="results" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{selectedPlan.name} - Results</CardTitle>
                <CardDescription>
                  Analysis completed: {selectedPlan.lastRun ? new Date(selectedPlan.lastRun).toLocaleString() : 'N/A'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* AFC Configuration Summary */}
                <div className="grid grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
                  <div>
                    <p className="text-xs text-muted-foreground">Height</p>
                    <p className="text-sm font-semibold">{selectedPlan.height || 10} meters</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Country</p>
                    <p className="text-sm font-semibold">{selectedPlan.country || 'United States'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Latitude</p>
                    <p className="text-sm font-semibold">{selectedPlan.latitude?.toFixed(4) || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Longitude</p>
                    <p className="text-sm font-semibold">{selectedPlan.longitude?.toFixed(4) || 'N/A'}</p>
                  </div>
                </div>

                {/* Channel Width Selector */}
                <div className="space-y-2">
                  <Label>Channel Width</Label>
                  <Select value={selectedChannelWidth} onValueChange={(v) => setSelectedChannelWidth(v as ChannelWidth)}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20 MHz</SelectItem>
                      <SelectItem value="40">40 MHz</SelectItem>
                      <SelectItem value="80">80 MHz</SelectItem>
                      <SelectItem value="160">160 MHz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* U-NII Band Power Limits Table */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Maximum Allowed Power by U-NII Band
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>U-NII Band</TableHead>
                        <TableHead>Frequency Range</TableHead>
                        <TableHead>20 MHz</TableHead>
                        <TableHead>40 MHz</TableHead>
                        <TableHead>80 MHz</TableHead>
                        <TableHead>160 MHz</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const limits = selectedPlan.afcPowerLimits || getDefaultPowerLimits();
                        return (
                          <>
                            <TableRow>
                              <TableCell className="font-semibold">U-NII-5</TableCell>
                              <TableCell className="text-xs">5925-6425 MHz</TableCell>
                              <TableCell className={selectedChannelWidth === '20' ? 'font-bold text-primary' : ''}>
                                {limits.unii5['20']} dBm
                              </TableCell>
                              <TableCell className={selectedChannelWidth === '40' ? 'font-bold text-primary' : ''}>
                                {limits.unii5['40']} dBm
                              </TableCell>
                              <TableCell className={selectedChannelWidth === '80' ? 'font-bold text-primary' : ''}>
                                {limits.unii5['80']} dBm
                              </TableCell>
                              <TableCell className={selectedChannelWidth === '160' ? 'font-bold text-primary' : ''}>
                                {limits.unii5['160']} dBm
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-semibold">U-NII-6</TableCell>
                              <TableCell className="text-xs">6425-6525 MHz</TableCell>
                              <TableCell className={selectedChannelWidth === '20' ? 'font-bold text-primary' : ''}>
                                {limits.unii6['20']} dBm
                              </TableCell>
                              <TableCell className={selectedChannelWidth === '40' ? 'font-bold text-primary' : ''}>
                                {limits.unii6['40']} dBm
                              </TableCell>
                              <TableCell className={selectedChannelWidth === '80' ? 'font-bold text-primary' : ''}>
                                {limits.unii6['80']} dBm
                              </TableCell>
                              <TableCell className={selectedChannelWidth === '160' ? 'font-bold text-primary' : ''}>
                                {limits.unii6['160']} dBm
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-semibold">U-NII-7</TableCell>
                              <TableCell className="text-xs">6525-6875 MHz</TableCell>
                              <TableCell className={selectedChannelWidth === '20' ? 'font-bold text-primary' : ''}>
                                {limits.unii7['20']} dBm
                              </TableCell>
                              <TableCell className={selectedChannelWidth === '40' ? 'font-bold text-primary' : ''}>
                                {limits.unii7['40']} dBm
                              </TableCell>
                              <TableCell className={selectedChannelWidth === '80' ? 'font-bold text-primary' : ''}>
                                {limits.unii7['80']} dBm
                              </TableCell>
                              <TableCell className={selectedChannelWidth === '160' ? 'font-bold text-primary' : ''}>
                                {limits.unii7['160']} dBm
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-semibold">U-NII-8</TableCell>
                              <TableCell className="text-xs">6875-7125 MHz</TableCell>
                              <TableCell className={selectedChannelWidth === '20' ? 'font-bold text-primary' : ''}>
                                {limits.unii8['20']} dBm
                              </TableCell>
                              <TableCell className={selectedChannelWidth === '40' ? 'font-bold text-primary' : ''}>
                                {limits.unii8['40']} dBm
                              </TableCell>
                              <TableCell className={selectedChannelWidth === '80' ? 'font-bold text-primary' : ''}>
                                {limits.unii8['80']} dBm
                              </TableCell>
                              <TableCell className={selectedChannelWidth === '160' ? 'font-bold text-primary' : ''}>
                                {limits.unii8['160']} dBm
                              </TableCell>
                            </TableRow>
                          </>
                        );
                      })()}
                    </TableBody>
                  </Table>
                  <p className="text-xs text-muted-foreground mt-2">
                    Note: Power values shown are maximum EIRP limits. Actual transmit power may be restricted by AFC service based on location and environment.
                  </p>
                </div>

                {/* Scores */}
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Interference Score</p>
                        <p className="text-3xl font-bold text-primary">
                          {selectedPlan.interferenceScore || 0}%
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Coverage Score</p>
                        <p className="text-3xl font-bold text-green-500">
                          {selectedPlan.coverageScore || 0}%
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Coverage Map Visualization */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    AP Coverage Map
                  </h3>
                  <Card className="p-4 bg-muted/30">
                    <div className="relative w-full h-[400px] bg-slate-100 dark:bg-slate-900 rounded-lg border-2 border-dashed border-border overflow-hidden">
                      {/* Simple SVG Map Placeholder */}
                      <svg className="w-full h-full" viewBox="0 0 800 400">
                        {/* Grid Background */}
                        <defs>
                          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.1" />
                          </pattern>
                        </defs>
                        <rect width="800" height="400" fill="url(#grid)" />

                        {/* Location Marker */}
                        <circle cx="400" cy="200" r="8" fill="#3b82f6" stroke="white" strokeWidth="2" />
                        <text x="400" y="220" textAnchor="middle" fontSize="12" fill="currentColor" opacity="0.7">
                          Site Location
                        </text>

                        {/* Example AP Placements - would be dynamically generated from actual AP data */}
                        {selectedPlan.channelPlan && selectedPlan.channelPlan.slice(0, 8).map((ap, idx) => {
                          const angle = (idx / Math.min(selectedPlan.channelPlan!.length, 8)) * 2 * Math.PI;
                          const radius = 80 + (idx % 3) * 40;
                          const x = 400 + radius * Math.cos(angle);
                          const y = 200 + radius * Math.sin(angle);

                          return (
                            <g key={idx}>
                              {/* Coverage Circle */}
                              <circle cx={x} cy={y} r="30" fill="#22c55e" opacity="0.2" />
                              <circle cx={x} cy={y} r="20" fill="#22c55e" opacity="0.3" />
                              {/* AP Icon */}
                              <circle cx={x} cy={y} r="6" fill="#22c55e" stroke="white" strokeWidth="2" />
                              <text x={x} y={y + 25} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.8">
                                {ap.apName.substring(0, 8)}
                              </text>
                            </g>
                          );
                        })}
                      </svg>

                      {/* Map Legend */}
                      <div className="absolute bottom-4 left-4 bg-background/90 backdrop-blur-sm p-3 rounded-lg border text-xs space-y-1">
                        <div className="font-semibold mb-2">Legend</div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                          <span>Site Center</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-green-500"></div>
                          <span>Access Point</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-green-500 opacity-20"></div>
                          <span>Coverage Area</span>
                        </div>
                      </div>

                      {/* Coordinates Display */}
                      <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm p-2 rounded-lg border text-xs">
                        <div className="font-mono">
                          {selectedPlan.latitude?.toFixed(4) || '0.0000'}°, {selectedPlan.longitude?.toFixed(4) || '0.0000'}°
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Geographic visualization of AP placements and coverage areas. Actual deployment should be verified with AFC service provider.
                    </p>
                  </Card>
                </div>

                {/* Channel Recommendations */}
                {selectedPlan.channelPlan && selectedPlan.channelPlan.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <Wifi className="h-4 w-4" />
                      Channel Recommendations
                    </h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>AP Name</TableHead>
                          <TableHead>Radio</TableHead>
                          <TableHead>Current Channel</TableHead>
                          <TableHead>Recommended</TableHead>
                          <TableHead>Interference</TableHead>
                          <TableHead>Neighbors</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPlan.channelPlan.map((ch, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{ch.apName}</TableCell>
                            <TableCell>{ch.radioIndex}</TableCell>
                            <TableCell>{ch.currentChannel}</TableCell>
                            <TableCell className="font-semibold text-primary">
                              {ch.recommendedChannel}
                            </TableCell>
                            <TableCell>
                              <Badge variant={ch.interference > 50 ? 'destructive' : 'secondary'}>
                                {ch.interference}%
                              </Badge>
                            </TableCell>
                            <TableCell>{ch.neighbors}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Power Recommendations */}
                {selectedPlan.powerPlan && selectedPlan.powerPlan.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Power Recommendations
                    </h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>AP Name</TableHead>
                          <TableHead>Radio</TableHead>
                          <TableHead>Current Power (dBm)</TableHead>
                          <TableHead>Recommended (dBm)</TableHead>
                          <TableHead>Coverage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPlan.powerPlan.map((pw, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{pw.apName}</TableCell>
                            <TableCell>{pw.radioIndex}</TableCell>
                            <TableCell>{pw.currentPower}</TableCell>
                            <TableCell className="font-semibold text-primary">
                              {pw.recommendedPower}
                            </TableCell>
                            <TableCell>
                              <Badge variant={pw.coverage > 90 ? 'default' : 'secondary'}>
                                {pw.coverage}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button onClick={() => handleApplyPlan(selectedPlan)} className="flex-1">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Apply Recommendations
                  </Button>
                  <Button variant="outline" onClick={() => {}}>
                    <Download className="h-4 w-4 mr-2" />
                    Export Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
