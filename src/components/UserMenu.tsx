import { useState } from 'react';
import {
  User,
  Settings,
  Shield,
  HelpCircle,
  Key,
  ExternalLink,
  Sun,
  Moon,
  Monitor,
  ChevronRight,
  LogOut,
  Building2,
  Sunset
} from 'lucide-react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Separator } from './ui/separator';

interface UserMenuProps {
  onLogout: () => void;
  theme: 'light' | 'dark' | 'synthwave' | 'system';
  onThemeToggle: () => void;
}

export function UserMenu({ onLogout, theme, onThemeToggle }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const userInfo = {
    name: 'Thomas Sophiea',
    email: 'tsophiea+ep1@extremenet',
    organization: 'Extreme Networks',
    initials: 'TS'
  };

  const menuItems = [
    {
      type: 'item',
      label: 'About AURA Platform',
      icon: null,
      action: () => {
        // Handle about action
        console.log('About AURA Platform');
      }
    },
    {
      type: 'item',
      label: 'Cloud Status',
      icon: Shield,
      action: () => {
        // Handle cloud status action
        console.log('Cloud Status');
      }
    },
    {
      type: 'item',
      label: 'Help & Support',
      icon: HelpCircle,
      action: () => {
        // Handle help action
        console.log('Help & Support');
      }
    },
    {
      type: 'separator'
    },
    {
      type: 'section',
      label: 'Profile'
    },
    {
      type: 'item',
      label: 'Account Settings',
      icon: User,
      action: () => {
        // Handle account settings action
        console.log('Account Settings');
      }
    },
    {
      type: 'item',
      label: 'API Keys',
      icon: Key,
      action: () => {
        // Handle API keys action
        console.log('API Keys');
      }
    },
    {
      type: 'item',
      label: 'External Integrations',
      icon: ExternalLink,
      action: () => {
        // Handle external integrations action
        console.log('External Integrations');
      }
    },
    {
      type: 'item',
      label: 'Preferences',
      icon: Settings,
      action: () => {
        // Handle preferences action
        console.log('Preferences');
      }
    },
    {
      type: 'item',
      label: `Theme (${
        theme === 'system' ? 'Auto' :
        theme === 'dark' ? 'Dark' :
        theme === 'synthwave' ? 'Synthwave' :
        'Light'
      })`,
      icon:
        theme === 'system' ? Monitor :
        theme === 'dark' ? Sun :
        theme === 'synthwave' ? Sunset :
        Moon,
      action: onThemeToggle,
      hasSubmenu: false
    },
    {
      type: 'separator'
    },
    {
      type: 'item',
      label: 'Sign Out',
      icon: LogOut,
      action: onLogout,
      destructive: true
    }
  ];

  const handleItemClick = (item: any) => {
    if (item.action) {
      item.action();
    }
    if (!item.hasSubmenu) {
      setIsOpen(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-10 w-10 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground font-medium">
              {userInfo.initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-80 p-0 surface-4dp border-border/50" 
        align="end"
        sideOffset={8}
      >
        <div className="p-4">
          {/* User Info Header */}
          <div className="flex items-center gap-3 mb-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary text-primary-foreground font-medium text-lg">
                {userInfo.initials}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-foreground truncate">
                {userInfo.name}
              </h4>
              <p className="text-sm text-muted-foreground truncate">
                {userInfo.email}
              </p>
              <div className="flex items-center gap-1 mt-1">
                <Building2 className="h-3 w-3 text-muted-foreground" />
                <p className="text-xs text-muted-foreground truncate">
                  {userInfo.organization}
                </p>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Menu Items */}
        <div className="py-2">
          {menuItems.map((item, index) => {
            if (item.type === 'separator') {
              return <Separator key={index} className="my-2" />;
            }
            
            if (item.type === 'section') {
              return (
                <div key={index} className="px-3 py-2">
                  <h5 className="font-medium text-foreground text-sm">
                    {item.label}
                  </h5>
                </div>
              );
            }

            const IconComponent = item.icon;
            
            return (
              <button
                key={index}
                onClick={() => handleItemClick(item)}
                className={`
                  w-full flex items-center justify-between px-3 py-2 text-sm
                  transition-colors hover:bg-accent hover:text-accent-foreground
                  focus:bg-accent focus:text-accent-foreground focus:outline-none
                  ${item.destructive ? 'text-destructive hover:bg-destructive/10' : 'text-foreground'}
                `}
              >
                <div className="flex items-center gap-3">
                  {IconComponent && (
                    <IconComponent className="h-4 w-4 flex-shrink-0" />
                  )}
                  <span className="text-left">{item.label}</span>
                </div>
                
                {item.hasSubmenu && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}