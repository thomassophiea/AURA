import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Label } from './ui/label';
import { AlertCircle, Building2, Search, RefreshCw, Filter, Plus, Edit, Trash2, Copy, Globe, Clock, MapPin, Users, Radio, Network, Settings, Info } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { apiService } from '../services/api';
import { toast } from 'sonner';

interface ConfigureSitesProps {
  onShowDetail?: (siteId: string, siteName: string) => void;
}

interface Site {
  id: string;
  siteName: string;
  name?: string;
  country?: string;
  timezone?: string;
  campus?: string;
  status?: string;
  deviceGroups?: any[];
  switchSerialNumbers?: string[];
  aps?: number;
  switches?: number;
  networks?: number;
  roles?: number;
  adoptionPrimary?: string;
  adoptionBackup?: string;
  activeAPs?: number;
  nonActiveAPs?: number;
  allClients?: number;
  canDelete?: boolean;
  canEdit?: boolean;
  [key: string]: any;
}

interface Country {
  name: string;
  code: string;
  timezones: string[];
}

export function ConfigureSites({ onShowDetail }: ConfigureSitesProps) {
  const [sites, setSites] = useState<Site[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredSites, setFilteredSites] = useState<Site[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [countrySearch, setCountrySearch] = useState('');
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    country: '',
    timezone: '',
    description: ''
  });
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [currentLoadingStep, setCurrentLoadingStep] = useState('');

  useEffect(() => {
    let mounted = true;
    let safetyTimeoutRef: { current: NodeJS.Timeout | null } = { current: null };
    
    const initializeComponent = async () => {
      try {
        // Load countries first (this is synchronous)
        loadCountries();
        
        // Set safety timeout that checks if component is still mounted and loading
        safetyTimeoutRef.current = setTimeout(() => {
          if (mounted) {
            console.warn('Sites loading took too long, forcing stop');
            setLoading(false);
            setLoadingProgress(0);
            setCurrentLoadingStep('');
            setError('Loading sites timed out. Please try refreshing the page.');
          }
        }, 10000); // 10 second overall timeout
        
        // Load sites and clear timeout on completion
        await loadSites();
        
        // Clear the timeout since loading completed
        if (safetyTimeoutRef.current) {
          clearTimeout(safetyTimeoutRef.current);
          safetyTimeoutRef.current = null;
        }
        
      } catch (error) {
        if (mounted) {
          console.error('Failed to initialize sites component:', error);
          setLoading(false);
          setLoadingProgress(0);
          setCurrentLoadingStep('');
          setError('Failed to initialize sites. Please try refreshing the page.');
        }
        // Clear the timeout on error as well
        if (safetyTimeoutRef.current) {
          clearTimeout(safetyTimeoutRef.current);
          safetyTimeoutRef.current = null;
        }
      }
    };
    
    initializeComponent();
    
    return () => {
      mounted = false;
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
      }
      // Cancel any pending API requests when component unmounts
      apiService.cancelAllRequests();
    };
  }, []);

  useEffect(() => {
    // Filter sites based on search term - ensure sites is an array
    if (!Array.isArray(sites)) {
      setFilteredSites([]);
      return;
    }
    
    const filtered = sites.filter(site => {
      // Safety check for site object
      if (!site || typeof site !== 'object') {
        return false;
      }
      
      const searchLower = searchTerm.toLowerCase();
      return (
        (site.siteName && site.siteName.toLowerCase().includes(searchLower)) ||
        (site.name && site.name.toLowerCase().includes(searchLower)) ||
        (site.country && site.country.toLowerCase().includes(searchLower)) ||
        (site.campus && site.campus.toLowerCase().includes(searchLower))
      );
    });
    setFilteredSites(filtered);
  }, [sites, searchTerm]);

  const loadSites = async (retryCount = 0): Promise<void> => {
    const maxRetries = 1; // Reduced retries to prevent long waits
    const timeoutMs = 6000; // 6 second timeout per attempt
    
    try {
      // Only set loading state on initial attempt
      if (retryCount === 0) {
        setLoading(true);
        setError(null);
      }
      
      setCurrentLoadingStep(`Loading sites${retryCount > 0 ? ` (retry ${retryCount})` : ''}...`);
      setLoadingProgress(30);
      console.log(`Loading sites from API (attempt ${retryCount + 1}/${maxRetries + 1})...`);
      
      setLoadingProgress(60);
      setCurrentLoadingStep('Fetching sites data...');
      
      // Use the correct v3/sites endpoint with timeout
      const response = await apiService.makeAuthenticatedRequest('/v3/sites', {
        method: 'GET'
      }, timeoutMs);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch sites: ${response.status} ${response.statusText}`);
      }

      const sitesData = await response.json();
      
      setLoadingProgress(90);
      setCurrentLoadingStep('Processing site data...');
      
      console.log('Raw sites data from API:', sitesData);
      
      // Ensure we have an array and handle various API response formats
      let sitesList: any[] = [];
      if (Array.isArray(sitesData)) {
        sitesList = sitesData;
      } else if (sitesData && Array.isArray(sitesData.sites)) {
        sitesList = sitesData.sites;
      } else if (sitesData && Array.isArray(sitesData.data)) {
        sitesList = sitesData.data;
      } else {
        console.warn('Unexpected sites data format:', sitesData);
        sitesList = [];
      }

      // Process sites data for the configure view
      const processedSites = sitesList.map(site => {
        // Count devices from device groups
        const totalAPs = site.deviceGroups?.reduce((total: number, group: any) => {
          return total + (group.apSerialNumbers?.length || 0);
        }, 0) || 0;
        
        const totalSwitches = site.switchSerialNumbers?.length || 0;
        const totalNetworks = site.deviceGroups?.length || 0;

        return {
          ...site,
          name: site.siteName, // Map siteName to name for compatibility
          siteName: site.siteName,
          aps: totalAPs,
          switches: totalSwitches,
          networks: totalNetworks,
          roles: 0, // Would need additional API call
          adoptionPrimary: site.adoptionPrimary || '', 
          adoptionBackup: site.adoptionBackup || '', 
          activeAPs: site.activeAPs || totalAPs, 
          nonActiveAPs: site.nonActiveAPs || 0,
          allClients: site.allClients || 0, 
          campus: site.treeNode?.campus || site.campus || '',
          status: site.status || (totalAPs + totalSwitches > 0 ? 'active' : 'inactive')
        };
      });
      
      console.log('Processed sites:', processedSites);
      
      // Success - update state
      setSites(processedSites);
      setLoadingProgress(100);
      setCurrentLoadingStep('Complete!');
      setError(null);
      
      // Clear loading state after a brief delay to show completion
      setTimeout(() => {
        setLoading(false);
        setLoadingProgress(0);
        setCurrentLoadingStep('');
      }, 500);
      
      if (processedSites.length === 0) {
        console.warn('No sites returned from API');
        toast.info('No sites found', {
          description: 'No sites are currently configured in the system.'
        });
      } else {
        console.log(`Loaded ${processedSites.length} sites successfully`);
        toast.success(`Loaded ${processedSites.length} sites successfully`);
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load sites';
      console.error(`Error loading sites (attempt ${retryCount + 1}):`, err);
      
      // Check if we should retry
      if (retryCount < maxRetries && 
          !errorMessage.includes('Session expired') && 
          !errorMessage.includes('Authentication required') &&
          !errorMessage.includes('403') &&
          !errorMessage.includes('404') &&
          !errorMessage.includes('422')) {
        
        const retryDelay = 2000; // 2 second delay
        console.log(`Retrying in ${retryDelay}ms...`);
        
        toast.warning(`Loading sites failed, retrying...`, {
          description: errorMessage,
          duration: 3000
        });
        
        setTimeout(() => {
          loadSites(retryCount + 1);
        }, retryDelay);
        
        return; // Don't set error state yet, we're retrying
      }
      
      // All retries failed or non-retryable error
      setError(errorMessage);
      setLoading(false);
      setLoadingProgress(0);
      setCurrentLoadingStep('');
      
      toast.error('Failed to load sites', {
        description: `${errorMessage}${retryCount > 0 ? ` (after ${retryCount + 1} attempts)` : ''}`,
        duration: 8000
      });
    }
  };

  const loadCountries = async () => {
    // Countries API endpoint not available - using empty array for site creation
    // Site creation should work without country validation
    setCountries([]);
  };

  const getStatusBadge = (status: string | undefined) => {
    if (!status) return <Badge variant="secondary">Unknown</Badge>;
    
    switch (status.toLowerCase()) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>;
      case 'inactive':
        return <Badge className="bg-red-100 text-red-800 border-red-200">Inactive</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleCreateSite = async () => {
    // Validate required fields
    if (!formData.name.trim()) {
      toast.error('Site name is required');
      return;
    }
    
    // Country and timezone are now optional since countries API is not available
    // if (!formData.country) {
    //   toast.error('Country is required');
    //   return;
    // }

    // if (!formData.timezone) {
    //   toast.error('Timezone is required');
    //   return;
    // }

    try {
      console.log('Creating site with data:', formData);
      
      // Prepare the site creation payload according to Campus Controller API
      const siteData = {
        siteName: formData.name.trim(),
        ...(formData.country && { country: formData.country }),
        ...(formData.timezone && { timezone: formData.timezone }),
        ...(formData.description && { description: formData.description.trim() })
      };

      console.log('Site creation payload:', siteData);

      // Use the API service method
      const createdSite = await apiService.createSite(siteData);
      console.log('Site created successfully:', createdSite);

      // Close the dialog
      setIsCreateDialogOpen(false);
      
      // Reset form
      setFormData({ name: '', country: '', timezone: '', description: '' });
      
      // Show success message
      toast.success('Site created successfully', {
        description: `Site "${formData.name}" has been created.`
      });

      // Reload sites to show the new site
      loadSites();

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create site';
      console.error('Site creation error:', err);
      
      toast.error('Failed to create site', {
        description: errorMessage,
        duration: 8000
      });
    }
  };

  const handleEditSite = async () => {
    toast.info('Site editing not yet implemented', {
      description: 'Please use the Campus Controller web interface to edit sites.'
    });
  };

  const handleDeleteSite = async (site: Site) => {
    toast.info('Site deletion not yet implemented', {
      description: 'Please use the Campus Controller web interface to delete sites.'
    });
  };

  const handleCloneSite = async (site: Site) => {
    toast.info('Site cloning not yet implemented', {
      description: 'Please use the Campus Controller web interface to clone sites.'
    });
  };

  const openEditDialog = (site: Site) => {
    setEditingSite(site);
    setFormData({
      name: site.name || '',
      country: site.country || '',
      timezone: site.timezone || '',
      description: site.description || ''
    });
    setIsEditDialogOpen(true);
  };

  const openCreateDialog = () => {
    setFormData({ name: '', country: '', timezone: '', description: '' });
    setIsCreateDialogOpen(true);
  };

  // Safe filtering with proper validation
  const filteredCountries = Array.isArray(countries) ? countries.filter(country => {
    // Safety check for country object and name property
    if (!country || typeof country !== 'object' || !country.name) {
      return false;
    }
    return country.name.toLowerCase().includes(countrySearch.toLowerCase());
  }) : [];

  const selectedCountry = Array.isArray(countries) ? countries.find(c => c && c.name === formData.country) : null;
  const availableTimezones = selectedCountry?.timezones || [];

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Loading Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="surface-1dp">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex justify-center items-center min-h-[400px]">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center space-x-2">
                <Building2 className="h-5 w-5 animate-pulse" />
                <span>Loading Sites</span>
              </CardTitle>
              <CardDescription>
                Fetching site data from Campus Controller...
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{currentLoadingStep}</span>
                  <span>{loadingProgress}%</span>
                </div>
                <div className="w-full bg-secondary/20 rounded-full h-2">
                  <div 
                    className="bg-secondary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${loadingProgress}%` }}
                  />
                </div>
              </div>
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    apiService.cancelAllRequests();
                    setLoading(false);
                    setError('Load operation cancelled by user');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {error}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null);
              loadSites();
            }}
            className="ml-4"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sites</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sites.length}</div>
            <p className="text-xs text-muted-foreground">
              Network locations
            </p>
          </CardContent>
        </Card>

        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sites</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sites.filter(s => s.status?.toLowerCase() === 'active').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Sites with devices
            </p>
          </CardContent>
        </Card>

        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sites.reduce((total, site) => total + (site.aps || 0) + (site.switches || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              APs and switches
            </p>
          </CardContent>
        </Card>

        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sites.reduce((total, site) => total + (site.allClients || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Connected users
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Header and Controls */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sites..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setError(null);
              loadSites();
            }}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="flex items-center space-x-2">

          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add Site
          </Button>
        </div>
      </div>

      {/* Sites Table */}
      <Card className="surface-2dp">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-headline-6 text-high-emphasis">
            <Building2 className="h-5 w-5" />
            <span>Sites ({filteredSites.length})</span>
          </CardTitle>
          <CardDescription>
            Manage and configure network sites
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Networks</TableHead>
                  <TableHead>Switches</TableHead>
                  <TableHead>APs</TableHead>
                  <TableHead>Active APs</TableHead>
                  <TableHead>Non Active APs</TableHead>
                  <TableHead>All Clients</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSites.map((site) => (
                  <TableRow 
                    key={site.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onShowDetail?.(site.id, site.siteName || site.name)}
                  >
                    <TableCell>
                      {getStatusBadge(site.status)}
                    </TableCell>
                    <TableCell className="font-medium">{site.siteName || site.name || 'Unnamed Site'}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        <Globe className="h-3 w-3 text-muted-foreground" />
                        <span>{site.country || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1 bg-secondary/10 border border-secondary/20 rounded-full px-3 py-1.5 min-w-[60px] justify-center">
                        <Settings className="h-4 w-4 text-secondary" />
                        <span className="text-sm font-semibold text-secondary">
                          {site.roles || 0}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1 bg-secondary/10 border border-secondary/20 rounded-full px-3 py-1.5 min-w-[60px] justify-center">
                        <Network className="h-4 w-4 text-secondary" />
                        <span className="text-sm font-semibold text-secondary">
                          {site.networks || 0}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1 bg-secondary/10 border border-secondary/20 rounded-full px-3 py-1.5 min-w-[60px] justify-center">
                        <Network className="h-4 w-4 text-secondary" />
                        <span className="text-sm font-semibold text-secondary">
                          {site.switches || 0}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1 bg-secondary/10 border border-secondary/20 rounded-full px-3 py-1.5 min-w-[60px] justify-center">
                        <Radio className="h-4 w-4 text-secondary" />
                        <span className="text-sm font-semibold text-secondary">
                          {site.aps || 0}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center space-x-1 bg-secondary/10 border border-secondary/20 rounded-full px-3 py-1.5 min-w-[60px] justify-center">
                        <Radio className="h-4 w-4 text-secondary" />
                        <span className="text-sm font-semibold text-secondary">
                          {site.activeAPs || 0}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1 bg-secondary/10 border border-secondary/20 rounded-full px-3 py-1.5 min-w-[60px] justify-center">
                        <Radio className="h-4 w-4 text-secondary" />
                        <span className="text-sm font-semibold text-secondary">
                          {site.nonActiveAPs || 0}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1 bg-secondary/10 border border-secondary/20 rounded-full px-3 py-1.5 min-w-[60px] justify-center">
                        <Users className="h-4 w-4 text-secondary" />
                        <span className="text-sm font-semibold text-secondary">
                          {site.allClients || 0}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(site)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCloneSite(site)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSite(site)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {filteredSites.length === 0 && !loading && (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? 'No sites match your search criteria.' : 'No sites found. Use the "Add Site" button to create your first site.'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create Site Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Site</DialogTitle>
            <DialogDescription>
              Add a new site to your network infrastructure
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="siteName">Site Name</Label>
              <Input
                id="siteName"
                placeholder="Site1"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="country">Country</Label>
              <Select
                value={formData.country}
                onValueChange={(value) => {
                  setFormData({ ...formData, country: value, timezone: '' });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Search countries" />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input
                      placeholder="Search countries..."
                      value={countrySearch}
                      onChange={(e) => setCountrySearch(e.target.value)}
                      className="mb-2"
                    />
                  </div>
                  {filteredCountries.length > 0 ? filteredCountries.map((country) => (
                    <SelectItem key={country.code || country.name} value={country.name}>
                      <div className="flex items-center space-x-2">
                        <Globe className="h-4 w-4" />
                        <span>{country.name}</span>
                      </div>
                    </SelectItem>
                  )) : (
                    <div className="p-2 text-sm text-muted-foreground">
                      No countries available
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {formData.country && availableTimezones.length > 0 && (
              <div>
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={formData.timezone}
                  onValueChange={(value) => setFormData({ ...formData, timezone: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTimezones.map((timezone) => (
                      <SelectItem key={timezone} value={timezone}>
                        <div className="flex items-center space-x-2">
                          <Clock className="h-4 w-4" />
                          <span>{timezone}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                placeholder="Site description..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateSite}>
                Create Site
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Site Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Site</DialogTitle>
            <DialogDescription>
              Update site configuration
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="editSiteName">Site Name</Label>
              <Input
                id="editSiteName"
                placeholder="Site1"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="editCountry">Country</Label>
              <Select
                value={formData.country}
                onValueChange={(value) => {
                  setFormData({ ...formData, country: value, timezone: '' });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Search countries" />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input
                      placeholder="Search countries..."
                      value={countrySearch}
                      onChange={(e) => setCountrySearch(e.target.value)}
                      className="mb-2"
                    />
                  </div>
                  {filteredCountries.length > 0 ? filteredCountries.map((country) => (
                    <SelectItem key={country.code || country.name} value={country.name}>
                      <div className="flex items-center space-x-2">
                        <Globe className="h-4 w-4" />
                        <span>{country.name}</span>
                      </div>
                    </SelectItem>
                  )) : (
                    <div className="p-2 text-sm text-muted-foreground">
                      No countries available
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {formData.country && availableTimezones.length > 0 && (
              <div>
                <Label htmlFor="editTimezone">Timezone</Label>
                <Select
                  value={formData.timezone}
                  onValueChange={(value) => setFormData({ ...formData, timezone: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTimezones.map((timezone) => (
                      <SelectItem key={timezone} value={timezone}>
                        <div className="flex items-center space-x-2">
                          <Clock className="h-4 w-4" />
                          <span>{timezone}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="editDescription">Description (Optional)</Label>
              <Input
                id="editDescription"
                placeholder="Site description..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditSite}>
                Update Site
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}