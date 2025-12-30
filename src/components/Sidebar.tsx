import {
  Users,
  Wifi,
  MapPin,
  AlertTriangle,
  Settings,
  TrendingUp,
  Compass,
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
  Share2,
  Database,
  GitBranch,
  LayoutDashboard,
  Wrench,
  Palette,
  Skull,
  Anchor,
  Radio,
  Scroll,
  Map,
  Swords,
  Flag,
  Eye,
  ShoppingCart
} from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import extremeNetworksLogo from 'figma:asset/cc372b1d703a0b056a9f8c590da6c8e1cb4947fd.png';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { useState } from 'react';
import { cn } from './ui/utils';
import { useBranding } from '@/lib/branding';

interface SidebarProps {
  onLogout: () => void;
  adminRole: string | null;
  currentPage: string;
  onPageChange: (page: string) => void;
  theme?: 'light' | 'dark' | 'synthwave' | 'pirate' | 'mi5' | 'kroger' | 'system';
  onThemeToggle?: () => void;
}

// Navigation items with pirate and MI5-themed icons and labels
const navigationItems = [
  { id: 'service-levels', label: 'Service Levels', pirateLabel: "Ship's Status", mi5Label: "Operations Status", icon: TrendingUp, pirateIcon: Anchor },
  { id: 'connected-clients', label: 'Connected Clients', pirateLabel: "Crew Aboard", mi5Label: "Field Agents", icon: Users, pirateIcon: Users },
  { id: 'access-points', label: 'Access Points', pirateLabel: "Signal Beacons", mi5Label: "Assets", icon: Wifi, pirateIcon: Radio },
  { id: 'report-widgets', label: 'Report Widgets', pirateLabel: "Treasure Maps", mi5Label: "Q Division", icon: BarChart3, pirateIcon: Scroll },
];

// Configure items with pirate and MI5-themed icons and labels
const configureItems = [
  { id: 'configure-sites', label: 'Sites', pirateLabel: "Islands", mi5Label: "Safe Houses", icon: MapPin, pirateIcon: Map },
  { id: 'configure-networks', label: 'Networks', pirateLabel: "Sea Routes", mi5Label: "Secure Channels", icon: Network, pirateIcon: Compass },
  { id: 'configure-policy', label: 'Policy', pirateLabel: "Ship's Code", mi5Label: "Protocols", icon: Shield, pirateIcon: Shield },
  { id: 'configure-aaa-policies', label: 'AAA Policies', pirateLabel: "Sword Guard", mi5Label: "Clearance Levels", icon: UserCheck, pirateIcon: Swords },
  { id: 'configure-guest', label: 'Guest', pirateLabel: "Welcome Mateys", mi5Label: "Recruits", icon: UserPlus, pirateIcon: Flag },
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
      <div className={cn(
        "border-b border-sidebar-border",
        theme === 'kroger' ? 'px-4 py-[18px]' : 'p-4'
      )}>
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center space-x-2">
              {theme === 'kroger' ? (
                <img
                  src="/branding/kroger/logo.svg"
                  alt="Kroger"
                  className="h-8 w-auto brightness-0 invert"
                  style={{ filter: 'brightness(0) invert(1)' }}
                />
              ) : (
                <div className="text-foreground">
                  <span className="text-muted-foreground text-xs">{branding.fullName}</span>
                </div>
              )}
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
          const Icon = theme === 'pirate' ? item.pirateIcon : item.icon;
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
              {!isCollapsed && <span>{theme === 'pirate' ? item.pirateLabel : theme === 'mi5' ? item.mi5Label : item.label}</span>}
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
                <span className="flex-1 text-left">{theme === 'pirate' ? "Ship's Riggin'" : theme === 'mi5' ? "Mission Control" : "Configure"}</span>
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
                const Icon = theme === 'pirate' ? item.pirateIcon : item.icon;
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
                    <span>{theme === 'pirate' ? item.pirateLabel : theme === 'mi5' ? item.mi5Label : item.label}</span>
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
          {!isCollapsed && <span>{theme === 'pirate' ? "Captain's Quarters" : theme === 'mi5' ? "HQ" : "Administration"}</span>}
        </Button>
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* User Info & Theme Toggle & Logout */}
      <div className="p-4 space-y-2">
        {!isCollapsed && adminRole && (
          <div className="text-xs text-sidebar-foreground/70">
            Role: {adminRole}
          </div>
        )}
        
        {/* Theme Toggle */}
        {onThemeToggle && (
          <Button
            variant="ghost"
            onClick={onThemeToggle}
            className={cn(
              "w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent",
              isCollapsed ? "px-2" : "px-3",
              theme === 'synthwave' && "bg-gradient-to-r from-pink-500/20 to-purple-500/20 border border-pink-500/50"
            )}
            title={`Switch theme (current: ${theme === 'system' ? 'auto' : theme})`}
          >
            {theme === 'light' ? (
              <Sun className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
            ) : theme === 'dark' ? (
              <Moon className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
            ) : theme === 'synthwave' ? (
              <Palette className={cn("h-4 w-4 text-pink-400", !isCollapsed && "mr-2")} />
            ) : theme === 'pirate' ? (
              <Skull className={cn("h-4 w-4 text-yellow-600", !isCollapsed && "mr-2")} />
            ) : theme === 'mi5' ? (
              <Eye className={cn("h-4 w-4 text-red-600", !isCollapsed && "mr-2")} />
            ) : theme === 'kroger' ? (
              <ShoppingCart className={cn("h-4 w-4 text-blue-700", !isCollapsed && "mr-2")} />
            ) : (
              <Monitor className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
            )}
            {!isCollapsed && (
              <span className={
                theme === 'synthwave' ? 'text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-cyan-400 font-bold' :
                theme === 'pirate' ? 'text-yellow-600 font-bold' :
                theme === 'mi5' ? 'text-red-600 font-bold' :
                theme === 'kroger' ? 'text-blue-700 font-bold' : ''
              }>
                {theme === 'light' ? 'Light' :
                 theme === 'dark' ? 'Dark' :
                 theme === 'synthwave' ? 'Miami Vice' :
                 theme === 'pirate' ? 'Pirate' :
                 theme === 'mi5' ? 'MI5' :
                 theme === 'kroger' ? 'Kroger' :
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