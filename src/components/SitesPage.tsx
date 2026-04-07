import { useState, useEffect, useMemo, useCallback } from 'react';
import { Building2, Users, Wifi, Activity, MapPin, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUp, ArrowDown, ArrowUpDown, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { Site } from '@/types/domain';
import { useCompoundSearch } from '@/hooks/useCompoundSearch';
import { useTableCustomization } from '@/hooks/useTableCustomization';
import { SITES_TABLE_COLUMNS } from '@/config/sitesTableColumns';
import { PageHeader } from './PageHeader';
import { SearchFilterBar } from './SearchFilterBar';
import { DetailSlideOut } from './DetailSlideOut';
import { ColumnCustomizationDialog } from './ui/ColumnCustomizationDialog';
import { ExportButton } from './ExportButton';
import { useAppContext } from '@/contexts/AppContext';
import { apiService } from '../services/api';

// Session storage key for cross-page filter persistence
const FILTER_SESSION_KEY = 'sites-group-filter';

interface SitesPageProps {
  siteGroupFilter?: { id: string; name: string } | null;
  onClearFilter?: () => void;
  onShowDetail?: (siteId: string, siteName: string) => void;
}

export function SitesPage({ siteGroupFilter, onClearFilter, onShowDetail }: SitesPageProps) {
  // Data state
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set());
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Sort state
  const [sortField, setSortField] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // AppContext for site group name lookup
  const { siteGroups } = useAppContext();

  // Compound search
  const { query, setQuery, filterRows, hasActiveSearch } = useCompoundSearch<Site>({
    storageKey: 'sites-search',
    fields: [
      s => s.name,
      s => s.site_group_name,
      s => s.location,
      s => s.country,
      s => s.status,
      s => s.tags?.join(' '),
      s => s.description,
    ],
  });

  // Column customization
  const columnCustomization = useTableCustomization({
    tableId: 'sites',
    columns: SITES_TABLE_COLUMNS,
    storageKey: 'sitesVisibleColumns',
    enableViews: false,
    enablePersistence: true,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rawSites = await apiService.getSites();

      // Default site group for sites without an explicit site_group_id
      const defaultSg = siteGroups.find(sg => sg.is_default)
        || (siteGroups.length === 1 ? siteGroups[0] : undefined);

      // Map raw api.Site → domain.Site with enrichment
      const mapped: Site[] = (rawSites as any[]).map(s => {
        const sgId = s.site_group_id || s.siteGroupId || defaultSg?.id || '';
        const sgName = s.site_group_name || s.siteGroupName ||
          siteGroups.find(sg => sg.id === sgId)?.name ||
          defaultSg?.name || '';

        return {
          id: s.id,
          name: s.name || s.siteName || s.displayName || 'Unnamed Site',
          site_group_id: sgId,
          site_group_name: sgName,
          org_id: s.org_id || s.orgId,
          location: s.location || s.address || s.campus || undefined,
          country: s.country || undefined,
          timezone: s.timezone || undefined,
          description: s.description || undefined,
          status: normalizeStatus(s.status),
          ap_count: s.aps ?? s.ap_count ?? s.activeAPs ?? undefined,
          client_count: s.allClients ?? s.client_count ?? undefined,
          network_count: s.networks ?? s.network_count ?? undefined,
          tags: Array.isArray(s.tags) ? s.tags : undefined,
          created_at: s.created_at || undefined,
          updated_at: s.updated_at || undefined,
          siteName: s.siteName,
          displayName: s.displayName,
        } satisfies Site;
      });

      setSites(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sites');
    } finally {
      setLoading(false);
    }
  }, [siteGroups]);

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-enrich site_group_name if siteGroups loads after sites
  useEffect(() => {
    if (siteGroups.length > 0 && sites.length > 0) {
      setSites(prev => prev.map(s => ({
        ...s,
        site_group_name: s.site_group_name || siteGroups.find(sg => sg.id === s.site_group_id)?.name || '',
      })));
    }
  }, [siteGroups]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cross-page pre-filter (applied before compound search)
  const preFilteredSites = useMemo(() => {
    if (!siteGroupFilter) return sites;
    return sites.filter(s => s.site_group_id === siteGroupFilter.id);
  }, [sites, siteGroupFilter]);

  const filteredSites = useMemo(() => filterRows(preFilteredSites), [filterRows, preFilteredSites]);

  const sortedSites = useMemo(() => {
    const sorted = [...filteredSites];
    sorted.sort((a, b) => {
      const aVal = (a as any)[sortField] ?? '';
      const bVal = (b as any)[sortField] ?? '';
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredSites, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedSites.length / itemsPerPage));
  const paginatedSites = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedSites.slice(start, start + itemsPerPage);
  }, [sortedSites, currentPage, itemsPerPage]);

  useEffect(() => { setCurrentPage(1); }, [query, sortField, sortDirection, siteGroupFilter]);

  // Metric card values
  const activeSiteCount = useMemo(() => filteredSites.filter(s => s.status === 'active').length, [filteredSites]);
  const inactiveSiteCount = useMemo(() => filteredSites.filter(s => s.status !== 'active').length, [filteredSites]);
  const totalAPs = useMemo(() => filteredSites.reduce((sum, s) => sum + (s.ap_count ?? 0), 0), [filteredSites]);
  const totalClients = useMemo(() => filteredSites.reduce((sum, s) => sum + (s.client_count ?? 0), 0), [filteredSites]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleRowClick = (site: Site) => {
    if (onShowDetail) {
      onShowDetail(site.id, site.name);
    } else {
      setSelectedSite(site);
      setIsDetailOpen(true);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedSites(checked ? new Set(paginatedSites.map(s => s.id)) : new Set());
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    setSelectedSites(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleDismissFilter = () => {
    try { sessionStorage.removeItem(FILTER_SESSION_KEY); } catch { /* noop */ }
    onClearFilter?.();
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  if (loading && sites.length === 0) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-6">
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      {/* Page Header */}
      <PageHeader
        title="Sites"
        subtitle={`Network sites${siteGroupFilter ? ` • Filtered: ${siteGroupFilter.name}` : ''}${hasActiveSearch ? ` • ${filteredSites.length} of ${preFilteredSites.length} results` : ` • ${preFilteredSites.length} sites`}`}
        icon={Building2}
        onRefresh={loadData}
        refreshing={loading}
        actions={
          <>
            <ColumnCustomizationDialog customization={columnCustomization} />
            <ExportButton
              data={sortedSites}
              columns={columnCustomization.visibleColumnConfigs.map(c => ({ key: c?.key || '', label: c?.label || '' }))}
              filename="sites"
            />
          </>
        }
      />

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Sites */}
        <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="p-4 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Total Sites</span>
              <div className="p-1.5 rounded-lg badge-gradient-indigo shadow-md group-hover:scale-110 transition-transform">
                <Building2 className="h-3.5 w-3.5 text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground">{filteredSites.length}</div>
            <p className="text-xs text-muted-foreground mt-1">{siteGroupFilter ? 'Filtered' : 'All sites'}</p>
          </div>
        </Card>

        {/* Active */}
        <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="p-4 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Active</span>
              <div className="p-1.5 rounded-lg badge-gradient-green shadow-md group-hover:scale-110 transition-transform">
                <Activity className="h-3.5 w-3.5 text-white animate-pulse" />
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground">{activeSiteCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Operational</p>
          </div>
        </Card>

        {/* Inactive */}
        <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="p-4 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Inactive</span>
              <div className="p-1.5 rounded-lg badge-gradient-red shadow-md group-hover:scale-110 transition-transform">
                <MapPin className="h-3.5 w-3.5 text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground">{inactiveSiteCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Non-active</p>
          </div>
        </Card>

        {/* Total APs */}
        <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="p-4 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Total APs</span>
              <div className="p-1.5 rounded-lg badge-gradient-blue shadow-md group-hover:scale-110 transition-transform">
                <Wifi className="h-3.5 w-3.5 text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground">{totalAPs}</div>
            <p className="text-xs text-muted-foreground mt-1">Access points</p>
          </div>
        </Card>

        {/* Total Clients */}
        <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="p-4 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Total Clients</span>
              <div className="p-1.5 rounded-lg badge-gradient-violet shadow-md group-hover:scale-110 transition-transform">
                <Users className="h-3.5 w-3.5 text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground">{totalClients}</div>
            <p className="text-xs text-muted-foreground mt-1">Connected clients</p>
          </div>
        </Card>
      </div>

      {/* Cross-page filter badge */}
      {siteGroupFilter && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="px-3 py-1.5 gap-2 text-sm">
            <Building2 className="h-3.5 w-3.5" />
            Site Group: <span className="font-semibold">{siteGroupFilter.name}</span>
            <button
              onClick={handleDismissFilter}
              className="ml-1 rounded-full hover:bg-muted-foreground/20 transition-colors"
              aria-label="Clear site group filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </Badge>
          <span className="text-sm text-muted-foreground">
            Showing {filteredSites.length} of {sites.length} sites
          </span>
        </div>
      )}

      {/* Table Card */}
      <Card>
        <CardHeader className="pb-3">
          <SearchFilterBar
            searchPlaceholder="Search sites by name, group, location, status..."
            searchValue={query}
            onSearchChange={setQuery}
            showTimeRange={false}
            resultCount={filteredSites.length}
            totalCount={preFilteredSites.length}
          />
        </CardHeader>
        <CardContent>
          {sortedSites.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Sites Found</h3>
              <p className="text-muted-foreground">
                {hasActiveSearch
                  ? 'No sites match your current search.'
                  : siteGroupFilter
                    ? `No sites found in site group "${siteGroupFilter.name}".`
                    : 'No sites are configured.'}
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={paginatedSites.length > 0 && paginatedSites.every(s => selectedSites.has(s.id))}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      {columnCustomization.visibleColumnConfigs.map(col => col && (
                        <TableHead
                          key={col.key}
                          className={`select-none ${col.sortable ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}
                          onClick={() => col.sortable && handleSort(col.fieldPath || col.key)}
                        >
                          <div className="flex items-center">
                            {col.label}
                            {col.sortable && <SortIcon field={col.fieldPath || col.key} />}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedSites.map(site => (
                      <TableRow
                        key={site.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleRowClick(site)}
                      >
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedSites.has(site.id)}
                            onCheckedChange={(checked) => handleSelectRow(site.id, !!checked)}
                          />
                        </TableCell>
                        {columnCustomization.visibleColumnConfigs.map(col => {
                          if (!col) return null;
                          return (
                            <TableCell key={col.key}>
                              {col.renderCell
                                ? col.renderCell(site)
                                : String((site as any)[col.fieldPath || col.key] ?? '—')}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Rows per page:</span>
                  <Select value={String(itemsPerPage)} onValueChange={v => { setItemsPerPage(Number(v)); setCurrentPage(1); }}>
                    <SelectTrigger className="h-8 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 25, 50, 100].map(n => (
                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <span>
                    {((currentPage - 1) * itemsPerPage) + 1}–{Math.min(currentPage * itemsPerPage, sortedSites.length)} of {sortedSites.length}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Inline detail slide-out (when no onShowDetail prop) */}
      {!onShowDetail && (
        <DetailSlideOut
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          title={selectedSite?.name || 'Site Details'}
          description="Site overview, statistics, and variables"
          width="lg"
        >
          {selectedSite && <SiteDetailContent site={selectedSite} />}
        </DetailSlideOut>
      )}
    </div>
  );
}

// ── Inline Site Detail Component ──────────────────────────────────────────

interface SiteDetailContentProps {
  site: Site;
}

function SiteDetailContent({ site }: SiteDetailContentProps) {
  const statusVariant = site.status === 'active' ? 'default' : site.status === 'error' ? 'destructive' : 'secondary';

  return (
    <div className="space-y-6">
      {/* Name & Status */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{site.name}</h3>
          {site.description && (
            <p className="text-sm text-muted-foreground mt-1">{site.description}</p>
          )}
        </div>
        {site.status && (
          <Badge variant={statusVariant} className="shrink-0 ml-2">
            {site.status.charAt(0).toUpperCase() + site.status.slice(1)}
          </Badge>
        )}
      </div>

      {/* Overview */}
      <div className="space-y-3 text-sm">
        {site.site_group_name && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Site Group</span>
            <span className="font-medium">{site.site_group_name}</span>
          </div>
        )}
        {site.location && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Location</span>
            <span>{site.location}</span>
          </div>
        )}
        {site.country && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Country</span>
            <span>{site.country}</span>
          </div>
        )}
        {site.timezone && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Timezone</span>
            <span>{site.timezone}</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div>
        <h4 className="text-sm font-semibold mb-3">Statistics</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg bg-muted/30 border">
            <div className="text-xl font-bold">{site.ap_count ?? 0}</div>
            <div className="text-xs text-muted-foreground">APs</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/30 border">
            <div className="text-xl font-bold">{site.client_count ?? 0}</div>
            <div className="text-xs text-muted-foreground">Clients</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/30 border">
            <div className="text-xl font-bold">{site.network_count ?? 0}</div>
            <div className="text-xs text-muted-foreground">Networks</div>
          </div>
        </div>
      </div>

      {/* Variables Placeholder */}
      <div>
        <h4 className="text-sm font-semibold mb-3">Site Variables</h4>
        <div className="flex flex-col items-center justify-center py-8 text-center border rounded-lg border-dashed">
          <Building2 className="h-10 w-10 text-muted-foreground mb-3" />
          <h4 className="text-sm font-medium">Site Variables</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Site-level variables will appear here. This feature is coming soon.
          </p>
        </div>
      </div>

      {/* Tags */}
      {site.tags && site.tags.length > 0 && (
        <div>
          <p className="text-sm text-muted-foreground mb-2">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {site.tags.map(tag => (
              <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeStatus(status?: string): Site['status'] | undefined {
  if (!status) return undefined;
  const s = status.toLowerCase();
  if (s === 'active' || s === 'online' || s === 'up') return 'active';
  if (s === 'inactive' || s === 'offline' || s === 'down') return 'inactive';
  if (s === 'provisioning' || s === 'pending') return 'provisioning';
  if (s === 'error' || s === 'critical') return 'error';
  return undefined;
}
