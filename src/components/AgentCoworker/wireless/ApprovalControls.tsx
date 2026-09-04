import { Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ApprovalControlsProps {
  wlanName?: string;
  siteName?: string;
  canApprove: boolean;
  disabled?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onTalkToConfirm: () => void;
  onEdit: () => void;
  onCancel: () => void;
}

/**
 * The only path into provisioning. Disabled whenever required fields are
 * missing, validation hasn't completed, blockers exist, the token expired,
 * or the plan changed since validation — `canApprove` already encodes all of
 * that (see wirelessAssistantHelpers.canApprove).
 */
export function ApprovalControls({
  wlanName,
  siteName,
  canApprove,
  disabled,
  error,
  onConfirm,
  onTalkToConfirm,
  onEdit,
  onCancel,
}: ApprovalControlsProps) {
  const label = wlanName && siteName ? `Confirm and Configure ${wlanName} at ${siteName}` : 'Confirm and Configure';

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={!canApprove || disabled} onClick={onConfirm}>
          {label}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!canApprove || disabled} onClick={onTalkToConfirm}>
          <Mic className="h-3.5 w-3.5" />
          Talk to Confirm
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={onEdit}>
          Edit
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Voice confirmation requires a clear phrase such as "Confirm and configure." Ambiguous replies like "yes" or
        "go ahead" require the button.
      </p>
    </div>
  );
}
