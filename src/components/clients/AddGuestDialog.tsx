import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, Loader2 } from 'lucide-react';
import { guestService, GuestRequestError } from '@/services/guestService';
import { describeActivation } from './guestPresentation';

interface AddGuestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful create, with the message describing what happened. */
  onCreated: (message: string) => void;
}

/** Access windows an operator picks from. `0` means no expiry. */
const DURATIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '0', label: 'No expiry' },
  { value: '60', label: '1 hour' },
  { value: '240', label: '4 hours' },
  { value: '1440', label: '1 day' },
  { value: '10080', label: '7 days' },
  { value: '43200', label: '30 days' },
];

/**
 * Client-side MAC check.
 *
 * Deliberately permissive about separators and deliberately *not* the
 * authority: the portal normalises and validates again before storing. This
 * exists only so an operator gets the message before a round-trip.
 */
function macLooksValid(value: string): boolean {
  return /^[0-9a-f]{12}$/i.test(value.replace(/[\s:.-]/g, ''));
}

export function AddGuestDialog({ open, onOpenChange, onCreated }: AddGuestDialogProps) {
  const [macAddress, setMacAddress] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [notes, setNotes] = useState('');
  const [duration, setDuration] = useState('1440');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const macTouched = macAddress.trim().length > 0;
  const macInvalid = macTouched && !macLooksValid(macAddress);

  function reset() {
    setMacAddress('');
    setDisplayName('');
    setNotes('');
    setDuration('1440');
    setError(null);
    setIsSaving(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!macLooksValid(macAddress)) {
      setError('Enter a MAC address as AA:BB:CC:DD:EE:FF, aa-bb-cc-dd-ee-ff, or aabb.ccdd.eeff.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const minutes = Number(duration);
      const result = await guestService.create({
        macAddress: macAddress.trim(),
        displayName: displayName.trim() || undefined,
        notes: notes.trim() || undefined,
        durationMinutes: minutes > 0 ? minutes : undefined,
      });
      onCreated(describeActivation(result.activation));
      handleOpenChange(false);
    } catch (err) {
      if (err instanceof GuestRequestError) {
        setError(
          err.code === 'DUPLICATE_ACTIVE'
            ? 'That MAC address is already authorized. Revoke the existing entry first if you want to change its access window.'
            : err.message
        );
      } else {
        setError('The guest could not be added. Please try again.');
      }
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add guest</DialogTitle>
            <DialogDescription>
              Authorize a device by MAC address. If it is already connected it is authorized
              immediately; otherwise it is authorized the moment it joins the guest network.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="guest-mac">MAC address</Label>
              <Input
                id="guest-mac"
                value={macAddress}
                onChange={(e) => setMacAddress(e.target.value)}
                placeholder="AA:BB:CC:DD:EE:FF"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                aria-invalid={macInvalid}
                aria-describedby="guest-mac-hint"
              />
              <p id="guest-mac-hint" className="text-xs text-muted-foreground">
                Colons, hyphens, dots or no separator — all accepted.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="guest-name">Display name (optional)</Label>
              <Input
                id="guest-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Conference room tablet"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="guest-duration">Access duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger id="guest-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="guest-notes">Notes (optional)</Label>
              <Input
                id="guest-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why this device was authorized"
                autoComplete="off"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !macTouched || macInvalid}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add guest
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
