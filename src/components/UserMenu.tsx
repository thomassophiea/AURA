import { useState } from 'react';
import {
  User,
  Settings,
  Shield,
  HelpCircle,
  BookOpen,
  ExternalLink,
  ChevronRight,
  LogOut,
  Building2
} from 'lucide-react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';

interface UserMenuProps {
  onLogout: () => void;
  theme: 'light' | 'dark' | 'synthwave' | 'system';
  onThemeToggle: () => void;
  userEmail?: string;
  onNavigateTo?: (page: string) => void;
}

export function UserMenu({ onLogout, theme, onThemeToggle, userEmail, onNavigateTo }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Extract name from email if available
  const getNameFromEmail = (email: string) => {
    const username = email.split('@')[0];
    // Remove +ep1 or similar suffixes and convert to title case
    const cleanName = username.split('+')[0].replace(/[._-]/g, ' ');
    return cleanName.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Get initials from email
  const getInitialsFromEmail = (email: string) => {
    const name = getNameFromEmail(email);
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return parts[0][0] + parts[1][0];
    }
    return parts[0][0] + parts[0][1];
  };

  // Get organization from email domain
  const getOrganizationFromEmail = (email: string) => {
    const domain = email.split('@')[1] || '';
    const orgName = domain.split('.')[0];
    return orgName.charAt(0).toUpperCase() + orgName.slice(1);
  };

  // Only show user info if we have real data
  if (!userEmail) {
    return null; // Don't render if no real user data available
  }

  const userInfo = {
    name: getNameFromEmail(userEmail),
    email: userEmail,
    organization: getOrganizationFromEmail(userEmail),
    initials: getInitialsFromEmail(userEmail)
  };

  const menuItems = [
    {
      type: 'item',
      label: 'About API Platform',
      icon: null,
      beta: true,
      action: () => {
        console.log('About API Platform');
      }
    },
    {
      type: 'item',
      label: 'Cloud Status',
      icon: Shield,
      externalLink: 'https://cloud-status.extremecloudiq.com/',
      action: () => {
        window.open('https://cloud-status.extremecloudiq.com/', '_blank', 'noopener,noreferrer');
      }
    },
    {
      type: 'item',
      label: 'Help & Support',
      icon: HelpCircle,
      beta: true,
      action: () => {
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
      beta: true,
      action: () => {
        console.log('Account Settings');
      }
    },
    {
      type: 'item',
      label: 'API Documentation',
      icon: BookOpen,
      action: () => {
        if (onNavigateTo) {
          onNavigateTo('api-documentation');
        }
      }
    },
    {
      type: 'item',
      label: 'External Integrations',
      icon: ExternalLink,
      beta: true,
      action: () => {
        console.log('External Integrations');
      }
    },
    {
      type: 'item',
      label: 'Preferences',
      icon: Settings,
      beta: true,
      action: () => {
        console.log('Preferences');
      }
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
                  ${item.beta ? 'opacity-70' : ''}
                `}
              >
                <div className="flex items-center gap-3">
                  {IconComponent && (
                    <IconComponent className="h-4 w-4 flex-shrink-0" />
                  )}
                  <span className="text-left">{item.label}</span>
                  {item.beta && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal text-muted-foreground border-muted-foreground/30">
                      Beta
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {item.externalLink && (
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  )}
                  {item.hasSubmenu && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}