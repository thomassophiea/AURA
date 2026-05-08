import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from './ui/command';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import {
  BarChart3,
  Bell,
  LayoutDashboard,
  Map,
  Moon,
  RefreshCw,
  Server,
  Settings,
  Shield,
  Sun,
  Users,
  Wifi,
} from 'lucide-react';

interface CommandPaletteProps {
  /** Triggered when the user picks a route action; the host wires up navigation. */
  onNavigate?: (page: string) => void;
  /** Triggered for the Refresh action (dispatches anywhere it's wired). */
  onRefresh?: () => void;
}

interface RouteItem {
  page: string;
  label: string;
  group: string;
  // Lucide icon component
  Icon: React.ComponentType<{ className?: string }>;
  keywords?: string[];
}

const ROUTES: RouteItem[] = [
  {
    page: 'dashboard',
    label: 'Dashboard',
    group: 'Navigate',
    Icon: LayoutDashboard,
    keywords: ['home'],
  },
  {
    page: 'access-points',
    label: 'Access Points',
    group: 'Navigate',
    Icon: Wifi,
    keywords: ['ap', 'aps'],
  },
  {
    page: 'clients',
    label: 'Connected Clients',
    group: 'Navigate',
    Icon: Users,
    keywords: ['stations'],
  },
  {
    page: 'configure-networks',
    label: 'Networks',
    group: 'Configure',
    Icon: Wifi,
    keywords: ['ssid', 'wlan'],
  },
  { page: 'configure-policy', label: 'Policy', group: 'Configure', Icon: Shield },
  {
    page: 'configure-rrm',
    label: 'RRM',
    group: 'Configure',
    Icon: Settings,
    keywords: ['radio resource'],
  },
  { page: 'topology', label: 'Topology', group: 'Visualize', Icon: Map },
  { page: 'reports', label: 'Reports', group: 'Visualize', Icon: BarChart3 },
  {
    page: 'event-alarms',
    label: 'Events & Alarms',
    group: 'Operate',
    Icon: Bell,
    keywords: ['alerts'],
  },
  { page: 'os-one', label: 'OS ONE', group: 'Operate', Icon: Server },
  { page: 'security', label: 'Security', group: 'Operate', Icon: Shield },
];

/**
 * CommandPalette — Wave 4B starter. Bound to ⌘⇧P / ctrl+shift+P (cmd+K
 * is taken by the chatbot). Provides keyboard-first nav across known
 * routes, theme toggle, and a "Refresh dashboard" action.
 *
 * Future-extension points for follow-up sessions:
 *  - AP search by name/MAC/serial via apiService
 *  - Client search by username/MAC/IP
 *  - Persona switching
 *  - Saved filter shortcuts
 */
export function CommandPalette({ onNavigate, onRefresh }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const close = () => setOpen(false);

  const groupedRoutes = ROUTES.reduce<Record<string, RouteItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command label="Command palette" loop>
          <CommandInput placeholder="Type a command or search…" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>

            {Object.entries(groupedRoutes).map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map(({ page, label, Icon, keywords }) => (
                  <CommandItem
                    key={page}
                    value={`${label} ${keywords?.join(' ') ?? ''}`}
                    onSelect={() => {
                      onNavigate?.(page);
                      close();
                    }}
                  >
                    <Icon />
                    <span>{label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            <CommandSeparator />
            <CommandGroup heading="Actions">
              <CommandItem
                value="refresh dashboard reload data"
                onSelect={() => {
                  onRefresh?.();
                  close();
                }}
              >
                <RefreshCw />
                <span>Refresh dashboard</span>
              </CommandItem>
              <CommandItem
                value="toggle theme dark light mode"
                onSelect={() => {
                  setTheme(theme === 'dark' ? 'light' : 'dark');
                  close();
                }}
              >
                {theme === 'dark' ? <Sun /> : <Moon />}
                <span>Switch to {theme === 'dark' ? 'light' : 'dark'} theme</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
          <div className="border-t px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-mono flex items-center gap-3">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>esc close</span>
            <CommandShortcut className="ml-auto">⌘⇧P</CommandShortcut>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
