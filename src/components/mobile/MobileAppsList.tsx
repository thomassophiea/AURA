/**
 * MobileAppsList - Simplified applications view
 * Top apps only, no complex analytics
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { MobileStatusList } from './MobileStatusList';
import { MobileStatusRow } from './MobileStatusRow';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { apiService } from '@/services/api';
import { useHaptic } from '@/hooks/useHaptic';
import { useOfflineCache } from '@/hooks/useOfflineCache';

interface MobileAppsListProps {
  currentSite: string;
}

export function MobileAppsList({ currentSite }: MobileAppsListProps) {
  const haptic = useHaptic();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: apps, loading, error, refresh } = useOfflineCache(
    `apps_${currentSite}`,
    async () => {
      console.log('[MobileAppsList] Fetching applications...');
      const data = await apiService.getApplications();
      console.log('[MobileAppsList] Received apps data:', data);
      console.log('[MobileAppsList] Apps count:', Array.isArray(data) ? data.length : 0);
      return Array.isArray(data) ? data : [];
    },
    60000 // Apps change less frequently
  );

  // Debug logging
  useEffect(() => {
    console.log('[MobileAppsList] State update - apps:', apps, 'loading:', loading, 'error:', error);
  }, [apps, loading, error]);

  // Format bytes
  const formatBytes = (bytes: number | undefined): string => {
    if (!bytes) return 'N/A';
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  // Filter and search
  const filteredApps = useMemo(() => {
    if (!apps) return [];

    let filtered = apps;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((app: any) =>
        app.name?.toLowerCase().includes(query) ||
        app.category?.toLowerCase().includes(query)
      );
    }

    // Sort by usage (bytes or client count)
    return filtered.sort((a: any, b: any) => {
      const aBytes = a.bytes || a.totalBytes || 0;
      const bBytes = b.bytes || b.totalBytes || 0;
      return bBytes - aBytes;
    }).slice(0, 50); // Top 50 apps only
  }, [apps, searchQuery]);

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="p-4 space-y-3 border-b border-border sticky top-0 bg-background z-10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search applications..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-11"
          />
        </div>

        {/* Result Count */}
        <p className="text-xs text-muted-foreground">
          {filteredApps.length} application{filteredApps.length !== 1 ? 's' : ''}
          {searchQuery && apps && ` (filtered from ${apps.length})`}
        </p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        <MobileStatusList loading={loading} emptyMessage="">
          {filteredApps.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-center px-4">
              <p className="text-muted-foreground mb-4">
                {error
                  ? 'Unable to load applications. The application manager may not be configured or available.'
                  : apps?.length === 0
                  ? 'No applications are currently installed or available.'
                  : 'No applications match your search.'}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  haptic.light();
                  refresh();
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : (
            filteredApps.map((app: any, index: number) => {
              const usage = formatBytes(app.bytes || app.totalBytes);
              const clients = app.clientCount || app.clients || 0;

              return (
                <MobileStatusRow
                  key={app.name || index}
                  primaryText={app.name || 'Unknown Application'}
                  secondaryText={`${usage} • ${clients} client${clients !== 1 ? 's' : ''}`}
                  status={
                    app.category
                      ? {
                          label: app.category,
                          variant: 'default',
                        }
                      : undefined
                  }
                  rightContent={
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs text-muted-foreground">Rank</div>
                      <div className="text-sm font-semibold">#{index + 1}</div>
                    </div>
                  }
                />
              );
            })
          )}
        </MobileStatusList>
      </div>
    </div>
  );
}
