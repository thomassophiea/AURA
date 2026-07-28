/**
 * Utilities and AP Service tabs — represent the structure of the controller's
 * diagnostic action tools. Live execution (ping, traceroute, reboot, capture,
 * LED locate, etc.) is a runtime operation, not config data, so these tabs
 * enumerate the available tools and label execution as runtime rather than
 * wiring fake actions.
 */
import React from 'react';
import {
  Activity,
  Camera,
  Download,
  Lightbulb,
  Network,
  Radio,
  RefreshCw,
  Route,
  Terminal,
  Wrench,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Card, CardContent } from '../ui/card';

interface ToolItem {
  icon: typeof Activity;
  name: string;
  description: string;
}

function ToolGrid({ tools, note }: { tools: ToolItem[]; note: string }) {
  return (
    <div className="space-y-4">
      <Alert>
        <Wrench className="h-4 w-4" />
        <AlertTitle>Live execution is a runtime operation</AlertTitle>
        <AlertDescription>{note}</AlertDescription>
      </Alert>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((t) => (
          <Card key={t.name}>
            <CardContent className="flex items-start gap-3 p-4">
              <t.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

const UTILITIES: ToolItem[] = [
  { icon: Activity, name: 'Ping', description: 'Reachability test to a host from the controller.' },
  { icon: Route, name: 'Traceroute', description: 'Hop-by-hop path trace to a destination.' },
  { icon: Network, name: 'DNS Lookup', description: 'Resolve a hostname against configured DNS.' },
  { icon: Terminal, name: 'CLI Console', description: 'Interactive controller shell session.' },
  { icon: Download, name: 'Tech Support Bundle', description: 'Collect diagnostic logs for support.' },
];

const AP_SERVICE: ToolItem[] = [
  { icon: RefreshCw, name: 'Reboot AP', description: 'Restart a selected access point.' },
  { icon: Camera, name: 'Packet Capture', description: 'Capture wireless/wired traffic on an AP.' },
  { icon: Lightbulb, name: 'Locate (LED Flash)', description: 'Flash the AP LED to find it physically.' },
  { icon: Radio, name: 'Radio Reset', description: 'Bounce an AP radio interface.' },
  { icon: Download, name: 'AP Logs', description: 'Pull logs from a selected access point.' },
];

export function UtilitiesTab() {
  return (
    <ToolGrid
      tools={UTILITIES}
      note="These controller utilities run against live devices. AURA surfaces the tool set here; execution is performed through the controller's runtime action API, not the config API."
    />
  );
}

export function ApServiceTab() {
  return (
    <ToolGrid
      tools={AP_SERVICE}
      note="Per-AP service actions operate on live hardware. The available actions are listed here; running them is a runtime operation performed against the device."
    />
  );
}
