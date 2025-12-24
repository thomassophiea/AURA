import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { GitBranch, RefreshCw, AlertCircle, Plus } from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

interface AdoptionRule {
  id?: string;
  priority?: number;
  deviceType?: string;
  serialNumberPattern?: string;
  macAddressPattern?: string;
  targetSite?: string;
  targetProfile?: string;
  enabled?: boolean;
}

export function AdoptionRulesManagement() {
  const [rules, setRules] = useState<AdoptionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadAdoptionRules();
  }, []);

  const loadAdoptionRules = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/devices/adoptionrules', {
        method: 'GET'
      });

      if (response.ok) {
        const data = await response.json();
        const rulesList = Array.isArray(data) ? data : (data.rules ? data.rules : []);
        setRules(rulesList);
      } else if (response.status === 404) {
        setError('Device adoption rules API not available on this controller version');
        setRules([]);
      } else {
        throw new Error('Failed to load adoption rules');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load adoption rules');
      setRules([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAdoptionRules();
    setRefreshing(false);
    toast.success('Adoption rules refreshed');
  };

  return (
    <div className="h-full overflow-auto">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <GitBranch className="h-8 w-8" />
              Device Adoption Rules
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage automatic device adoption and assignment rules
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button disabled>
              <Plus className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
          </div>
        </div>

        {error && (
          <Alert className="border-yellow-500">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Adoption Rules</CardTitle>
            <CardDescription>
              Define rules for automatically adopting and configuring new devices
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : rules.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No adoption rules configured</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Priority</TableHead>
                    <TableHead>Device Type</TableHead>
                    <TableHead>Match Pattern</TableHead>
                    <TableHead>Target Site</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule, idx) => (
                    <TableRow key={rule.id || idx}>
                      <TableCell className="font-medium">{rule.priority || idx + 1}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{rule.deviceType || 'Any'}</Badge>
                      </TableCell>
                      <TableCell>
                        {rule.serialNumberPattern || rule.macAddressPattern || 'All devices'}
                      </TableCell>
                      <TableCell>{rule.targetSite || 'Default'}</TableCell>
                      <TableCell>
                        <Badge variant={rule.enabled !== false ? 'default' : 'secondary'}>
                          {rule.enabled !== false ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" disabled>
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
