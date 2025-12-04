import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { Progress } from './ui/progress';
import { Skeleton } from './ui/skeleton';
import {
  Download,
  RefreshCw,
  Upload,
  CheckCircle,
  AlertCircle,
  Clock,
  Wifi,
  Search,
  Filter
} from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

interface APUpgradeInfo {
  serialNumber: string;
  displayName: string;
  model: string;
  currentVersion: string;
  availableVersion: string;
  updateAvailable: boolean;
  status: 'current' | 'upgrade_available' | 'upgrading' | 'failed';
  site: string;
  lastChecked: string;
  releaseNotes?: string;
}

export function APsUpgradeReport() {
  const [aps, setAps] = useState<APUpgradeInfo[]>([]);
  const [filteredAps, setFilteredAps] = useState<APUpgradeInfo[]>([]);
  const [selectedAps, setSelectedAps] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSite, setFilterSite] = useState<string>('all');
  const [sites, setSites] = useState<string[]>([]);

  useEffect(() => {
    loadUpgradeData();
  }, []);

  useEffect(() => {
    filterAps();
  }, [aps, searchTerm, filterStatus, filterSite]);

  const loadUpgradeData = async () => {
    setLoading(true);
    try {
      const [sitesData] = await Promise.all([
        apiService.getSites()
      ]);

      // Get AP firmware upgrade info from API
      const response = await apiService.makeAuthenticatedRequest('/v1/aps/firmware/status', {
        method: 'GET'
      });

      if (response.ok) {
        const data = await response.json();
        setAps(Array.isArray(data) ? data : []);
      }

      // Extract unique sites
      const uniqueSites = Array.from(new Set(sitesData.map(s => s.name)));
      setSites(uniqueSites);
    } catch (error) {
      console.error('Failed to load upgrade data:', error);
      toast.error('Failed to load AP upgrade information');
    } finally {
      setLoading(false);
    }
  };

  const filterAps = () => {
    let filtered = [...aps];

    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(ap => ap.status === filterStatus);
    }

    // Filter by site
    if (filterSite !== 'all') {
      filtered = filtered.filter(ap => ap.site === filterSite);
    }

    // Filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(ap =>
        ap.displayName.toLowerCase().includes(search) ||
        ap.serialNumber.toLowerCase().includes(search) ||
        ap.model.toLowerCase().includes(search)
      );
    }

    setFilteredAps(filtered);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const upgradeableAps = filteredAps
        .filter(ap => ap.updateAvailable && ap.status !== 'upgrading')
        .map(ap => ap.serialNumber);
      setSelectedAps(new Set(upgradeableAps));
    } else {
      setSelectedAps(new Set());
    }
  };

  const handleSelectAp = (serialNumber: string, checked: boolean) => {
    const newSelected = new Set(selectedAps);
    if (checked) {
      newSelected.add(serialNumber);
    } else {
      newSelected.delete(serialNumber);
    }
    setSelectedAps(newSelected);
  };

  const handleUpgradeSelected = async () => {
    if (selectedAps.size === 0) {
      toast.error('No APs selected for upgrade');
      return;
    }

    setUpgrading(true);
    toast.info(`Starting upgrade for ${selectedAps.size} AP(s)...`);

    try {
      // Update status to upgrading locally
      const updatedAps = aps.map(ap =>
        selectedAps.has(ap.serialNumber)
          ? { ...ap, status: 'upgrading' as const }
          : ap
      );
      setAps(updatedAps);

      // Call API to initiate firmware upgrade
      const response = await apiService.makeAuthenticatedRequest('/v1/aps/firmware/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serialNumbers: Array.from(selectedAps)
        })
      });

      if (response.ok) {
        toast.success('AP upgrades initiated successfully');
        setSelectedAps(new Set());
        // Reload upgrade data to get updated status
        await loadUpgradeData();
      } else {
        throw new Error('Upgrade request failed');
      }
    } catch (error) {
      console.error('Failed to upgrade APs:', error);
      toast.error('Upgrade failed for some APs');

      // Mark failed APs
      const failedAps = aps.map(ap =>
        selectedAps.has(ap.serialNumber)
          ? { ...ap, status: 'failed' as const }
          : ap
      );
      setAps(failedAps);
    } finally {
      setUpgrading(false);
    }
  };

  const handleCheckForUpdates = async () => {
    toast.info('Checking for firmware updates...');
    await loadUpgradeData();
    toast.success('Update check completed');
  };

  const getStatusBadge = (status: APUpgradeInfo['status']) => {
    switch (status) {
      case 'current':
        return <Badge className="bg-green-500">Up to Date</Badge>;
      case 'upgrade_available':
        return <Badge className="bg-blue-500">Update Available</Badge>;
      case 'upgrading':
        return <Badge className="bg-yellow-500">Upgrading...</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: APUpgradeInfo['status']) => {
    switch (status) {
      case 'current':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'upgrade_available':
        return <Download className="h-4 w-4 text-blue-500" />;
      case 'upgrading':
        return <Clock className="h-4 w-4 text-yellow-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const stats = {
    total: aps.length,
    current: aps.filter(ap => ap.status === 'current').length,
    updateAvailable: aps.filter(ap => ap.updateAvailable).length,
    upgrading: aps.filter(ap => ap.status === 'upgrading').length
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
          <Wifi className="h-6 w-6" />
          AP Firmware Upgrade Report
        </h2>
        <p className="text-muted-foreground">
          Manage firmware upgrades across all access points
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Total APs</p>
              <p className="text-3xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Up to Date</p>
              <p className="text-3xl font-bold text-green-500">{stats.current}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Updates Available</p>
              <p className="text-3xl font-bold text-blue-500">{stats.updateAvailable}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Upgrading</p>
              <p className="text-3xl font-bold text-yellow-500">{stats.upgrading}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters and Actions</CardTitle>
          <CardDescription>Filter APs and manage firmware upgrades</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search APs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="current">Up to Date</SelectItem>
                  <SelectItem value="upgrade_available">Update Available</SelectItem>
                  <SelectItem value="upgrading">Upgrading</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Site Filter */}
            <div className="space-y-2">
              <Label>Site</Label>
              <Select value={filterSite} onValueChange={setFilterSite}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites.map(site => (
                    <SelectItem key={site} value={site}>
                      {site}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {selectedAps.size} AP(s) selected
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckForUpdates}
                disabled={upgrading}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Check for Updates
              </Button>
              <Button
                size="sm"
                onClick={handleUpgradeSelected}
                disabled={selectedAps.size === 0 || upgrading}
              >
                <Upload className="h-4 w-4 mr-1" />
                Upgrade Selected ({selectedAps.size})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Access Points</CardTitle>
          <CardDescription>
            Showing {filteredAps.length} of {aps.length} APs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedAps.size === filteredAps.filter(ap => ap.updateAvailable).length && selectedAps.size > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>AP Name</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Current Version</TableHead>
                <TableHead>Available Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Checked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAps.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No APs found matching the current filters
                  </TableCell>
                </TableRow>
              ) : (
                filteredAps.map(ap => (
                  <TableRow key={ap.serialNumber}>
                    <TableCell>
                      <Checkbox
                        checked={selectedAps.has(ap.serialNumber)}
                        onCheckedChange={(checked) => handleSelectAp(ap.serialNumber, checked as boolean)}
                        disabled={!ap.updateAvailable || ap.status === 'upgrading'}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(ap.status)}
                        <div>
                          <div>{ap.displayName}</div>
                          <div className="text-xs text-muted-foreground">{ap.serialNumber}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{ap.model}</TableCell>
                    <TableCell>{ap.site}</TableCell>
                    <TableCell className="font-mono text-sm">{ap.currentVersion}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {ap.availableVersion}
                      {ap.updateAvailable && (
                        <span className="ml-2 text-blue-500">⬆</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(ap.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(ap.lastChecked).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Upgrade Progress */}
          {upgrading && (
            <div className="mt-4 p-4 border rounded-lg bg-accent">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Upgrading APs...</span>
                  <span className="text-sm text-muted-foreground">
                    {selectedAps.size} AP(s)
                  </span>
                </div>
                <Progress value={66} />
                <p className="text-xs text-muted-foreground">
                  Please do not close this page during the upgrade process
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
