import { useState } from 'react';
import {
  MoreHorizontal,
  ExternalLink,
  Wifi,
  Shield,
  Users,
  Settings,
  BarChart3,
  Globe,
  Network,
  MapPin,
  Activity,
  Brain,
  Layers,
  Key
} from 'lucide-react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Badge } from './ui/badge';
import { useBranding } from '@/lib/branding';

interface App {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  isNew?: boolean;
  isBeta?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  url?: string;
}

const APPS: App[] = [
  {
    id: 'mobility-engine-mgmt',
    name: 'AURA Management',
    description: 'Full-featured management dashboard for AURA platform',
    isActive: true,
    icon: Activity,
    url: 'https://tsophiea.ddns.net:443/management'
  },
  {
    id: 'extremecloud-iq-legacy',
    name: 'ExtremeCloud IQ (Legacy)',
    description: 'Classic network management and monitoring',
    isActive: false,
    icon: Network,
    url: 'https://cal.extremecloudiq.com/login'
  },
  {
    id: 'extreme-cloud-health-status',
    name: 'Extreme Cloud Health Status',
    description: 'Real-time service status and health monitoring',
    isActive: false,
    isBeta: true,
    icon: Activity,
    url: 'https://cloud-status.extremecloudiq.com/'
  },
  {
    id: 'extreme-keyai',
    name: 'Extreme KeyAI',
    description: 'AI-powered Personal Pre-Shared Key management with advanced facial recognition and real-time connection monitoring',
    isActive: false,
    isBeta: true,
    icon: Key,
    url: 'https://keyai.extremecloudiq.com/'
  },
  {
    id: 'xiq-edge-migration',
    name: 'XIQ Edge Migration',
    description: 'Automated migration tool for transitioning Edge Services configurations from XIQ to Campus Controller',
    isActive: false,
    icon: Layers,
    url: 'https://xiq-edge-migration.up.railway.app/login'
  }
];

const handleAppClick = (app: App, setIsOpen: (open: boolean) => void) => {
  if (app.isActive) {
    // Already on this app, just close the menu
    setIsOpen(false);
    return;
  }

  if (app.url) {
    // Open external app in new tab
    window.open(app.url, '_blank', 'noopener,noreferrer');
  }
  
  setIsOpen(false);
};

export function AppsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const branding = useBranding();

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-9 p-0 flex items-center justify-center"
          title="Platform information"
        >
          <div className="grid grid-cols-3 gap-0.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="w-1 h-1 bg-current rounded-full opacity-60"
              />
            ))}
          </div>
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-72 p-0 surface-4dp border-border/50" 
        align="end" 
        sideOffset={8}
      >
        <div className="p-4">
          {/* Header */}
          <div className="mb-4">
            <h3 className="font-medium text-foreground">Apps</h3>
          </div>
          
          {/* Apps Grid */}
          <div className="space-y-2">
            {APPS.map((app) => (
              <div
                key={app.id}
                className={`
                  group p-3 rounded-lg cursor-pointer transition-all duration-200 relative overflow-hidden
                  ${app.isActive 
                    ? 'bg-primary/5 border-2 border-primary/30 shadow-sm' 
                    : 'hover:bg-accent/30 border border-transparent hover:shadow-sm'
                  }
                `}
                onClick={() => handleAppClick(app, setIsOpen)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`
                      p-1.5 rounded-md flex-shrink-0 transition-colors
                      ${app.isActive 
                        ? 'bg-primary/10 text-primary' 
                        : 'bg-muted/50 text-muted-foreground group-hover:text-foreground'
                      }
                    `}>
                      <app.icon className="h-4 w-4" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 mb-1.5">
                        <h4 className={`
                          font-medium transition-colors text-sm leading-tight flex-1
                          ${app.isActive ? 'text-primary' : 'text-foreground group-hover:text-foreground'}
                        `}>
                          {app.name}
                        </h4>
                        {app.isNew && (
                          <Badge
                            variant="outline"
                            className="text-xs px-1.5 py-0.5 bg-secondary/10 text-secondary border-secondary/20 font-medium flex-shrink-0 mt-0.5"
                          >
                            NEW
                          </Badge>
                        )}
                        {app.isBeta && (
                          <Badge
                            variant="outline"
                            className="text-xs px-1.5 py-0.5 bg-blue-500/10 text-blue-500 border-blue-500/20 font-medium flex-shrink-0 mt-0.5"
                          >
                            BETA
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-snug">
                        {app.description}
                      </p>
                    </div>
                  </div>
                  
                  {!app.isActive && (
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground ml-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
                
                {/* Active state indicator */}
                {app.isActive && (
                  <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-primary rounded-full" />
                )}
              </div>
            ))}
          </div>
          
          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50">
            <div className="text-xs text-muted-foreground text-center">
              {branding.name}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}