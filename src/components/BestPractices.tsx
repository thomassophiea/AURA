import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { AlertCircle, CheckCircle, XCircle, Search, RefreshCw, Filter, Settings, Wifi, Shield, Database, Router, Clock, AlertTriangle, Info, Activity } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { apiService } from '../services/api';
import { toast } from 'sonner';

interface BestPracticeCondition {
  id: string;
  criteria: string;
  detailedDescription: string;
  causeBy: Array<{
    type: string;
    name: string;
    id: string;
  }>;
  status: 'Warning' | 'Critical' | 'Info' | 'Good';
  type: 'Config' | 'Operational' | 'Network';
}

interface BestPracticesData {
  timestamp: number;
  conditions: BestPracticeCondition[];
}

export function BestPractices() {
  const [data, setData] = useState<BestPracticesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadBestPractices = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to fetch from best practices API endpoint
      const response = await apiService.makeAuthenticatedRequest('/v1/services/bestpractices', {
        method: 'GET'
      });

      if (response.ok) {
        const result = await response.json();
        setData(result);
      } else if (response.status === 401) {
        // Session expired - let the global handler deal with it
        throw new Error('Session expired. Please login again.');
      } else {
        // API endpoint doesn't exist - show error
        throw new Error('Best Practices API endpoint not available on this Extreme Platform ONE');
      }

      setLastRefresh(new Date());
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load best practices data';
      console.warn('Best practices load failed:', errorMessage);
      
      // Handle session expiration
      if (errorMessage.includes('Session expired') || errorMessage.includes('Authentication required')) {
        // Let the global error handler deal with session expiration
        throw error;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBestPractices();
  }, []);

  const handleRefresh = () => {
    loadBestPractices();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Good':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'Info':
        return <Info className="h-4 w-4 text-blue-500" />;
      case 'Warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'Critical':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Good':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'Info':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'Warning':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'Critical':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:
        return 'bg-muted/10 text-muted-foreground border-muted/20';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Config':
        return <Settings className="h-4 w-4" />;
      case 'Operational':
        return <Activity className="h-4 w-4" />;
      case 'Network':
        return <Router className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const filteredConditions = data?.conditions.filter(condition => {
    const matchesSearch = condition.criteria.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         condition.detailedDescription.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || condition.status === statusFilter;
    const matchesType = typeFilter === 'all' || condition.type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType;
  }) || [];

  const configConditions = filteredConditions.filter(c => c.type === 'Config');
  const operationalConditions = filteredConditions.filter(c => c.type === 'Operational');
  const networkConditions = filteredConditions.filter(c => c.type === 'Network');

  const getStatusCounts = (conditions: BestPracticeCondition[]) => {
    return {
      good: conditions.filter(c => c.status === 'Good').length,
      info: conditions.filter(c => c.status === 'Info').length,
      warning: conditions.filter(c => c.status === 'Warning').length,
      critical: conditions.filter(c => c.status === 'Critical').length,
    };
  };

  const configCounts = getStatusCounts(data?.conditions.filter(c => c.type === 'Config') || []);
  const operationalCounts = getStatusCounts(data?.conditions.filter(c => c.type === 'Operational') || []);
  const networkCounts = getStatusCounts(data?.conditions.filter(c => c.type === 'Network') || []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-headline-5 text-high-emphasis">Insights</h1>
            <p className="text-muted-foreground">System configuration and operational recommendations</p>
          </div>
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
        
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <p className="text-muted-foreground">System configuration and operational recommendations</p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-muted-foreground">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Development Notice */}
      <Alert className="border-amber-500/20 bg-amber-500/10">
        <Info className="h-4 w-4 text-amber-500" />
        <AlertDescription className="text-amber-700">
          <strong>Demo Mode:</strong> Showing some sample data to populate the widgets. These APIs do exists today.
        </AlertDescription>
      </Alert>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search criteria or descriptions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Good">Good</SelectItem>
            <SelectItem value="Info">Info</SelectItem>
            <SelectItem value="Warning">Warning</SelectItem>
            <SelectItem value="Critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="Config">Configuration</SelectItem>
            <SelectItem value="Operational">Operational</SelectItem>
            <SelectItem value="Network">Network</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-medium">Network</CardTitle>
            <Router className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span>{networkCounts.good} Good</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span>{networkCounts.info} Info</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                <span>{networkCounts.warning} Warning</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span>{networkCounts.critical} Critical</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-medium">Configuration</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span>{configCounts.good} Good</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span>{configCounts.info} Info</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                <span>{configCounts.warning} Warning</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span>{configCounts.critical} Critical</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-medium">Operational</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span>{operationalCounts.good} Good</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span>{operationalCounts.info} Info</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                <span>{operationalCounts.warning} Warning</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span>{operationalCounts.critical} Critical</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Best Practices Tabs */}
      <Tabs defaultValue="network" className="space-y-4">
        <TabsList>
          <TabsTrigger value="network" className="flex items-center space-x-2">
            <Router className="h-4 w-4" />
            <span>Network ({networkConditions.length})</span>
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center space-x-2">
            <Settings className="h-4 w-4" />
            <span>Configuration ({configConditions.length})</span>
          </TabsTrigger>
          <TabsTrigger value="operational" className="flex items-center space-x-2">
            <Activity className="h-4 w-4" />
            <span>Operational ({operationalConditions.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="network" className="space-y-4">
          {networkConditions.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center text-muted-foreground">
                  <Router className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No network conditions match your filters</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {networkConditions.map((condition) => (
                <Card key={condition.id} className="relative">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        {getTypeIcon(condition.type)}
                        <Badge variant="outline" className={getStatusColor(condition.status)}>
                          {getStatusIcon(condition.status)}
                          <span className="ml-1">{condition.status}</span>
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <CardTitle className="text-sm leading-relaxed">
                        {condition.criteria}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {condition.detailedDescription}
                    </p>
                    
                    {condition.causeBy.length > 0 && (
                      <div className="space-y-2">
                        <Separator />
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Caused by:</p>
                          {condition.causeBy.map((cause, index) => (
                            <div key={index} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{cause.type}:</span>
                              <span className="font-medium truncate ml-2">{cause.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          {configConditions.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center text-muted-foreground">
                  <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No configuration conditions match your filters</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {configConditions.map((condition) => (
                <Card key={condition.id} className="relative">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        {getTypeIcon(condition.type)}
                        <Badge variant="outline" className={getStatusColor(condition.status)}>
                          {getStatusIcon(condition.status)}
                          <span className="ml-1">{condition.status}</span>
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <CardTitle className="text-sm leading-relaxed">
                        {condition.criteria}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {condition.detailedDescription}
                    </p>
                    
                    {condition.causeBy.length > 0 && (
                      <div className="space-y-2">
                        <Separator />
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Caused by:</p>
                          {condition.causeBy.map((cause, index) => (
                            <div key={index} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{cause.type}:</span>
                              <span className="font-medium truncate ml-2">{cause.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="operational" className="space-y-4">
          {operationalConditions.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No operational conditions match your filters</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {operationalConditions.map((condition) => (
                <Card key={condition.id} className="relative">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        {getTypeIcon(condition.type)}
                        <Badge variant="outline" className={getStatusColor(condition.status)}>
                          {getStatusIcon(condition.status)}
                          <span className="ml-1">{condition.status}</span>
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <CardTitle className="text-sm leading-relaxed">
                        {condition.criteria}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {condition.detailedDescription}
                    </p>
                    
                    {condition.causeBy.length > 0 && (
                      <div className="space-y-2">
                        <Separator />
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Caused by:</p>
                          {condition.causeBy.map((cause, index) => (
                            <div key={index} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{cause.type}:</span>
                              <span className="font-medium truncate ml-2">{cause.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

      </Tabs>
    </div>
  );
}