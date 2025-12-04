import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { 
  AlertTriangle, 
  Info, 
  CheckCircle, 
  XCircle, 
  Activity, 
  RefreshCw, 
  Search,
  Filter,
  Settings,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Building,
  User,
  Network,
  Cpu,
  Shield
} from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

interface BestPracticeCondition {
  id: string;
  criteria: string;
  detailedDescription: string;
  causeBy: {
    type: string;
    name: string | null;
    id: string | null;
  }[];
  status: 'Warning' | 'Good' | 'Error';
  type: 'Config' | 'Operational';
}

interface BestPracticesResponse {
  timestamp: number;
  conditions: BestPracticeCondition[];
}

export function AlertsEvents() {
  const [conditions, setConditions] = useState<BestPracticeCondition[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const loadData = async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true);
      
      // Try to load real data from both API endpoints
      const [servicesResponse, evaluateResponse] = await Promise.allSettled([
        apiService.makeAuthenticatedRequest('/v1/services/bestpractices', { 
          method: 'GET' 
        }, 6000),
        apiService.makeAuthenticatedRequest('/v1/bestpractices/evaluate', { 
          method: 'GET' 
        }, 6000)
      ]);

      let allConditions: BestPracticeCondition[] = [];
      let hasValidData = false;

      // Process services/bestpractices response
      if (servicesResponse.status === 'fulfilled' && servicesResponse.value.ok) {
        try {
          const data: BestPracticesResponse = await servicesResponse.value.json();
          if (data.conditions && Array.isArray(data.conditions)) {
            allConditions = [...allConditions, ...data.conditions];
            hasValidData = true;
          }
        } catch (error) {
          console.log('SUPPRESSED_ANALYTICS_ERROR: Failed to parse services/bestpractices data:', error);
        }
      } else if (servicesResponse.status === 'fulfilled' && servicesResponse.value.status === 401) {
        // Session expired - let the global handler deal with it
        throw new Error('Session expired. Please login again.');
      } else {
        console.log('SUPPRESSED_ANALYTICS_ERROR: Services bestpractices API returned:', 
          servicesResponse.status === 'fulfilled' ? servicesResponse.value.status : 'rejected');
      }

      // Process bestpractices/evaluate response
      if (evaluateResponse.status === 'fulfilled' && evaluateResponse.value.ok) {
        try {
          const data = await evaluateResponse.value.json();
          // Handle both array and object with conditions array
          const evaluateConditions = Array.isArray(data) ? data : 
            (data.conditions && Array.isArray(data.conditions)) ? data.conditions : [];
          
          if (evaluateConditions.length > 0) {
            allConditions = [...allConditions, ...evaluateConditions];
            hasValidData = true;
          }
        } catch (error) {
          console.log('SUPPRESSED_ANALYTICS_ERROR: Failed to parse bestpractices/evaluate data:', error);
        }
      } else if (evaluateResponse.status === 'fulfilled' && evaluateResponse.value.status === 401) {
        // Session expired - let the global handler deal with it
        throw new Error('Session expired. Please login again.');
      } else {
        console.log('SUPPRESSED_ANALYTICS_ERROR: Bestpractices evaluate API returned:', 
          evaluateResponse.status === 'fulfilled' ? evaluateResponse.value.status : 'rejected');
      }

      if (hasValidData && allConditions.length > 0) {
        // Remove duplicates based on ID
        const uniqueConditions = allConditions.filter((condition, index, self) => 
          index === self.findIndex(c => c.id === condition.id)
        );
        setConditions(uniqueConditions);
        if (showRefreshing) {
          toast.success('System health data refreshed successfully');
        }
        return;
      }
      
      // Use mock data as fallback
      setConditions(getMockConditions());
      
      if (showRefreshing) {
        toast.success('System health data refreshed (demo data)');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Handle session expiration
      if (errorMessage.includes('Session expired') || errorMessage.includes('Authentication required')) {
        throw error;
      }
      
      console.log('SUPPRESSED_ANALYTICS_ERROR: Failed to load best practices:', error);
      // Use mock data on error
      setConditions(getMockConditions());
      
      if (showRefreshing) {
        toast.success('System health data refreshed (demo data)');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Mock data based on your provided structure
  const getMockConditions = (): BestPracticeCondition[] => [
    {
      id: "6ab62dac-75da-11ea-bc55-0242ac130003",
      criteria: "All active APs assigned to sites",
      detailedDescription: "Managed access points must be assigned to a site to provide service. APs not assigned to a site can be adopted, but they will not contribute to service coverage.",
      causeBy: [],
      status: "Good",
      type: "Config"
    },
    {
      id: "6ab6206e-75da-11ea-bc55-0242ac130003",
      criteria: "More than 4 SSIDs configured per radio",
      detailedDescription: "One radio can support a maximum of 8 SSIDs. However, the more SSIDs assigned to a radio, the higher the channel utilization. A best practice is to assign no more than 4 SSIDs to one radio.",
      causeBy: [
        {
          type: "Profile",
          name: "Home-5010",
          id: "702d3822-668c-11f0-956f-000c29ccc511"
        }
      ],
      status: "Warning",
      type: "Config"
    },
    {
      id: "6ab6260e-75da-11ea-bc55-0242ac130003",
      criteria: "Backup of system configuration has not been scheduled",
      detailedDescription: "A best practice is to configure a schedule for the automatic back up of the system configuration. Back up the configuration to a separate media or host. You can restore your configuration from a backup file in the event of a system failure.",
      causeBy: [
        {
          type: "Backup",
          name: null,
          id: null
        }
      ],
      status: "Warning",
      type: "Config"
    },
    {
      id: "6ab62848-75da-11ea-bc55-0242ac130003",
      criteria: "TKIP encryption for network privacy not detected",
      detailedDescription: "TKIP encryption is considered to be a less secure means of communication. An industry best practice is to use a more secure option for network privacy. Please disable TKIP option in the WPA privacy settings.",
      causeBy: [],
      status: "Good",
      type: "Config"
    },
    {
      id: "6ab647c4-75da-11ea-bc55-0242ac130003",
      criteria: "APs have been updated to run the latest version image",
      detailedDescription: "Run the supported AP firmware version. Running other firmware revisions can lead to unexpected results.",
      causeBy: [],
      status: "Good",
      type: "Operational"
    },
    {
      id: "d46f4cb0-3b27-11ec-a13c-0800200c9a66",
      criteria: "Some assigned entitlements expire in less than 30 days",
      detailedDescription: "The system must be licensed to operate. It is recommended to start license renew process 90 days before license expired to avoid interruption of functionality.",
      causeBy: [
        {
          type: "License",
          name: null,
          id: null
        }
      ],
      status: "Error",
      type: "Operational"
    },
    {
      id: "287ab993-3292-440a-8826-3c1b2e562f5f",
      criteria: "6 GHz Standard Power AP is using Fixed / Manually Assigned Fallback Channel",
      detailedDescription: "6 GHz Standard Power AP configured with Fixed / Manually Assigned Channel is using the Fallback Channel as a result of an AFC channel change.",
      causeBy: [
        {
          type: "Ap",
          name: "WM042233W-30019",
          id: "WM042233W-30019"
        }
      ],
      status: "Warning",
      type: "Operational"
    }
  ];

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    loadData(true);
  };

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const getStatusIcon = (status: BestPracticeCondition['status']) => {
    switch (status) {
      case 'Error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'Warning':
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'Good':
        return <CheckCircle className="h-4 w-4 text-success" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getStatusBadgeVariant = (status: BestPracticeCondition['status']) => {
    switch (status) {
      case 'Error':
        return 'destructive';
      case 'Warning':
        return 'secondary';
      case 'Good':
        return 'default';
      default:
        return 'outline';
    }
  };

  const getCauseTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'profile':
        return <Settings className="h-3 w-3 text-primary" />;
      case 'ap':
        return <Network className="h-3 w-3 text-secondary" />;
      case 'license':
        return <Shield className="h-3 w-3 text-warning" />;
      case 'backup':
        return <Cpu className="h-3 w-3 text-info" />;
      case 'service':
        return <Activity className="h-3 w-3 text-primary" />;
      case 'aaapolicy':
        return <User className="h-3 w-3 text-secondary" />;
      default:
        return <Building className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const filteredConditions = conditions.filter(condition => {
    const matchesType = activeTab === 'all' || 
      (activeTab === 'configuration' && condition.type === 'Config') ||
      (activeTab === 'operational' && condition.type === 'Operational');
    const matchesStatus = statusFilter === 'all' || condition.status === statusFilter;
    const matchesSearch = searchTerm === '' || 
      condition.criteria.toLowerCase().includes(searchTerm.toLowerCase()) ||
      condition.detailedDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
      condition.causeBy.some(cause => 
        cause.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cause.type.toLowerCase().includes(searchTerm.toLowerCase())
      );
    
    return matchesType && matchesStatus && matchesSearch;
  });

  // Count conditions by status
  const statusCounts = {
    error: conditions.filter(c => c.status === 'Error').length,
    warning: conditions.filter(c => c.status === 'Warning').length,
    good: conditions.filter(c => c.status === 'Good').length
  };

  // Count by type
  const typeCounts = {
    config: conditions.filter(c => c.type === 'Config').length,
    operational: conditions.filter(c => c.type === 'Operational').length
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-48 bg-muted animate-pulse rounded mb-2"></div>
            <div className="h-4 w-96 bg-muted animate-pulse rounded"></div>
          </div>
        </div>
        

        
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <div className="h-4 w-4 bg-muted animate-pulse rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 w-64 bg-muted animate-pulse rounded mb-2"></div>
                    <div className="h-3 w-96 bg-muted animate-pulse rounded"></div>
                  </div>
                  <div className="h-6 w-16 bg-muted animate-pulse rounded"></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent 
            className="p-6 cursor-pointer hover:bg-muted/50 transition-colors rounded-lg"
            onClick={() => {
              setStatusFilter('Error');
              setActiveTab('all');
            }}
          >
            <div className="flex items-center">
              <XCircle className="h-8 w-8 text-destructive" />
              <div className="ml-4">
                <p className="text-2xl font-semibold">{statusCounts.error}</p>
                <p className="text-sm text-muted-foreground">Critical Issues</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent 
            className="p-6 cursor-pointer hover:bg-muted/50 transition-colors rounded-lg"
            onClick={() => {
              setStatusFilter('Warning');
              setActiveTab('all');
            }}
          >
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-warning" />
              <div className="ml-4">
                <p className="text-2xl font-semibold">{statusCounts.warning}</p>
                <p className="text-sm text-muted-foreground">Warnings</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent 
            className="p-6 cursor-pointer hover:bg-muted/50 transition-colors rounded-lg"
            onClick={() => {
              setStatusFilter('Good');
              setActiveTab('all');
            }}
          >
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-success" />
              <div className="ml-4">
                <p className="text-2xl font-semibold">{statusCounts.good}</p>
                <p className="text-sm text-muted-foreground">Compliant</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">System Health & Best Practices</h1>
          <p className="text-muted-foreground mt-1">
            Monitor configuration compliance and operational recommendations
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={refreshing}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search best practices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Error">Critical Issues</SelectItem>
                <SelectItem value="Warning">Warnings</SelectItem>
                <SelectItem value="Good">Compliant</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="flex items-center text-sm text-muted-foreground">
              <Filter className="h-4 w-4 mr-2" />
              {filteredConditions.length} conditions shown
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all" className="flex items-center">
            <Activity className="h-4 w-4 mr-2" />
            All ({conditions.length})
          </TabsTrigger>
          <TabsTrigger value="configuration" className="flex items-center">
            <Settings className="h-4 w-4 mr-2" />
            Configuration ({typeCounts.config})
          </TabsTrigger>
          <TabsTrigger value="operational" className="flex items-center">
            <AlertCircle className="h-4 w-4 mr-2" />
            Operational ({typeCounts.operational})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Best Practices Assessment</CardTitle>
              <CardDescription>
                {activeTab === 'configuration' 
                  ? 'Configuration compliance and recommendations'
                  : activeTab === 'operational'
                  ? 'Operational status and system health checks'
                  : 'Complete system health and configuration assessment'
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredConditions.map((condition) => (
                  <Collapsible key={condition.id}>
                    <div className="border rounded-lg p-4">
                      <CollapsibleTrigger
                        className="flex items-center justify-between w-full text-left hover:bg-muted/50 rounded p-2 -m-2"
                        onClick={() => toggleExpanded(condition.id)}
                      >
                        <div className="flex items-start space-x-3 flex-1">
                          {getStatusIcon(condition.status)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge 
                                variant={getStatusBadgeVariant(condition.status)}
                                className="text-xs"
                              >
                                {condition.status}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {condition.type}
                              </Badge>
                            </div>
                            <p className="font-medium text-sm leading-relaxed">
                              {condition.criteria}
                            </p>
                          </div>
                        </div>
                        {expandedItems.has(condition.id) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        )}
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent className="pt-4">
                        <div className="pl-7 space-y-4">
                          {/* Detailed Description */}
                          <div>
                            <h4 className="font-medium text-sm mb-2">Description</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {condition.detailedDescription}
                            </p>
                          </div>
                          
                          {/* Affected Components */}
                          {condition.causeBy.length > 0 && (
                            <div>
                              <h4 className="font-medium text-sm mb-2">Affected Components</h4>
                              <div className="space-y-2">
                                {condition.causeBy.map((cause, index) => (
                                  <div key={index} className="flex items-center space-x-2 text-sm">
                                    {getCauseTypeIcon(cause.type)}
                                    <Badge variant="secondary" className="text-xs">
                                      {cause.type}
                                    </Badge>
                                    <span className="text-muted-foreground">
                                      {cause.name || `${cause.type} (ID: ${cause.id || 'N/A'})`}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Action Buttons */}
                          <div className="flex space-x-2">
                            {condition.status !== 'Good' && (
                              <Button size="sm" variant="outline">
                                View Details
                              </Button>
                            )}
                            {condition.causeBy.length > 0 && (
                              <Button size="sm" variant="ghost">
                                Show Affected Items
                              </Button>
                            )}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
                
                {filteredConditions.length === 0 && (
                  <div className="text-center py-12">
                    <div className="flex flex-col items-center">
                      <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-lg font-medium">No conditions found</p>
                      <p className="text-sm text-muted-foreground">
                        {searchTerm || statusFilter !== 'all'
                          ? 'Try adjusting your filters'
                          : 'All best practices are being followed'
                        }
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}