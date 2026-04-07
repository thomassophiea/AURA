/**
 * Deployment Mode Selector Component
 *
 * Allows user to select deployment mode for a site:
 * - ALL_PROFILES_AT_SITE: Assign to all profiles at site (default)
 * - INCLUDE_ONLY: Assign only to selected profiles
 * - EXCLUDE_SOME: Assign to all except selected profiles
 */

import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { MapPin, Users, CheckCircle, XCircle } from 'lucide-react';
import type { DeploymentMode } from '../../types/network';

interface DeploymentModeSelectorProps {
  siteName: string;
  siteId: string;
  profileCount: number;
  selectedMode: DeploymentMode;
  onModeChange: (mode: DeploymentMode) => void;
  onConfigureProfiles?: () => void;  // Opens profile picker
  selectedProfilesCount?: number;    // For INCLUDE_ONLY mode
  excludedProfilesCount?: number;    // For EXCLUDE_SOME mode
}

export function DeploymentModeSelector({
  siteName,
  siteId,
  profileCount,
  selectedMode,
  onModeChange,
  onConfigureProfiles,
  selectedProfilesCount = 0,
  excludedProfilesCount = 0
}: DeploymentModeSelectorProps) {
  const getEffectiveProfileCount = (): number => {
    switch (selectedMode) {
      case 'ALL_PROFILES_AT_SITE':
        return profileCount;
      case 'INCLUDE_ONLY':
        return selectedProfilesCount;
      case 'EXCLUDE_SOME':
        return profileCount - excludedProfilesCount;
      default:
        return 0;
    }
  };

  const needsConfiguration =
    (selectedMode === 'INCLUDE_ONLY' && selectedProfilesCount === 0) ||
    (selectedMode === 'EXCLUDE_SOME' && excludedProfilesCount === 0);

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          {siteName}
        </CardTitle>
        <CardDescription className="text-xs">
          {profileCount} profile{profileCount !== 1 ? 's' : ''} available
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup
          value={selectedMode}
          onValueChange={(value) => onModeChange(value as DeploymentMode)}
        >
          {/* ALL_PROFILES_AT_SITE Option */}
          <div className="flex items-start space-x-3 space-y-0">
            <RadioGroupItem value="ALL_PROFILES_AT_SITE" id={`all-${siteId}`} />
            <Label
              htmlFor={`all-${siteId}`}
              className="flex-1 cursor-pointer"
            >
              <div className="font-medium">All Profiles at Site</div>
              <div className="text-xs text-muted-foreground">
                WLAN will be assigned to all {profileCount} profile{profileCount !== 1 ? 's' : ''} at this site
              </div>
            </Label>
            {selectedMode === 'ALL_PROFILES_AT_SITE' && (
              <Badge variant="default" className="gap-1">
                <CheckCircle className="h-3 w-3" />
                All
              </Badge>
            )}
          </div>

          {/* INCLUDE_ONLY Option */}
          <div className="flex items-start space-x-3 space-y-0">
            <RadioGroupItem value="INCLUDE_ONLY" id={`include-${siteId}`} />
            <Label
              htmlFor={`include-${siteId}`}
              className="flex-1 cursor-pointer"
            >
              <div className="font-medium">Specific Profiles Only</div>
              <div className="text-xs text-muted-foreground">
                Select which profiles should receive this WLAN
              </div>
            </Label>
            {selectedMode === 'INCLUDE_ONLY' && (
              <Badge variant="secondary" className="gap-1">
                <Users className="h-3 w-3" />
                {selectedProfilesCount} selected
              </Badge>
            )}
          </div>

          {/* EXCLUDE_SOME Option */}
          <div className="flex items-start space-x-3 space-y-0">
            <RadioGroupItem value="EXCLUDE_SOME" id={`exclude-${siteId}`} />
            <Label
              htmlFor={`exclude-${siteId}`}
              className="flex-1 cursor-pointer"
            >
              <div className="font-medium">All Except Selected</div>
              <div className="text-xs text-muted-foreground">
                Assign to all profiles except selected ones
              </div>
            </Label>
            {selectedMode === 'EXCLUDE_SOME' && (
              <Badge variant="outline" className="gap-1">
                <XCircle className="h-3 w-3" />
                {excludedProfilesCount} excluded
              </Badge>
            )}
          </div>
        </RadioGroup>

        {/* Profile Configuration Button */}
        {(selectedMode === 'INCLUDE_ONLY' || selectedMode === 'EXCLUDE_SOME') && onConfigureProfiles && (
          <div className="pt-2 border-t">
            <Button
              variant={needsConfiguration ? "default" : "outline"}
              size="sm"
              onClick={onConfigureProfiles}
              className="w-full"
            >
              {needsConfiguration ? (
                <>Configure Profiles</>
              ) : (
                <>Change Selection</>
              )}
            </Button>
          </div>
        )}

        {/* Summary */}
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground">
            Profiles to receive WLAN:
          </span>
          <Badge
            variant={getEffectiveProfileCount() > 0 ? "default" : "secondary"}
            className="gap-1"
          >
            <CheckCircle className="h-3 w-3" />
            {getEffectiveProfileCount()} of {profileCount}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
