import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { Radio, Settings, RefreshCw, AlertCircle, TrendingUp } from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

interface RFProfile {
  id: string;
  name: string;
  canEdit: boolean;
  canDelete: boolean;
  type: string;
  smartRf?: {
    basic: {
      sensitivity: string;
      coverageHoleRecovery: boolean;
      interferenceRecovery: boolean;
      neighborRecovery: boolean;
    };
  };
}

export function RFManagementTools() {
  const [profiles, setProfiles] = useState<RFProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadRFProfiles();
  }, []);

  const loadRFProfiles = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiService.makeAuthenticatedRequest('/v3/rfmgmt', {
        method: 'GET'
      });

      if (response.ok) {
        const data = await response.json();
        const profilesList = Array.isArray(data) ? data : [];
        setProfiles(profilesList);
      } else if (response.status === 404) {
        setError('RF Management API not available on this Extreme Platform ONE version');
        setProfiles([]);
      } else {
        throw new Error('Failed to load RF profiles');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load RF profiles');
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadRFProfiles();
    setRefreshing(false);
    toast.success('RF profiles refreshed');
  };

  return (
    <div className="h-full overflow-auto">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Radio className="h-8 w-8" />
              RF Management Tools
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage RF profiles, Smart RF settings, and wireless optimization
            </p>
          </div>
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {error && (
          <Alert className="border-yellow-500">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>RF Management Profiles</CardTitle>
            <CardDescription>
              Configure RF settings, Smart RF optimization, and radio parameters
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : profiles.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Radio className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No RF profiles found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Profile Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Smart RF</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium">{profile.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{profile.type}</Badge>
                      </TableCell>
                      <TableCell>
                        {profile.smartRf && (
                          <div className="text-sm">
                            <div>Sensitivity: {profile.smartRf.basic.sensitivity}</div>
                            <div className="flex gap-2 mt-1">
                              {profile.smartRf.basic.coverageHoleRecovery && (
                                <Badge variant="secondary" className="text-xs">Coverage</Badge>
                              )}
                              {profile.smartRf.basic.interferenceRecovery && (
                                <Badge variant="secondary" className="text-xs">Interference</Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" disabled={!profile.canEdit}>
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
