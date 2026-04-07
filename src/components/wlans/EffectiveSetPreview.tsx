/**
 * Effective Set Preview Component
 *
 * Shows a preview of which profiles will/won't receive the WLAN
 * based on selected deployment modes across all sites.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { CheckCircle, XCircle, Users, MapPin, AlertCircle } from 'lucide-react';
import type { EffectiveProfileSet } from '../../types/network';
import { effectiveSetCalculator } from '../../services/effectiveSetCalculator';

interface EffectiveSetPreviewProps {
  effectiveSets: EffectiveProfileSet[];
  className?: string;
}

export function EffectiveSetPreview({ effectiveSets, className }: EffectiveSetPreviewProps) {
  // Calculate totals across all sites
  const totalProfiles = effectiveSets.reduce(
    (sum, set) => sum + set.allProfiles.length,
    0
  );

  const totalSelected = effectiveSets.reduce(
    (sum, set) => sum + set.selectedProfiles.length,
    0
  );

  const totalExcluded = effectiveSets.reduce(
    (sum, set) => sum + set.excludedProfiles.length,
    0
  );

  // Deduplicate profiles across sites (a profile might appear in multiple sites)
  const allUniqueSelected = effectiveSetCalculator.mergeEffectiveSets(effectiveSets);
  const uniqueSelectedCount = allUniqueSelected.length;

  if (effectiveSets.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Select sites to see deployment preview</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Deployment Preview
        </CardTitle>
        <CardDescription className="text-xs">
          WLAN will be assigned to these profiles
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Statistics */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-secondary/10 rounded-lg border">
            <div className="text-2xl font-bold">{uniqueSelectedCount}</div>
            <div className="text-xs text-muted-foreground">Will Receive</div>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg border">
            <div className="text-2xl font-bold text-muted-foreground">{totalExcluded}</div>
            <div className="text-xs text-muted-foreground">Will NOT Receive</div>
          </div>
          <div className="text-center p-3 bg-accent rounded-lg border">
            <div className="text-2xl font-bold">{totalProfiles}</div>
            <div className="text-xs text-muted-foreground">Total Profiles</div>
          </div>
        </div>

        {/* Site-by-Site Breakdown */}
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-3">
            {effectiveSets.map((effectiveSet) => {
              const summary = effectiveSetCalculator.getSummary(effectiveSet);
              const modeDescription = effectiveSetCalculator.getDeploymentModeDescription(
                effectiveSet.deploymentMode
              );

              return (
                <Card key={effectiveSet.siteId} className="border-l-4 border-l-primary/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MapPin className="h-3 w-3" />
                      {effectiveSet.siteName}
                    </CardTitle>
                    <CardDescription className="text-xs">{modeDescription}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Coverage</span>
                        <span className="font-medium">{summary.assignedPercent}%</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${summary.assignedPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Profile Counts */}
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        {summary.assigned} Assigned
                      </Badge>
                      {summary.excluded > 0 && (
                        <Badge variant="outline" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          {summary.excluded} Excluded
                        </Badge>
                      )}
                    </div>

                    {/* Profile List Preview (first 3) */}
                    {effectiveSet.selectedProfiles.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">
                          Profiles:
                        </div>
                        <div className="space-y-1">
                          {effectiveSet.selectedProfiles.slice(0, 3).map((profile) => (
                            <div
                              key={profile.id}
                              className="text-xs flex items-center gap-1 text-muted-foreground"
                            >
                              <CheckCircle className="h-3 w-3 text-green-500" />
                              {profile.name || profile.profileName || profile.id}
                            </div>
                          ))}
                          {effectiveSet.selectedProfiles.length > 3 && (
                            <div className="text-xs text-muted-foreground pl-4">
                              +{effectiveSet.selectedProfiles.length - 3} more
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>

        {/* Overall Summary */}
        <div className="pt-3 border-t flex items-center justify-between">
          <span className="text-sm font-medium">Total Profiles to Receive WLAN:</span>
          <Badge variant="default" className="gap-1">
            <CheckCircle className="h-3 w-3" />
            {uniqueSelectedCount}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
