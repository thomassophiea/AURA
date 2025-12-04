import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Upload, RefreshCw, AlertCircle, Wifi } from 'lucide-react';
import { apiService } from '../services/api';

interface UpgradeImage {
  version: string;
  releaseDate?: string;
  platform?: string;
  size?: number;
}

export function DeviceUpgrade() {
  const [images, setImages] = useState<UpgradeImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('access-points');

  useEffect(() => {
    loadUpgradeImages();
  }, []);

  const loadUpgradeImages = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/aps/upgradeimagelist', {
        method: 'GET'
      });

      if (response.ok) {
        const data = await response.json();
        const imageList = Array.isArray(data) ? data : [];
        setImages(imageList);
      } else if (response.status === 404) {
        setError('Upgrade image API not available on this Extreme Platform ONE version');
        setImages([]);
      } else {
        throw new Error('Failed to load upgrade images');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load upgrade images');
      setImages([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Upload className="h-8 w-8" />
              Device Upgrade Management
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage firmware upgrades for Access Points
            </p>
          </div>
          <Button onClick={loadUpgradeImages} variant="outline">
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

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="access-points">
              <Wifi className="h-4 w-4 mr-2" />
              Access Points
            </TabsTrigger>
          </TabsList>

          <TabsContent value="access-points" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Available Firmware Images</CardTitle>
                <CardDescription>
                  AP firmware versions available for upgrade
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : images.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Upload className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No firmware images available</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Version</TableHead>
                        <TableHead>Platform</TableHead>
                        <TableHead>Release Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {images.map((image, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{image.version}</TableCell>
                          <TableCell>
                            {image.platform && <Badge variant="outline">{image.platform}</Badge>}
                          </TableCell>
                          <TableCell>{image.releaseDate || 'N/A'}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" disabled>
                              Upgrade Selected APs
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}
