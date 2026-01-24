import {
  Users,
  Wifi,
  MapPin,
  Settings,
  TrendingUp,
  LogOut,
  Menu,
  ChevronDown,
  ChevronRight,
  Cog,
  Network,
  Shield,
  UserCheck,
  UserPlus,
  Sun,
  Moon,
  Monitor,
  BarChart3,
  Wrench,
  AppWindow,
  FileCheck
} from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import extremeNetworksLogo from 'figma:asset/cc372b1d703a0b056a9f8c590da6c8e1cb4947fd.png';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { useState } from 'react';
import { cn } from './ui/utils';
import { useBranding } from '@/lib/branding';
import { VersionBadge } from './VersionBadge';

interface SidebarProps {
  onLogout: () => void;
  adminRole: string | null;
  currentPage: string;
  onPageChange: (page: string) => void;
  theme?: 'light' | 'dark' | 'system';
  onThemeToggle?: () => void;
}

// Navigation items
const navigationItems = [
  { id: 'service-levels', label: 'Contextual Insights', icon: TrendingUp },
  { id: 'app-insights', label: 'App Insights', icon: AppWindow },
  { id: 'connected-clients', label: 'Connected Clients', icon: Users },
  { id: 'access-points', label: 'Access Points', icon: Wifi },
  { id: 'report-widgets', label: 'Report Widgets', icon: BarChart3 },
  { id: 'pci-report', label: 'PCI DSS Report', icon: FileCheck },
];

// Configure items
const configureItems = [
  { id: 'configure-sites', label: 'Sites', icon: MapPin },
  { id: 'configure-networks', label: 'Networks', icon: Network },
  { id: 'configure-policy', label: 'Policy', icon: Shield },
  { id: 'configure-aaa-policies', label: 'AAA Policies', icon: UserCheck },
  { id: 'configure-guest', label: 'Guest', icon: UserPlus },
];

export function Sidebar({ onLogout, adminRole, currentPage, onPageChange, theme = 'system', onThemeToggle }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const branding = useBranding();

  // Check if any configure sub-item is currently active
  const isConfigureActive = configureItems.some(item => currentPage === item.id);

  // Auto-expand Configure section if a configure item is active
  const [isConfigureExpanded, setIsConfigureExpanded] = useState(isConfigureActive);

  return (
    <div className={cn(
      "bg-sidebar border-r border-sidebar-border h-full flex flex-col transition-all duration-300",
      isCollapsed ? "w-16" : "w-64"
    )}>
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center space-x-2">
              <div className="text-foreground">
                <span className="text-muted-foreground text-xs">{branding.fullName}</span>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.id}
              variant={currentPage === item.id ? "default" : "ghost"}
              className={cn(
                "w-full justify-start h-10",
                isCollapsed ? "px-2" : "px-3",
                currentPage === item.id
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              onClick={() => onPageChange(item.id)}
            >
              <Icon className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
              {!isCollapsed && <span>{item.label}</span>}
            </Button>
          );
        })}
        
        {/* Configure Section */}
        <div className="space-y-1">
          <Button
            variant={isConfigureActive ? "default" : "ghost"}
            className={cn(
              "w-full justify-start h-10",
              isCollapsed ? "px-2" : "px-3",
              isConfigureActive 
                ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
            onClick={() => {
              if (!isCollapsed) {
                setIsConfigureExpanded(!isConfigureExpanded);
              }
            }}
          >
            <Cog className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
            {!isCollapsed && (
              <>
                <span className="flex-1 text-left">Configure</span>
                {isConfigureExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </>
            )}
          </Button>
          
          {/* Configure Sub-items */}
          {!isCollapsed && isConfigureExpanded && (
            <div className="ml-6 space-y-1">
              {configureItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.id}
                    variant={currentPage === item.id ? "default" : "ghost"}
                    className={cn(
                      "w-full justify-start h-9 text-sm",
                      "px-3",
                      currentPage === item.id
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                    onClick={() => onPageChange(item.id)}
                  >
                    <Icon className="h-3 w-3 mr-2" />
                    <span>{item.label}</span>
                  </Button>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Administration - Bottom Navigation Item */}
        
        {/* Tools - Navigation Item */}
        <Button
          variant={currentPage === 'tools' ? "default" : "ghost"}
          className={cn(
            "w-full justify-start h-10",
            isCollapsed ? "px-2" : "px-3",
            currentPage === 'tools'
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
          onClick={() => onPageChange('tools')}
        >
          <Wrench className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
          {!isCollapsed && <span>Tools</span>}
        </Button>
        <Button
          variant={currentPage === 'administration' ? "default" : "ghost"}
          className={cn(
            "w-full justify-start h-10",
            isCollapsed ? "px-2" : "px-3",
            currentPage === 'administration'
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
          onClick={() => onPageChange('administration')}
        >
          <Settings className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
          {!isCollapsed && <span>Administration</span>}
        </Button>
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* User Info & Theme Toggle & Logout */}
      <div className="p-4 space-y-2">
        {!isCollapsed && adminRole && (
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-sidebar-foreground/70">
              Role: {adminRole}
            </div>
            <VersionBadge />
          </div>
        )}
        
        {/* Theme Toggle */}
        {onThemeToggle && (
          <Button
            variant="ghost"
            onClick={onThemeToggle}
            className={cn(
              "w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent",
              isCollapsed ? "px-2" : "px-3"
            )}
            title={`Switch theme (current: ${theme === 'system' ? 'auto' : theme})`}
          >
            {theme === 'light' ? (
              <Sun className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
            ) : theme === 'dark' ? (
              <Moon className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
            ) : (
              <Monitor className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
            )}
            {!isCollapsed && (
              <span>
                {theme === 'light' ? 'Light' :
                 theme === 'dark' ? 'Dark' :
                 'Auto'}
              </span>
            )}
          </Button>
        )}
        
        <Button
          variant="ghost"
          onClick={onLogout}
          className={cn(
            "w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent",
            isCollapsed ? "px-2" : "px-3"
          )}
        >
          <LogOut className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
          {!isCollapsed && <span>Logout</span>}
        </Button>
      </div>
    </div>
  );
}