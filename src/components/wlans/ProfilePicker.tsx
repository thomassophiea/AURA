/**
 * Profile Picker Component
 *
 * Multi-select component for choosing which profiles to include or exclude.
 * Supports search/filter, select all/clear all, and visual selection indicators.
 */

import { useState } from 'react';
import { DetailSlideOut } from '../DetailSlideOut';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Search, Users, CheckCircle, XCircle } from 'lucide-react';
import type { Profile, DeploymentMode } from '../../types/network';

interface ProfilePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'INCLUDE_ONLY' | 'EXCLUDE_SOME';
  profiles: Profile[];
  siteName: string;
  selectedProfileIds: string[];
  onConfirm: (selectedIds: string[]) => void;
}

export function ProfilePicker({
  open,
  onOpenChange,
  mode,
  profiles,
  siteName,
  selectedProfileIds,
  onConfirm
}: ProfilePickerProps) {
  const [search, setSearch] = useState('');
  const [localSelection, setLocalSelection] = useState<Set<string>>(new Set(selectedProfileIds));

  const filteredProfiles = profiles.filter(profile => {
    const name = profile.name || profile.profileName || profile.id;
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const handleToggle = (profileId: string) => {
    const newSelection = new Set(localSelection);
    if (newSelection.has(profileId)) {
      newSelection.delete(profileId);
    } else {
      newSelection.add(profileId);
    }
    setLocalSelection(newSelection);
  };

  const handleSelectAll = () => {
    setLocalSelection(new Set(filteredProfiles.map(p => p.id)));
  };

  const handleClearAll = () => {
    setLocalSelection(new Set());
  };

  const handleConfirm = () => {
    onConfirm(Array.from(localSelection));
    onOpenChange(false);
  };

  const handleCancel = () => {
    setLocalSelection(new Set(selectedProfileIds)); // Reset to original
    onOpenChange(false);
  };

  const getTitle = () => {
    return mode === 'INCLUDE_ONLY'
      ? 'Select Profiles to Include'
      : 'Select Profiles to Exclude';
  };

  const getDescription = () => {
    return mode === 'INCLUDE_ONLY'
      ? 'WLAN will be assigned only to the selected profiles'
      : 'WLAN will be assigned to all profiles except the selected ones';
  };

  const getConfirmText = () => {
    const count = localSelection.size;
    if (mode === 'INCLUDE_ONLY') {
      return count === 0
        ? 'Select at least one profile'
        : `Include ${count} Profile${count !== 1 ? 's' : ''}`;
    } else {
      return count === 0
        ? 'Exclude None (Assign to All)'
        : `Exclude ${count} Profile${count !== 1 ? 's' : ''}`;
    }
  };

  const isValid = mode === 'INCLUDE_ONLY' ? localSelection.size > 0 : true;

  return (
    <DetailSlideOut
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title={getTitle()}
      description={`${getDescription()} at ${siteName}`}
      width="lg"
    >
      <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search profiles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                disabled={filteredProfiles.length === 0}
              >
                Select All ({filteredProfiles.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                disabled={localSelection.size === 0}
              >
                Clear All
              </Button>
            </div>

            {/* Selection Count */}
            <Badge variant={localSelection.size > 0 ? "default" : "secondary"} className="gap-1">
              {mode === 'INCLUDE_ONLY' ? (
                <CheckCircle className="h-3 w-3" />
              ) : (
                <XCircle className="h-3 w-3" />
              )}
              {localSelection.size} of {profiles.length}
            </Badge>
          </div>

          {/* Profile List */}
          <ScrollArea className="h-[300px] border rounded-md">
            {filteredProfiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {search ? 'No profiles match your search' : 'No profiles available'}
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {filteredProfiles.map((profile) => {
                  const isSelected = localSelection.has(profile.id);
                  const name = profile.name || profile.profileName || profile.id;

                  return (
                    <div
                      key={profile.id}
                      className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer hover:bg-accent ${
                        isSelected ? 'bg-accent border-primary' : 'border-border'
                      }`}
                      onClick={() => handleToggle(profile.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggle(profile.id)}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{name}</div>
                        {profile.deviceGroupId && (
                          <div className="text-xs text-muted-foreground">
                            Device Group: {profile.deviceGroupId}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <Badge variant={mode === 'INCLUDE_ONLY' ? "default" : "destructive"} className="text-xs">
                          {mode === 'INCLUDE_ONLY' ? 'Included' : 'Excluded'}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

        {/* Footer Actions */}
        <div className="flex gap-2 pt-6 border-t mt-6">
          <Button variant="outline" onClick={handleCancel} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid} className="flex-1">
            {getConfirmText()}
          </Button>
        </div>
      </div>
    </DetailSlideOut>
  );
}
