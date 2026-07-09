/**
 * FeatureCatalogView — the 26-feature card grid in four accent-coded sections
 * with a global search that filters by label, description or group name.
 */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '../../ui/input';
import { cn } from '../../ui/utils';
import { CATALOG_GROUPS, ACCENTS, type CatalogGroup } from './catalogData';
import { FeatureCard } from './FeatureCard';
import type { FeatureCounts } from './useFeatureCounts';

interface FeatureCatalogViewProps {
  counts: FeatureCounts;
  onNavigate: (viewId: string) => void;
}

function filterGroups(query: string): CatalogGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return CATALOG_GROUPS;
  return CATALOG_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        group.label.toLowerCase().includes(q)
    ),
  })).filter((group) => group.items.length > 0);
}

export function FeatureCatalogView({ counts, onNavigate }: FeatureCatalogViewProps) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => filterGroups(query), [query]);

  return (
    <div className="flex flex-col gap-6">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search features…"
          className="pl-9"
          aria-label="Search Configure features"
        />
      </div>

      {groups.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No features match &ldquo;{query}&rdquo;
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.key}>
            <div className="mb-3 flex items-center gap-3">
              <span className={cn('h-4 w-1 rounded-full', ACCENTS[group.accent].bar)} aria-hidden />
              <div>
                <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
                <p className="text-xs text-muted-foreground">{group.description}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => (
                <FeatureCard
                  key={item.id}
                  item={item}
                  accent={group.accent}
                  count={item.countKey ? counts[item.countKey] : null}
                  onSelect={onNavigate}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
