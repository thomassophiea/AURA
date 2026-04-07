import { useState, useMemo } from 'react';
import { X, Folder } from 'lucide-react';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import type { WLANAssignmentMode } from '../types/network';
import type { Site } from '../types/network';
import type { SiteGroup } from '../types/domain';

export interface AssignmentSectionProps {
  value: WLANAssignmentMode;
  onChange: (mode: WLANAssignmentMode) => void;
  selectedSiteIds: string[];
  selectedSiteGroupIds: string[];
  onSitesChange: (ids: string[]) => void;
  onSiteGroupsChange: (ids: string[]) => void;
  sites: Site[];
  siteGroups: SiteGroup[];
}

const MODES: { value: WLANAssignmentMode; label: string; description: string }[] = [
  { value: 'unassigned', label: 'Not assigned', description: 'Save globally, deploy later' },
  { value: 'all_sites', label: 'All sites', description: 'Deploy to every site immediately' },
  {
    value: 'selected_targets',
    label: 'Select sites / site groups',
    description: 'Choose specific targets',
  },
];

export function AssignmentSection({
  value,
  onChange,
  selectedSiteIds,
  selectedSiteGroupIds,
  onSitesChange,
  onSiteGroupsChange,
  sites,
  siteGroups,
}: AssignmentSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return { sites: [], siteGroups: [] };
    const q = searchQuery.toLowerCase();
    return {
      sites: sites.filter(
        s => !selectedSiteIds.includes(s.id) && (s.name ?? s.id).toLowerCase().includes(q)
      ),
      siteGroups: siteGroups.filter(
        sg => !selectedSiteGroupIds.includes(sg.id) && sg.name.toLowerCase().includes(q)
      ),
    };
  }, [searchQuery, sites, siteGroups, selectedSiteIds, selectedSiteGroupIds]);

  const hasDropdownResults =
    filteredResults.sites.length > 0 || filteredResults.siteGroups.length > 0;

  const selectedSiteObjects = sites.filter(s => selectedSiteIds.includes(s.id));
  const selectedGroupObjects = siteGroups.filter(sg => selectedSiteGroupIds.includes(sg.id));
  const hasSelections = selectedSiteIds.length > 0 || selectedSiteGroupIds.length > 0;

  const summaryText = useMemo(() => {
    const parts: string[] = [];
    if (selectedSiteGroupIds.length > 0)
      parts.push(
        `${selectedSiteGroupIds.length} group${selectedSiteGroupIds.length !== 1 ? 's' : ''}`
      );
    if (selectedSiteIds.length > 0)
      parts.push(`${selectedSiteIds.length} site${selectedSiteIds.length !== 1 ? 's' : ''}`);
    return parts.join(', ');
  }, [selectedSiteIds, selectedSiteGroupIds]);

  function removeSite(id: string) {
    onSitesChange(selectedSiteIds.filter(s => s !== id));
  }

  function removeSiteGroup(id: string) {
    onSiteGroupsChange(selectedSiteGroupIds.filter(sg => sg !== id));
  }

  function selectSite(site: Site) {
    onSitesChange([...selectedSiteIds, site.id]);
    setSearchQuery('');
    setShowDropdown(false);
  }

  function selectSiteGroup(sg: SiteGroup) {
    onSiteGroupsChange([...selectedSiteGroupIds, sg.id]);
    setSearchQuery('');
    setShowDropdown(false);
  }

  return (
    <div className="space-y-2">
      {MODES.map(mode => (
        <div
          key={mode.value}
          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
            value === mode.value
              ? 'border-primary bg-primary/5'
              : 'border-border hover:bg-accent/50'
          }`}
          onClick={() => onChange(mode.value)}
          role="radio"
          aria-checked={value === mode.value}
        >
          <div
            className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-colors ${
              value === mode.value ? 'border-primary bg-primary' : 'border-muted-foreground'
            }`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-none">{mode.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{mode.description}</p>

            {/* Chip picker — only when this mode is active */}
            {mode.value === 'selected_targets' && value === 'selected_targets' && (
              <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
                {/* Selected chips */}
                {hasSelections && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedGroupObjects.map(sg => (
                      <Badge key={sg.id} variant="secondary" className="gap-1 pr-1 text-xs">
                        <Folder className="h-3 w-3" />
                        {sg.name}
                        <button
                          type="button"
                          aria-label={`Remove ${sg.name}`}
                          className="ml-0.5 rounded-full hover:bg-muted"
                          onClick={() => removeSiteGroup(sg.id)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    {selectedSiteObjects.map(s => (
                      <Badge key={s.id} variant="outline" className="gap-1 pr-1 text-xs">
                        {s.name ?? s.id}
                        <button
                          type="button"
                          aria-label={`Remove ${s.name ?? s.id}`}
                          className="ml-0.5 rounded-full hover:bg-muted"
                          onClick={() => removeSite(s.id)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                {hasSelections && (
                  <p className="text-xs text-muted-foreground">{summaryText} selected</p>
                )}

                {/* Search input */}
                <div className="relative">
                  <Input
                    placeholder="Search sites or groups..."
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    className="h-8 text-xs"
                  />
                  {showDropdown && hasDropdownResults && (
                    <div className="absolute z-50 top-full mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
                      {filteredResults.siteGroups.length > 0 && (
                        <>
                          <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Site Groups
                          </p>
                          {filteredResults.siteGroups.map(sg => (
                            <button
                              key={sg.id}
                              type="button"
                              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-accent text-left"
                              onMouseDown={() => selectSiteGroup(sg)}
                            >
                              <Folder className="h-3 w-3 text-muted-foreground" />
                              {sg.name}
                            </button>
                          ))}
                        </>
                      )}
                      {filteredResults.sites.length > 0 && (
                        <>
                          <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Sites
                          </p>
                          {filteredResults.sites.map(s => (
                            <button
                              key={s.id}
                              type="button"
                              className="w-full px-2 py-1.5 text-xs hover:bg-accent text-left pl-6"
                              onMouseDown={() => selectSite(s)}
                            >
                              {s.name ?? s.id}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Validation hint */}
                {!hasSelections && (
                  <p className="text-xs text-destructive">
                    Select at least one target to continue
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
