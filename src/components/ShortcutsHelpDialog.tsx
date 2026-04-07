import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Keyboard } from 'lucide-react';

interface ShortcutsHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const shortcuts = [
  { keys: ['⌘', 'D'], description: 'Go to Dashboard' },
  { keys: ['⌘', 'C'], description: 'Go to Clients' },
  { keys: ['⌘', 'A'], description: 'Go to Access Points' },
  { keys: ['⌘', 'N'], description: 'Go to Networks' },
  { keys: ['⌘', 'K'], description: 'Open Search / Command Palette' },
  { keys: ['⌘', 'R'], description: 'Refresh Current View' },
  { keys: ['?'], description: 'Show Keyboard Shortcuts' },
  { keys: ['Esc'], description: 'Close Dialog / Cancel' },
];

export function ShortcutsHelpDialog({ open, onOpenChange }: ShortcutsHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-4">
          {shortcuts.map((shortcut, index) => (
            <div key={index} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <span className="text-sm">{shortcut.description}</span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, i) => (
                  <kbd 
                    key={i}
                    className="px-2 py-1 text-xs font-mono bg-muted rounded border border-border"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          On Windows/Linux, use Ctrl instead of ⌘
        </p>
      </DialogContent>
    </Dialog>
  );
}
