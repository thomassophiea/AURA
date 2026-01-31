import {
  Users,
  Wifi,
  MapPin,
  Settings,
  Brain,
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
  FileCheck,
  Database,
  Key,
  Download,
  Activity,
  Bell,
  HardDrive
} from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import extremeNetworksLogo from 'figma:asset/cc372b1d703a0b056a9f8c590da6c8e1cb4947fd.png';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { useState } from 'react';
import { cn } from './ui/utils';
import { useBranding } from '@/lib/branding';
import { VersionBadge } from './VersionBadge';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';
import { useEffect } from 'react';

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
  { id: 'service-levels', label: 'Contextual Insights', icon: Brain },
  { id: 'app-insights', label: 'App Insights', icon: AppWindow },
  { id: 'connected-clients', label: 'Connected Clients', icon: Users },
  { id: 'access-points', label: 'Access Points', icon: Wifi },
  { id: 'report-widgets', label: 'Report Widgets', icon: BarChart3 },
];

// Configure items
const configureItems = [
  { id: 'configure-sites', label: 'Sites', icon: MapPin },
  { id: 'configure-networks', label: 'Networks', icon: Network },
  { id: 'configure-policy', label: 'Policy', icon: Shield },
  { id: 'configure-aaa-policies', label: 'AAA Policies', icon: UserCheck },
  { id: 'configure-guest', label: 'Guest', icon: UserPlus },
];

// System Management items
const systemItems = [
  { id: 'system-backup', label: 'Backup & Storage', icon: Database },
  { id: 'license-dashboard', label: 'License Management', icon: Key },
  { id: 'firmware-manager', label: 'Firmware Manager', icon: Download },
  { id: 'network-diagnostics', label: 'Network Diagnostics', icon: Activity },
  { id: 'event-alarm-dashboard', label: 'Events & Alarms', icon: Bell },
  { id: 'security-dashboard', label: 'Security', icon: Shield },
  { id: 'pci-report', label: 'PCI DSS Report', icon: FileCheck },
  { id: 'guest-management', label: 'Guest Access', icon: UserPlus },
];

export function Sidebar({ onLogout, adminRole, currentPage, onPageChange, theme = 'system', onThemeToggle }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const branding = useBranding();
  const device = useDeviceDetection();

  // Check if any configure sub-item is currently active
  const isConfigureActive = configureItems.some(item => currentPage === item.id);
  const isSystemActive = systemItems.some(item => currentPage === item.id);

  // Auto-expand sections if an item is active
  const [isConfigureExpanded, setIsConfigureExpanded] = useState(isConfigureActive);
  const [isSystemExpanded, setIsSystemExpanded] = useState(isSystemActive);

  // Close mobile sidebar when page changes
  useEffect(() => {
    if (device.isMobile) {
      setIsMobileOpen(false);
    }
  }, [currentPage, device.isMobile]);

  // Close mobile sidebar on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && device.isMobile && isMobileOpen) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [device.isMobile, isMobileOpen]);

  const handlePageChange = (page: string) => {
    onPageChange(page);
    if (device.isMobile) {
      setIsMobileOpen(false);
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {device.isMobile && isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile Menu Button */}
      {device.isMobile && (
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="fixed top-4 left-4 z-50 p-2 rounded-md bg-sidebar border border-sidebar-border shadow-lg lg:hidden"
        >
          <Menu className="h-6 w-6" />
        </button>
      )}

      {/* Sidebar */}
      <div className={cn(
        "bg-sidebar border-r border-sidebar-border h-full flex flex-col transition-all duration-300",
        // Desktop behavior
        !device.isMobile && (isCollapsed ? "w-16" : "w-64"),
        // Mobile behavior
        device.isMobile && [
          "fixed inset-y-0 left-0 z-50 w-64",
          "transform transition-transform duration-300",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        ]
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
              onClick={() => handlePageChange(item.id)}
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
                    onClick={() => handlePageChange(item.id)}
                  >
                    <Icon className="h-3 w-3 mr-2" />
                    <span>{item.label}</span>
                  </Button>
                );
              })}
            </div>
          )}
        </div>

        {/* System Section - Desktop only */}
        {!device.isMobile && (
          <div className="space-y-1">
            <Button
              variant={isSystemActive ? "default" : "ghost"}
              className={cn(
                "w-full justify-start h-10",
                isCollapsed ? "px-2" : "px-3",
                isSystemActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              onClick={() => {
                if (!isCollapsed) {
                  setIsSystemExpanded(!isSystemExpanded);
                }
              }}
            >
              <HardDrive className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-left">System</span>
                  {isSystemExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </>
              )}
            </Button>

            {/* System Sub-items */}
            {!isCollapsed && isSystemExpanded && (
              <div className="ml-6 space-y-1">
                {systemItems.map((item) => {
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
                      onClick={() => handlePageChange(item.id)}
                    >
                      <Icon className="h-3 w-3 mr-2" />
                      <span>{item.label}</span>
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Desktop-only: Tools and Administration */}
        {!device.isMobile && (
          <>
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
              onClick={() => handlePageChange('tools')}
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
              onClick={() => handlePageChange('administration')}
            >
              <Settings className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
              {!isCollapsed && <span>Administration</span>}
            </Button>
          </>
        )}
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
        
        {/* Theme Toggle - Desktop only (mobile has it in user menu) */}
        {onThemeToggle && !device.isMobile && (
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
    </>
  );
}