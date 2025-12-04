import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { Shuffle, RefreshCw, AlertCircle, Download, Shield, Info } from 'lucide-react';
import { apiService, Station } from '../services/api';
import { isRandomizedMac, getMacAddressInfo, formatMacAddress } from '../services/macAddressUtils';
import { toast } from 'sonner';

/**
 * Randomized MAC Address Report Component
 * 
 * Displays all clients using randomized/locally administered MAC addresses
 * for privacy protection.
 */
export function RandomizedMacReport() {
  const [stations, setStations] = useState<Station[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadStations();
  }, []);

  const loadStations = async () => {
    // Check authentication before loading
    if (!apiService.isAuthenticated()) {
      console.warn('[RandomizedMacReport] User not authenticated, skipping data load');
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      const stationsData = await apiService.getStationsWithSiteCorrelation();
      const stationsArray = Array.isArray(stationsData) ? stationsData : [];
      setStations(stationsArray);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connected clients');
      console.error('Error loading stations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const randomizedStations = stations.filter(station => isRandomizedMac(station.macAddress));
  const permanentStations = stations.filter(station => !isRandomizedMac(station.macAddress));

  const exportToCSV = () => {
    const headers = ['MAC Address', 'IP Address', 'Hostname', 'Site', 'Access Point', 'Type'];
    const rows = randomizedStations.map(station => [
      station.macAddress,
      station.ipAddress || '',
      station.hostName || '',
      station.siteName || '',
      station.apName || station.apDisplayName || '',
      'Randomized'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `randomized-mac-addresses-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success('Report exported', {
      description: `Exported ${randomizedStations.length} randomized MAC addresses to CSV`
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Randomized MAC Address Report</h2>
          <p className="text-muted-foreground">
            Identify and track clients using privacy-enabled randomized MAC addresses
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={exportToCSV} variant="outline" size="sm" disabled={randomizedStations.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button onClick={loadStations} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>About Randomized MAC Addresses:</strong> Mobile operating systems like iOS and Android 
          use randomized MAC addresses to prevent location tracking. These addresses are identifiable by 
          the second character of the first octet being 2, 6, A, or E. The locally administered bit (bit 1) 
          is set, indicating the address is not globally unique.
        </AlertDescription>
      </Alert>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stations.length}</div>
            <p className="text-xs text-muted-foreground">
              Connected devices
            </p>
          </CardContent>
        </Card>

        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Randomized MACs</CardTitle>
            <Shuffle className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-500">{randomizedStations.length}</div>
            <p className="text-xs text-muted-foreground">
              Privacy-enabled devices
            </p>
          </CardContent>
        </Card>

        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Permanent MACs</CardTitle>
            <Shield className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{permanentStations.length}</div>
            <p className="text-xs text-muted-foreground">
              Standard devices
            </p>
          </CardContent>
        </Card>

        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Privacy Rate</CardTitle>
            <Shuffle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stations.length > 0 ? Math.round((randomizedStations.length / stations.length) * 100) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Using randomization
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Randomized MAC Addresses Table */}
      <Card className="surface-2dp">
        <CardHeader>
          <CardTitle>Randomized MAC Addresses ({randomizedStations.length})</CardTitle>
          <CardDescription>
            Clients using locally administered (randomized) MAC addresses for privacy protection
          </CardDescription>
        </CardHeader>
        <CardContent>
          {randomizedStations.length === 0 ? (
            <div className="text-center py-8">
              <Shuffle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Randomized MAC Addresses Found</h3>
              <p className="text-muted-foreground">
                No clients are currently using randomized MAC addresses for privacy.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>MAC Address</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Hostname</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Access Point</TableHead>
                    <TableHead>Manufacturer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {randomizedStations.map((station, index) => {
                    const macInfo = getMacAddressInfo(station.macAddress);
                    return (
                      <TableRow key={station.macAddress || index}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Shuffle className="h-4 w-4 text-purple-500 flex-shrink-0" />
                            <span className="font-mono">{station.macAddress}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono">{station.ipAddress || '-'}</span>
                        </TableCell>
                        <TableCell>{station.hostName || '-'}</TableCell>
                        <TableCell>{station.siteName || '-'}</TableCell>
                        <TableCell>
                          {station.apName || station.apDisplayName || station.apHostname || '-'}
                        </TableCell>
                        <TableCell>{station.manufacturer || 'Unknown'}</TableCell>
                        <TableCell>
                          <Badge variant={station.status?.toLowerCase() === 'connected' ? 'default' : 'secondary'}>
                            {station.status || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {macInfo.isLocallyAdministered ? 'Locally Administered' : 'Standard'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Examples and Reference */}
      <Card className="surface-1dp">
        <CardHeader>
          <CardTitle>Examples of Randomized MAC Addresses</CardTitle>
          <CardDescription>
            How to identify randomized MAC addresses by examining the second character
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Randomized MAC Address Examples:</h4>
              <ul className="space-y-2 font-mono text-sm">
                <li className="flex items-center gap-2">
                  <Shuffle className="h-3 w-3 text-purple-500" />
                  <span className="font-bold">82</span>:e4:22:47:f0:8f - Second char is <span className="font-bold text-purple-500">2</span>
                </li>
                <li className="flex items-center gap-2">
                  <Shuffle className="h-3 w-3 text-purple-500" />
                  <span className="font-bold">92</span>:b1:b8:42:d1:85 - Second char is <span className="font-bold text-purple-500">2</span>
                </li>
                <li className="flex items-center gap-2">
                  <Shuffle className="h-3 w-3 text-purple-500" />
                  <span className="font-bold">32</span>:8c:27:26:72:34 - Second char is <span className="font-bold text-purple-500">2</span>
                </li>
                <li className="flex items-center gap-2">
                  <Shuffle className="h-3 w-3 text-purple-500" />
                  <span className="font-bold">5e</span>:9b:a8:8a:55:a6 - Second char is <span className="font-bold text-purple-500">e</span>
                </li>
                <li className="flex items-center gap-2">
                  <Shuffle className="h-3 w-3 text-purple-500" />
                  <span className="font-bold">A6</span>:3d:e1:90:41:72 - Second char is <span className="font-bold text-purple-500">6</span>
                </li>
              </ul>
            </div>
            
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                <strong>Technical Details:</strong> A randomized MAC address is identifiable because the second 
                character of its first octet (first two hex digits) will be 2, 6, A, or E. This indicates that 
                the locally administered bit (bit 1) is set, meaning the address is not globally unique and is 
                managed locally by the device for privacy purposes.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
