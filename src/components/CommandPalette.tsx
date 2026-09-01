import { useEffect, useState } from 'react';
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
  Bell,
  Gauge,
  LayoutDashboard,
  RefreshCw,
  Shield,
  ShieldCheck,
  SunMoon,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';
import {
  ALL_CONFIGURE_FEATURES,
  type ConfigureFeature,
} from '@/config/featureRegistry';

interface CommandPaletteProps {
  /** Triggered when the user picks a route action; the host wires up navigation. */
  onNavigate?: (page: string) => void;
  /** Triggered for the Refresh action (dispatches anywhere it's wired). */
  onRefresh?: () => void;
  /** Cycles the app theme (App.tsx owns the 'light' | 'ep1' | 'dev' state). */
  onToggleTheme?: () => void;
}

interface RouteItem {
  page: string;
  label: string;
  group: string;
  // Lucide icon component
  Icon: React.ComponentType<{ className?: string }>;
  keywords?: string[];
}

// Non-Configure destinations, ids matching App.tsx renderPage() cases exactly.
const BASE_ROUTES: RouteItem[] = [
  {
    page: 'service-levels',
    label: 'Operational Insights',
    group: 'Navigate',
    Icon: ShieldCheck,
    keywords: ['sle', 'service levels', 'sentinel', 'home'],
  },
  {
    page: 'insights',
    label: 'Network Overview',
    group: 'Navigate',
    Icon: Gauge,
    keywords: ['dashboard', 'monitoring'],
  },
  {
    page: 'access-points',
    label: 'Access Points',
    group: 'Navigate',
    Icon: Wifi,
    keywords: ['ap', 'aps'],
  },
  {
    page: 'connected-clients',
    label: 'Clients',
    group: 'Navigate',
    Icon: Users,
    keywords: ['stations', 'devices', 'users'],
  },
  {
    page: 'energy-optimization',
    label: 'Energy',
    group: 'Navigate',
    Icon: Zap,
    keywords: ['power', 'kwh', 'sustainability'],
  },
  {
    page: 'workspace',
    label: 'Report Studio',
    group: 'Navigate',
    Icon: LayoutDashboard,
    keywords: ['reports', 'widgets', 'workspace'],
  },
  {
    page: 'event-alarm-dashboard',
    label: 'Events & Alarms',
    group: 'Operate',
    Icon: Bell,
    keywords: ['alerts', 'alarms', 'events'],
  },
  {
    page: 'security-dashboard',
    label: 'Security',
    group: 'Operate',
    Icon: Shield,
    keywords: ['rogue', 'threats', 'wips'],
  },
];

// Every Configure feature comes from the registry — one taxonomy everywhere.
const CONFIGURE_ROUTES: RouteItem[] = ALL_CONFIGURE_FEATURES.map((f: ConfigureFeature) => ({
  page: f.id,
  label: f.label,
  group: 'Configure',
  Icon: f.icon,
  keywords: f.aliases,
}));

const ROUTES: RouteItem[] = [...BASE_ROUTES, ...CONFIGURE_ROUTES];

/**
 * CommandPalette — bound to ⌘⇧P / ctrl+shift+P (cmd+K is taken by the
 * chatbot). Keyboard-first navigation across every registered route, with
 * legacy/protocol aliases (WLAN → Networks, RADIUS → AAA, PPSK/SAE → Private
 * Credentials, controller → Gateway pages), plus theme toggle and refresh.
 */
export function CommandPalette({ onNavigate, onRefresh, onToggleTheme }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);

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
              {onToggleTheme && (
                <CommandItem
                  value="toggle theme dark light mode"
                  onSelect={() => {
                    onToggleTheme();
                    close();
                  }}
                >
                  <SunMoon />
                  <span>Toggle theme</span>
                </CommandItem>
              )}
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
