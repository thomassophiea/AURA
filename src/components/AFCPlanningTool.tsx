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
}

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
      const response = await apiService.makeAuthenticatedRequest('/v1/afc/plans', {
        method: 'GET'
      });

      if (response.ok) {
        const data = await response.json();
        setPlans(Array.isArray(data) ? data : []);
      }
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

      const response = await apiService.makeAuthenticatedRequest('/v1/afc/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPlanName,
          siteId: selectedSiteId,
          siteName: site?.name || 'Unknown Site'
        })
      });

      if (response.ok) {
        toast.success('AFC plan created');
        setNewPlanName('');
        setSelectedSiteId('');
        await loadData();
      } else {
        throw new Error('Failed to create plan');
      }
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
      const response = await apiService.makeAuthenticatedRequest(`/v1/afc/plans/${plan.id}/analyze`, {
        method: 'POST'
      });

      if (response.ok) {
        const completedPlan = await response.json();

        setPlans(plans.map(p => p.id === plan.id ? completedPlan : p));
        setSelectedPlan(completedPlan);
        setActiveTab('results');
        toast.success('AFC analysis completed');
      } else {
        throw new Error('Analysis failed');
      }
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
        return <Badge variant="default" className="bg-green-500">Completed</Badge>;
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
              <CardDescription>Configure a new RF optimization plan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Plan Name</Label>
                <Input
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  placeholder="e.g., Building A RF Optimization"
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

              <Button onClick={handleCreatePlan} className="w-full">
                Create Plan
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

                {/* Channel Recommendations */}
                {selectedPlan.channelPlan && selectedPlan.channelPlan.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">Channel Recommendations</h3>
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
                    <h3 className="font-semibold mb-2">Power Recommendations</h3>
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
