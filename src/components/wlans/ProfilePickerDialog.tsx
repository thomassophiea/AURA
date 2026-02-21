/**
 * Profile Picker Dialog Component
 *
 * Modal dialog for choosing which profiles to include or exclude.
 * Uses a modal that overlays without hiding the underlying page content.
 */

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Search, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { Profile } from '../../types/network';

interface ProfilePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'INCLUDE_ONLY' | 'EXCLUDE_SOME';
  profiles: Profile[];
  siteName: string;
  selectedProfileIds: string[];
  onConfirm: (selectedIds: string[]) => void;
  loading?: boolean;
}

export function ProfilePickerDialog({
  open,
  onOpenChange,
  mode,
  profiles,
  siteName,
  selectedProfileIds,
  onConfirm,
  loading = false
}: ProfilePickerDialogProps) {
  const [search, setSearch] = useState('');
  const [localSelection, setLocalSelection] = useState<Set<string>>(new Set(selectedProfileIds));

  // Reset local selection when dialog opens or selectedProfileIds changes
  useEffect(() => {
    if (open) {
      setLocalSelection(new Set(selectedProfileIds));
      setSearch('');
    }
  }, [open, selectedProfileIds]);

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

  const getTitle = () => {
    return mode === 'INCLUDE_ONLY'
      ? 'Select Profiles to Include'
      : 'Select Profiles to Exclude';
  };

  const getDescription = () => {
    return mode === 'INCLUDE_ONLY'
      ? `Select profiles at ${siteName} to deploy this WLAN to`
      : `Select profiles at ${siteName} to exclude from deployment`;
  };

  const getConfirmText = () => {
    const count = localSelection.size;
    if (mode === 'INCLUDE_ONLY') {
      return count === 0
        ? 'Select at least one profile'
        : `Include ${count} Profile${count !== 1 ? 's' : ''}`;
    } else {
      return count === 0
        ? 'Exclude None'
        : `Exclude ${count} Profile${count !== 1 ? 's' : ''}`;
    }
  };

  const isValid = mode === 'INCLUDE_ONLY' ? localSelection.size > 0 : true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'INCLUDE_ONLY' ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-amber-500" />
            )}
            {getTitle()}
          </DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-3 min-h-0">
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
                disabled={filteredProfiles.length === 0 || loading}
              >
                Select All ({filteredProfiles.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                disabled={localSelection.size === 0 || loading}
              >
                Clear
              </Button>
            </div>

            {/* Selection Count */}
            <Badge 
              variant={localSelection.size > 0 ? "default" : "secondary"} 
              className="gap-1"
            >
              {mode === 'INCLUDE_ONLY' ? (
                <CheckCircle className="h-3 w-3" />
              ) : (
                <XCircle className="h-3 w-3" />
              )}
              {localSelection.size} of {profiles.length}
            </Badge>
          </div>

          {/* Profile List */}
          <ScrollArea className="flex-1 min-h-[200px] max-h-[300px] border rounded-md">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredProfiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {search ? 'No profiles match your search' : 'No profiles available'}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredProfiles.map((profile) => {
                  const isSelected = localSelection.has(profile.id);
                  const name = profile.name || profile.profileName || profile.id;

                  return (
                    <div
                      key={profile.id}
                      className={`flex items-center gap-3 p-2.5 rounded-md border transition-colors cursor-pointer hover:bg-accent ${
                        isSelected 
                          ? mode === 'INCLUDE_ONLY'
                            ? 'bg-green-500/10 border-green-500/50'
                            : 'bg-amber-500/10 border-amber-500/50'
                          : 'border-transparent'
                      }`}
                      onClick={() => handleToggle(profile.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggle(profile.id)}
                        className={isSelected 
                          ? mode === 'INCLUDE_ONLY' 
                            ? 'border-green-500 data-[state=checked]:bg-green-500' 
                            : 'border-amber-500 data-[state=checked]:bg-amber-500'
                          : ''
                        }
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{name}</div>
                        {profile.deviceGroupId && (
                          <div className="text-xs text-muted-foreground truncate">
                            Group: {profile.deviceGroupId}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!isValid || loading}
            variant={mode === 'INCLUDE_ONLY' ? 'default' : 'secondary'}
          >
            {getConfirmText()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
