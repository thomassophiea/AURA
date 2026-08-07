import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';
import { guestService, GuestRequestError, type Guest } from '@/services/guestService';
import { describeEnforcement, guestLabel, isDestructiveRemoval } from './guestPresentation';

interface RevokeGuestDialogProps {
  guest: Guest | null;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => void;
}

/**
 * Confirmation for withdrawing access.
 *
 * The wording changes with what will actually happen, because "delete" and
 * "revoke" have different consequences and an operator should not have to guess
 * which one they are about to get:
 *
 *   - a device that has been on the network is revoked and kept for audit;
 *   - an entry that has never connected is deleted outright.
 */
export function RevokeGuestDialog({ guest, onOpenChange, onDone }: RevokeGuestDialogProps) {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preservesHistory = guest ? isDestructiveRemoval(guest) : true;
  const isConnected = guest?.connectionStatus === 'connected';

  async function handleConfirm() {
    if (!guest) return;
    setIsWorking(true);
    setError(null);
    try {
      if (preservesHistory) {
        const result = await guestService.revoke(guest.id);
        onDone(describeEnforcement(result.enforcement));
      } else {
        const result = await guestService.remove(guest.id);
        onDone(
          result.outcome === 'DELETED'
            ? 'The entry was removed.'
            : describeEnforcement(result.enforcement)
        );
      }
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof GuestRequestError
          ? err.message
          : 'The request could not be completed. Please try again.'
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <AlertDialog open={guest !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {preservesHistory ? 'Revoke guest access?' : 'Remove this entry?'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                <span className="font-mono text-foreground">
                  {guest ? guestLabel(guest) : ''}
                </span>{' '}
                {preservesHistory
                  ? 'will no longer be allowed on the guest network.'
                  : 'has never connected, so the entry will be deleted.'}
              </p>
              {preservesHistory && (
                <p>
                  The record is kept for audit — it moves to <strong>Revoked</strong> rather
                  than disappearing.
                </p>
              )}
              {isConnected && (
                <p>
                  This device is connected right now. It will be moved out of the authorized
                  role and disconnected, so it loses access immediately.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isWorking}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Keep the dialog open until the request settles, so a failure is
              // visible rather than closing over a silent error.
              event.preventDefault();
              void handleConfirm();
            }}
            disabled={isWorking}
          >
            {isWorking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {preservesHistory ? 'Revoke access' : 'Delete entry'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
