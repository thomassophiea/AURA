import { useState, useEffect, memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, ChevronDown, ChevronRight, ArrowUpDown, Info } from 'lucide-react';
import { apiService } from '../services/api';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface BestPractice {
  id: string;
  criteria: string;
  detailedDescription: string;
  causeBy: Array<{ type: string; name: string | null; id: string | null }>;
  status: 'Good' | 'Warning' | 'Error';
  type: 'Config' | 'Operational';
}

interface BestPracticesResponse {
  timestamp: number;
  conditions: BestPractice[];
}

export function BestPracticesWidget() {
  const [practices, setPractices] = useState<BestPractice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Good' | 'Warning' | 'Error'>('All');
  const [sortBy, setSortBy] = useState<'severity' | 'name'>('severity');
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  useEffect(() => {
    loadBestPractices();
  }, []);

  // Auto-select the most relevant filter based on practice status counts
  useEffect(() => {
    if (!hasAutoSelected && practices.length > 0) {
      const errorCount = practices.filter(p => p.status === 'Error').length;
      const warningCount = practices.filter(p => p.status === 'Warning').length;

      // Prioritize showing issues: Errors > Warnings > All
      if (errorCount > 0) {
        setStatusFilter('Error');
      } else if (warningCount > 0) {
        setStatusFilter('Warning');
      } else {
        setStatusFilter('All');
      }
      setHasAutoSelected(true);
    }
  }, [practices, hasAutoSelected]);

  const loadBestPractices = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/bestpractices/evaluate', {
        method: 'GET'
      });

      if (response.ok) {
        const data: BestPracticesResponse = await response.json();
        setPractices(data.conditions || []);
      } else if (response.status === 404) {
        setError('Best Practices API not available');
      } else {
        throw new Error('Failed to load best practices');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load best practices');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Good':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'Warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'Error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'Good':
        return 'default';
      case 'Warning':
        return 'secondary';
      case 'Error':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const statusCounts = {
    Good: practices.filter(p => p.status === 'Good').length,
    Warning: practices.filter(p => p.status === 'Warning').length,
    Error: practices.filter(p => p.status === 'Error').length,
  };

  // Filter practices based on selected status
  const filteredPractices = statusFilter === 'All'
    ? practices
    : practices.filter(p => p.status === statusFilter);

  // Sort practices
  const sortedPractices = [...filteredPractices].sort((a, b) => {
    if (sortBy === 'severity') {
      const severityOrder = { 'Error': 0, 'Warning': 1, 'Good': 2 };
      return severityOrder[a.status] - severityOrder[b.status];
    } else {
      return a.criteria.localeCompare(b.criteria);
    }
  });

  const displayPractices = sortedPractices;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-yellow-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Best Practices
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Best Practices Evaluation
            </CardTitle>
            <CardDescription>Configuration and operational recommendations</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadBestPractices}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => setStatusFilter(statusFilter === 'Good' ? 'All' : 'Good')}
            className={`flex items-center gap-2 p-3 rounded-lg transition-all cursor-pointer bg-green-50 dark:bg-green-950 hover:bg-green-100 dark:hover:bg-green-900 ${
              statusFilter === 'Good'
                ? 'ring-2 ring-purple-500'
                : ''
            }`}
          >
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div className="text-left">
              <div className="text-2xl font-bold">{statusCounts.Good}</div>
              <div className="text-xs text-muted-foreground">Good</div>
            </div>
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === 'Warning' ? 'All' : 'Warning')}
            className={`flex items-center gap-2 p-3 rounded-lg transition-all cursor-pointer bg-yellow-50 dark:bg-yellow-950 hover:bg-yellow-100 dark:hover:bg-yellow-900 ${
              statusFilter === 'Warning'
                ? 'ring-2 ring-purple-500'
                : ''
            }`}
          >
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <div className="text-left">
              <div className="text-2xl font-bold">{statusCounts.Warning}</div>
              <div className="text-xs text-muted-foreground">Warnings</div>
            </div>
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === 'Error' ? 'All' : 'Error')}
            className={`flex items-center gap-2 p-3 rounded-lg transition-all cursor-pointer bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 ${
              statusFilter === 'Error'
                ? 'ring-2 ring-purple-500'
                : ''
            }`}
          >
            <XCircle className="h-5 w-5 text-red-500" />
            <div className="text-left">
              <div className="text-2xl font-bold">{statusCounts.Error}</div>
              <div className="text-xs text-muted-foreground">Errors</div>
            </div>
          </button>
        </div>

        {/* Filters and Sort */}
        {displayPractices.length > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm">
                {statusFilter === 'All' ? 'All Practices' :
                 statusFilter === 'Good' ? 'Good Practices' :
                 statusFilter === 'Warning' ? 'Warnings' : 'Errors'}
              </h4>
              <Badge variant="outline" className="text-xs">
                {displayPractices.length}
              </Badge>
            </div>
            <Select value={sortBy} onValueChange={(value: 'severity' | 'name') => setSortBy(value)}>
              <SelectTrigger className="w-36">
                <ArrowUpDown className="h-3 w-3 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="severity">By Severity</SelectItem>
                <SelectItem value="name">By Name</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Practices List */}
        {displayPractices.length > 0 && (
          <div className="space-y-2">
            <div className="space-y-2">
              {displayPractices.map((practice) => (
                <Collapsible
                  key={practice.id}
                  open={expandedId === practice.id}
                  onOpenChange={() => setExpandedId(expandedId === practice.id ? null : practice.id)}
                >
                  <div className="border rounded-lg p-3">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-start gap-2">
                        {getStatusIcon(practice.status)}
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{practice.criteria}</span>
                            <Badge variant={getStatusBadgeVariant(practice.status)} className="text-xs">
                              {practice.status}
                            </Badge>
                            <Badge variant="outline" className="text-xs">{practice.type}</Badge>
                          </div>
                          {practice.causeBy.length > 0 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Affected: {practice.causeBy.map(c => c.name || c.type).join(', ')}
                            </div>
                          )}
                        </div>
                        {expandedId === practice.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 pt-2 border-t">
                      <p className="text-sm text-muted-foreground">{practice.detailedDescription}</p>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          </div>
        )}

        {displayPractices.length === 0 && practices.length > 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <Info className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="font-semibold">No {statusFilter !== 'All' ? statusFilter : ''} practices found</p>
            <p className="text-sm">Try selecting a different filter</p>
          </div>
        )}

        {practices.length === 0 && !loading && (
          <div className="text-center py-6 text-green-600 dark:text-green-400">
            <CheckCircle className="h-12 w-12 mx-auto mb-2" />
            <p className="font-semibold">All Best Practices Met!</p>
            <p className="text-sm text-muted-foreground">Your configuration follows all recommended best practices.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
