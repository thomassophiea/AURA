import { useState, useEffect, useMemo, useCallback } from 'react';
import { Server, Globe, Wifi, WifiOff, Building2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUp, ArrowDown, ArrowUpDown, LogIn } from 'lucide-react';
import { Card, CardContent, CardHeader } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { AlertCircle } from 'lucide-react';
import { SiteGroup } from '@/types/domain';
import { useCompoundSearch } from '@/hooks/useCompoundSearch';
import { useTableCustomization } from '@/hooks/useTableCustomization';
import { SITE_GROUPS_TABLE_COLUMNS } from '@/config/siteGroupsTableColumns';
import { PageHeader } from './PageHeader';
import { SearchFilterBar } from './SearchFilterBar';
import { DetailSlideOut } from './DetailSlideOut';
import { ColumnCustomizationDialog } from './ui/ColumnCustomizationDialog';
import { ExportButton } from './ExportButton';
import { useAppContext } from '@/contexts/AppContext';
import { apiService } from '../services/api';

interface SiteGroupsPageProps {
  onNavigateToSites?: (siteGroupId: string, siteGroupName: string) => void;
}

export function SiteGroupsPage({ onNavigateToSites }: SiteGroupsPageProps) {
  // Data state
  const [siteGroups, setSiteGroups] = useState<SiteGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [selectedGroup, setSelectedGroup] = useState<SiteGroup | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Sort state
  const [sortField, setSortField] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Compound search
  const { query, setQuery, filterRows, hasActiveSearch } = useCompoundSearch<SiteGroup>({
    storageKey: 'site-groups-search',
    fields: [
      sg => sg.name,
      sg => sg.description,
      sg => sg.primary_controller,
      sg => sg.secondary_controller,
      sg => sg.controller_url,
      sg => sg.region,
      sg => sg.connection_status,
    ],
  });

  // Column customization
  const columnCustomization = useTableCustomization({
    tableId: 'site-groups',
    columns: SITE_GROUPS_TABLE_COLUMNS,
    storageKey: 'siteGroupsVisibleColumns',
    enableViews: false,
    enablePersistence: true,
  });

  // AppContext for site groups
  const { siteGroups: contextSiteGroups, isLoadingOrg, refreshSiteGroups } = useAppContext();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Ensure site groups are loaded
      if (contextSiteGroups.length === 0) {
        await refreshSiteGroups();
      }
      // Enrich with site counts from /v3/sites
      try {
        const rawSites = await apiService.getSites();
        const countMap = new Map<string, number>();
        // The default site group for sites that don't carry an explicit site_group_id.
        // Since each controller maps to exactly one site group, untagged sites belong
        // to the current (or sole) site group.
        const defaultSgId = contextSiteGroups.find(sg => sg.is_default)?.id
          || (contextSiteGroups.length === 1 ? contextSiteGroups[0].id : undefined);
        rawSites.forEach((s: any) => {
          const sgId = s.site_group_id || s.siteGroupId || defaultSgId || 'default';
          countMap.set(sgId, (countMap.get(sgId) || 0) + 1);
        });
        const enriched = contextSiteGroups.map(sg => ({
          ...sg,
          site_count: countMap.get(sg.id) ?? sg.site_count ?? 0,
        }));
        setSiteGroups(enriched);
      } catch {
        // If sites API fails, show groups without site counts
        setSiteGroups(contextSiteGroups.map(sg => ({ ...sg, site_count: sg.site_count ?? 0 })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load site groups');
    } finally {
      setLoading(false);
    }
  }, [contextSiteGroups, refreshSiteGroups]);

  useEffect(() => {
    loadData();
  }, [contextSiteGroups]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived / computed
  const filteredGroups = useMemo(() => filterRows(siteGroups), [filterRows, siteGroups]);

  const sortedGroups = useMemo(() => {
    const sorted = [...filteredGroups];
    sorted.sort((a, b) => {
      const aVal = (a as any)[sortField] ?? '';
      const bVal = (b as any)[sortField] ?? '';
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredGroups, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedGroups.length / itemsPerPage));
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedGroups.slice(start, start + itemsPerPage);
  }, [sortedGroups, currentPage, itemsPerPage]);

  // Reset to page 1 when search or sort changes
  useEffect(() => { setCurrentPage(1); }, [query, sortField, sortDirection]);

  // Metric card values
  const connectedCount = useMemo(() => siteGroups.filter(sg => sg.connection_status === 'connected').length, [siteGroups]);
  const disconnectedCount = useMemo(() => siteGroups.filter(sg => sg.connection_status !== 'connected').length, [siteGroups]);
  const totalSites = useMemo(() => siteGroups.reduce((sum, sg) => sum + (sg.site_count ?? 0), 0), [siteGroups]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const { enterSiteGroup } = useAppContext();

  const handleRowClick = (sg: SiteGroup) => {
    setSelectedGroup(sg);
    setIsDetailOpen(true);
  };

  const handleRowDoubleClick = (sg: SiteGroup) => {
    enterSiteGroup(sg);
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedGroups(checked ? new Set(paginatedGroups.map(sg => sg.id)) : new Set());
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  if (loading && siteGroups.length === 0) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-6">
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      {/* Page Header */}
      <PageHeader
        title="Site Groups"
        subtitle={`Controller groups and site assignments${hasActiveSearch ? ` • ${filteredGroups.length} of ${siteGroups.length} results` : ` • ${siteGroups.length} groups`}`}
        icon={Server}
        onRefresh={loadData}
        refreshing={loading}
        actions={
          <>
            <ColumnCustomizationDialog customization={columnCustomization} />
            <ExportButton
              data={sortedGroups}
              columns={columnCustomization.visibleColumnConfigs.map(c => ({ key: c?.key || '', label: c?.label || '' }))}
              filename="site-groups"
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Groups */}
        <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="p-4 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Total Groups</span>
              <div className="p-1.5 rounded-lg badge-gradient-indigo shadow-md group-hover:scale-110 transition-transform">
                <Server className="h-3.5 w-3.5 text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground">{siteGroups.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Controller pairs</p>
          </div>
        </Card>

        {/* Connected */}
        <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="p-4 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Connected</span>
              <div className="p-1.5 rounded-lg badge-gradient-green shadow-md group-hover:scale-110 transition-transform">
                <Wifi className="h-3.5 w-3.5 text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground">{connectedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Active controllers</p>
          </div>
        </Card>

        {/* Disconnected */}
        <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="p-4 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Disconnected</span>
              <div className="p-1.5 rounded-lg badge-gradient-red shadow-md group-hover:scale-110 transition-transform">
                <WifiOff className="h-3.5 w-3.5 text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground">{disconnectedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Offline controllers</p>
          </div>
        </Card>

        {/* Total Sites */}
        <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="p-4 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Total Sites</span>
              <div className="p-1.5 rounded-lg badge-gradient-blue shadow-md group-hover:scale-110 transition-transform">
                <Globe className="h-3.5 w-3.5 text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground">{totalSites}</div>
            <p className="text-xs text-muted-foreground mt-1">Across all groups</p>
          </div>
        </Card>
      </div>

      {/* Table Card */}
      <Card>
        <CardHeader className="pb-3">
          <SearchFilterBar
            searchPlaceholder="Search site groups by name, controller, region, status..."
            searchValue={query}
            onSearchChange={setQuery}
            showTimeRange={false}
            resultCount={filteredGroups.length}
            totalCount={siteGroups.length}
          />
        </CardHeader>
        <CardContent>
          {sortedGroups.length === 0 ? (
            <div className="text-center py-12">
              <Server className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Site Groups Found</h3>
              <p className="text-muted-foreground">
                {hasActiveSearch
                  ? 'No site groups match your current search.'
                  : 'No site groups are configured. Add a controller to create your first site group.'}
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
                          checked={paginatedGroups.length > 0 && paginatedGroups.every(sg => selectedGroups.has(sg.id))}
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
                    {paginatedGroups.map(sg => (
                      <TableRow
                        key={sg.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleRowClick(sg)}
                        onDoubleClick={() => handleRowDoubleClick(sg)}
                      >
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedGroups.has(sg.id)}
                            onCheckedChange={(checked) => handleSelectRow(sg.id, !!checked)}
                          />
                        </TableCell>
                        {columnCustomization.visibleColumnConfigs.map(col => {
                          if (!col) return null;
                          // Special handling for siteCount: render as clickable link
                          if (col.key === 'siteCount') {
                            return (
                              <TableCell key={col.key}>
                                <button
                                  className="text-primary hover:underline font-medium"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onNavigateToSites?.(sg.id, sg.name);
                                  }}
                                >
                                  {sg.site_count ?? 0}
                                </button>
                              </TableCell>
                            );
                          }
                          return (
                            <TableCell key={col.key}>
                              {col.renderCell
                                ? col.renderCell(sg)
                                : String((sg as any)[col.fieldPath || col.key] ?? '—')}
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
                    {((currentPage - 1) * itemsPerPage) + 1}–{Math.min(currentPage * itemsPerPage, sortedGroups.length)} of {sortedGroups.length}
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

      {/* Detail Slide-Out */}
      <DetailSlideOut
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={selectedGroup?.name || 'Site Group Details'}
        description="Controller pair details and site assignments"
        width="lg"
      >
        {selectedGroup && (
          <SiteGroupDetailContent
            group={selectedGroup}
            onNavigateToSites={onNavigateToSites}
            onClose={() => setIsDetailOpen(false)}
          />
        )}
      </DetailSlideOut>
    </div>
  );
}

// ── Inline Detail Component ────────────────────────────────────────────────

interface SiteGroupDetailContentProps {
  group: SiteGroup;
  onNavigateToSites?: (siteGroupId: string, siteGroupName: string) => void;
  onClose?: () => void;
}

function SiteGroupDetailContent({ group, onNavigateToSites, onClose }: SiteGroupDetailContentProps) {
  const { enterSiteGroup } = useAppContext();
  const statusConfig: Record<string, { className: string; label: string }> = {
    connected:    { className: 'text-green-500', label: 'Connected' },
    disconnected: { className: 'text-red-500',   label: 'Disconnected' },
    error:        { className: 'text-orange-500', label: 'Error' },
    unknown:      { className: 'text-muted-foreground', label: 'Unknown' },
  };
  const status = statusConfig[group.connection_status] || statusConfig.unknown;

  return (
    <div className="space-y-6">
      {/* Name & Status */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{group.name}</h3>
          {group.description && (
            <p className="text-sm text-muted-foreground mt-1">{group.description}</p>
          )}
        </div>
        <Badge
          variant={group.connection_status === 'connected' ? 'default' : 'destructive'}
          className="shrink-0 ml-2"
        >
          {status.label}
        </Badge>
      </div>

      {/* Enter Site Group */}
      <Button
        className="w-full"
        onClick={() => {
          enterSiteGroup(group);
          onClose?.();
        }}
      >
        <LogIn className="h-4 w-4 mr-2" />
        Enter Site Group
      </Button>

      {/* Overview */}
      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Primary Controller</span>
          <span className="font-mono text-xs">{group.primary_controller || group.controller_url || '—'}</span>
        </div>
        {group.secondary_controller && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Secondary Controller</span>
            <span className="font-mono text-xs">{group.secondary_controller}</span>
          </div>
        )}
        {group.region && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Region</span>
            <span>{group.region}</span>
          </div>
        )}
        {group.last_connected_at && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last Connected</span>
            <span>{new Date(group.last_connected_at).toLocaleString()}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Default Group</span>
          <Badge variant={group.is_default ? 'default' : 'secondary'}>
            {group.is_default ? 'Yes' : 'No'}
          </Badge>
        </div>
      </div>

      {/* Site Count — clickable */}
      <div className="p-4 rounded-lg border bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Sites in this group</p>
            <p className="text-2xl font-bold">{group.site_count ?? 0}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onNavigateToSites?.(group.id, group.name);
              onClose?.();
            }}
          >
            <Building2 className="h-4 w-4 mr-2" />
            View Sites
          </Button>
        </div>
      </div>

      {/* Tags */}
      {group.tags && group.tags.length > 0 && (
        <div>
          <p className="text-sm text-muted-foreground mb-2">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {group.tags.map(tag => (
              <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* XIQ Info */}
      {group.xiq_authenticated && (
        <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-2 text-sm">
            <Wifi className="h-4 w-4 text-emerald-500" />
            <span className="font-medium text-emerald-600">XIQ Cloud Connected</span>
          </div>
          {group.xiq_region && (
            <p className="text-xs text-muted-foreground mt-1">Region: {group.xiq_region}</p>
          )}
        </div>
      )}
    </div>
  );
}
