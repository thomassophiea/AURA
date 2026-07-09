/**
 * WLAN editor - Associated Profiles tab: profiles x radios checkbox matrix
 * writing radioIfList. Gates: 6 GHz radios accept only WPA3 / OWE networks;
 * WPA3-Enterprise (192 Bits) locks rows whose platform lacks the WPA3-192
 * feature; create mode asks the user to save first.
 */
import React from 'react';
import { Checkbox } from '../../ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import type { ApProfile, ProfileRadio } from '../../../types/configure';
import { allows6GHz, type WlanAuthType } from './wlanModel';
import type { AssignmentMatrix } from './useProfileAssignments';

export interface WlanProfilesTabProps {
  wlanId: string | null;
  authType: WlanAuthType;
  profiles: ApProfile[];
  matrix: AssignmentMatrix;
  onToggle: (profileId: string, radioIndex: number) => void;
}

const RADIO_COLUMNS = [1, 2, 3];

const is6GHz = (radio: ProfileRadio): boolean =>
  /^ax6/.test(radio.mode ?? '') || /6\s*GHz/i.test(radio.radioName ?? '');

export function WlanProfilesTab({
  wlanId,
  authType,
  profiles,
  matrix,
  onToggle,
}: WlanProfilesTabProps) {
  if (!wlanId) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        Save the network first, then assign it to profile radios here.
      </p>
    );
  }

  const requires192 = authType === 'WPA3-Enterprise (192 Bits)';
  const sixGhzAllowed = allows6GHz(authType);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        6 GHz radios accept only WPA3 / OWE networks. WPA3-Enterprise (192 Bits) requires the
        WPA3-192 platform feature.
      </p>
      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Profile</TableHead>
              {RADIO_COLUMNS.map((index) => (
                <TableHead key={index} className="w-24 text-center">
                  Radio {index}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No AP profiles found on this controller.
                </TableCell>
              </TableRow>
            )}
            {profiles.map((profile) => {
              const rowLocked = requires192 && !(profile.features ?? []).includes('WPA3-192');
              return (
                <TableRow key={profile.id} className={rowLocked ? 'opacity-50' : undefined}>
                  <TableCell>
                    {profile.name}
                    {rowLocked && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        WPA3-192 not supported
                      </span>
                    )}
                  </TableCell>
                  {RADIO_COLUMNS.map((radioIndex) => {
                    const radio = (profile.radios ?? []).find(
                      (r) => r.radioIndex === radioIndex
                    );
                    if (!radio) {
                      return (
                        <TableCell key={radioIndex} className="text-center text-muted-foreground">
                          -
                        </TableCell>
                      );
                    }
                    const sixGhzBlocked = is6GHz(radio) && !sixGhzAllowed;
                    const disabled = rowLocked || sixGhzBlocked;
                    return (
                      <TableCell key={radioIndex} className="text-center">
                        <Checkbox
                          checked={!!matrix[profile.id]?.[radioIndex]}
                          disabled={disabled}
                          aria-label={`Assign to ${profile.name} radio ${radioIndex}`}
                          title={sixGhzBlocked ? '6 GHz requires WPA3 or OWE' : undefined}
                          onCheckedChange={() => onToggle(profile.id, radioIndex)}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
