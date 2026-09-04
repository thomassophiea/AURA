import { Building2, ChevronRight, MapPin, Network } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';

/**
 * Explicit Organization > Site Group > Site scope, always visible — the
 * product spec requires every request to show its scope and never silently
 * default to Global.
 */
export function ScopeBreadcrumb() {
  const { organization, siteGroup, site } = useAppContext();

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground overflow-hidden">
      <Building2 className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{organization?.name ?? 'Organization'}</span>
      <ChevronRight className="h-3 w-3 shrink-0" />
      <Network className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{siteGroup?.name ?? 'Site Group'}</span>
      {site && (
        <>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate text-foreground/80">{site.name}</span>
        </>
      )}
      {!site && (
        <span className="ml-1 rounded border border-amber-700/40 bg-amber-900/20 px-1.5 py-0.5 text-amber-300">
          No site selected
        </span>
      )}
    </div>
  );
}
