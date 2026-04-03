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
  ChevronLeft,
  Cog,
  Network,
  Shield,
  UserCheck,
  UserPlus,
  Sun,
  Moon,
  Monitor,
  Braces,
  Zap,
  Layers,
  BarChart3,
  Wrench,
  AppWindow,
  FileCheck,
  Database,
  Key,
  Download,
  Activity,
  Bell,
  HardDrive,
  LayoutDashboard,
  HelpCircle,
  Target,
  Building2,
  Globe,
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
import { prefetchComponent } from '@/lib/prefetch';
import { tenantService } from '../services/tenantService';
import { useAppContext } from '@/contexts/AppContext';
import { usePersonaContext } from '@/contexts/PersonaContext';

interface SidebarProps {
  onLogout: () => void;
  adminRole: string | null;
  currentPage: string;
  onPageChange: (page: string) => void;
  theme?: 'light' | 'ep1' | 'dev';
  onThemeToggle?: () => void;
}

// ── Org-level navigation (primary scope) ──
const monitoringItems = [
  { id: 'service-levels', label: 'Insights', icon: Brain, badge: 'Sandbox' },
  { id: 'sle-dashboard', label: 'Service Levels', icon: Target },
  { id: 'app-insights', label: 'App Insights', icon: AppWindow },
  { id: 'connected-clients', label: 'Connected Clients', icon: Users },
  { id: 'access-points', label: 'Access Points', icon: Wifi },
  { id: 'report-widgets', label: 'Report Widgets', icon: BarChart3 },
];

const configureItems = [
  { id: 'configure-sites-groups', label: 'Sites & Groups', icon: Building2 },
  { id: 'configure-networks', label: 'Networks', icon: Network },
  { id: 'configure-policy', label: 'Policy', icon: Shield },
  { id: 'configure-aaa-policies', label: 'AAA Policies', icon: UserCheck },
  { id: 'configure-guest', label: 'Guest', icon: UserPlus },
  { id: 'configure-advanced', label: 'Advanced', icon: Settings },
  { id: 'configure-adoption-rules', label: 'Adoption Rules', icon: Zap },
  { id: 'global-templates', label: 'Templates', icon: Layers },
  { id: 'global-variables', label: 'Variables', icon: Braces },
];

const operationsItems = [
  { id: 'event-alarm-dashboard', label: 'Events & Alarms', icon: Bell },
  { id: 'security-dashboard', label: 'Security', icon: Shield },
  { id: 'pci-report', label: 'PCI DSS Report', icon: FileCheck },
];

// ── Site-group scope (controller drill-down only) ──
const controllerItems = [
  { id: 'system-backup', label: 'Backup & Storage', icon: Database },
  { id: 'firmware-manager', label: 'Firmware Manager', icon: Download },
  { id: 'network-diagnostics', label: 'Network Diagnostics', icon: Activity },
  { id: 'license-dashboard', label: 'License Management', icon: Key },
  { id: 'site-group-settings', label: 'Controller Settings', icon: Cog },
  { id: 'guest-management', label: 'Guest Accounts', icon: UserPlus },
];

export function Sidebar({ onLogout, adminRole, currentPage, onPageChange, theme = 'ep1', onThemeToggle }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const branding = useBranding();
  const device = useDeviceDetection();
  const org = tenantService.getCurrentOrganization();
  const { navigationScope, siteGroup, exitSiteGroup } = useAppContext();
  const { filterItems, isPageAllowed } = usePersonaContext();

  // Filter nav items by active persona
  const filteredMonitoringItems = filterItems(monitoringItems);
  const filteredConfigureItems = filterItems(configureItems);
  const filteredOperationsItems = filterItems(operationsItems);
  const filteredControllerItems = filterItems(controllerItems);

  // Check if any section sub-item is currently active
  const isMonitoringActive = filteredMonitoringItems.some(item => currentPage === item.id);
  const isConfigureActive = filteredConfigureItems.some(item => currentPage === item.id);
  const isOperationsActive = filteredOperationsItems.some(item => currentPage === item.id);
  const isControllerActive = filteredControllerItems.some(item => currentPage === item.id);

  // Auto-expand sections if an item is active
  const [isMonitoringExpanded, setIsMonitoringExpanded] = useState(true);
  const [isConfigureExpanded, setIsConfigureExpanded] = useState(isConfigureActive);
  const [isOperationsExpanded, setIsOperationsExpanded] = useState(isOperationsActive);

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

  // Reusable collapsible section renderer
  const renderCollapsibleSection = ({
    label, icon: SectionIcon, items, isActive, isExpanded, onToggle,
  }: {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    items: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: string }>;
    isActive: boolean;
    isExpanded: boolean;
    onToggle: () => void;
  }) => (
    <div className="space-y-1">
      <Button
        variant={isActive ? "default" : "ghost"}
        className={cn(
          "w-full justify-start h-10",
          isCollapsed ? "px-2" : "px-3",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
        onClick={() => { if (!isCollapsed) onToggle(); }}
      >
        <SectionIcon className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
        {!isCollapsed && (
          <>
            <span className="flex-1 text-left">{label}</span>
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </>
        )}
      </Button>
      {!isCollapsed && isExpanded && (
        <div className="ml-6 space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                variant={currentPage === item.id ? "default" : "ghost"}
                className={cn(
                  "w-full justify-start h-9 text-sm px-3",
                  currentPage === item.id
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
                onClick={() => handlePageChange(item.id)}
                onMouseEnter={() => prefetchComponent(item.id)}
              >
                <Icon className="h-3 w-3 mr-2" />
                <span className="flex items-center gap-2">
                  {item.label}
                  {item.badge && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[color:var(--status-warning-bg)] text-[color:var(--status-warning)] font-medium uppercase tracking-wide">
                      {item.badge}
                    </span>
                  )}
                </span>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );

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
                <span className="font-semibold text-sm tracking-widest">{branding.fullName}</span>
                {org?.name ? (
                  <p className="text-[10px] text-muted-foreground/70 tracking-wide leading-tight mt-0.5 truncate max-w-[160px]">
                    {org.name}
                  </p>
                ) : branding.tagline ? (
                  <p className="text-[10px] text-muted-foreground/60 tracking-wide leading-tight mt-0.5">
                    {branding.tagline}
                  </p>
                ) : null}
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
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navigationScope === 'global' && (
          <>
            {/* Report Studio — top-level item */}
            <Button
              variant={currentPage === 'workspace' ? "default" : "ghost"}
              className={cn(
                "w-full justify-start h-10",
                isCollapsed ? "px-2" : "px-3",
                currentPage === 'workspace'
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              onClick={() => handlePageChange('workspace')}
              onMouseEnter={() => prefetchComponent('workspace')}
            >
              <LayoutDashboard className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
              {!isCollapsed && (
                <span className="flex items-center gap-2">
                  Report Studio
                </span>
              )}
            </Button>

            {/* Monitoring Section */}
            {filteredMonitoringItems.length > 0 && renderCollapsibleSection({
              label: 'Monitoring',
              icon: BarChart3,
              items: filteredMonitoringItems,
              isActive: isMonitoringActive,
              isExpanded: isMonitoringExpanded,
              onToggle: () => setIsMonitoringExpanded(!isMonitoringExpanded),
            })}

            {/* Configure Section */}
            {filteredConfigureItems.length > 0 && renderCollapsibleSection({
              label: 'Configure',
              icon: Cog,
              items: filteredConfigureItems,
              isActive: isConfigureActive,
              isExpanded: isConfigureExpanded,
              onToggle: () => setIsConfigureExpanded(!isConfigureExpanded),
            })}

            {/* Operations Section - Desktop only */}
            {!device.isMobile && filteredOperationsItems.length > 0 && renderCollapsibleSection({
              label: 'Operations',
              icon: Bell,
              items: filteredOperationsItems,
              isActive: isOperationsActive,
              isExpanded: isOperationsExpanded,
              onToggle: () => setIsOperationsExpanded(!isOperationsExpanded),
            })}

            {/* Desktop-only: Tools and Administration */}
            {!device.isMobile && (
              <>
                {isPageAllowed('tools') && (
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
                )}
                {isPageAllowed('administration') && (
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
                )}
              </>
            )}
          </>
        )}

        {navigationScope === 'site-group' && (
          <>
            {/* Back to Organization */}
            {!isCollapsed && (
              <Button
                variant="ghost"
                className="w-full justify-start h-10 px-3 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground mb-1"
                onClick={() => exitSiteGroup()}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                <Globe className="h-3.5 w-3.5 mr-1.5" />
                <span className="text-xs">Back to Organization</span>
              </Button>
            )}
            {isCollapsed && (
              <Button
                variant="ghost"
                className="w-full justify-center h-10 px-2 text-sidebar-foreground/70 hover:bg-sidebar-accent"
                onClick={() => exitSiteGroup()}
                title="Back to Organization"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            {/* Site group label */}
            {!isCollapsed && siteGroup && (
              <div className="px-3 py-1.5 mb-1">
                <div className="text-[10px] text-sidebar-foreground/50 uppercase tracking-wider font-medium">Controller</div>
                <div className="text-xs text-sidebar-foreground font-medium truncate">{siteGroup.name}</div>
              </div>
            )}

            {/* Controller Management items */}
            {filteredControllerItems.length > 0 && renderCollapsibleSection({
              label: 'Controller Management',
              icon: HardDrive,
              items: filteredControllerItems,
              isActive: isControllerActive,
              isExpanded: true,
              onToggle: () => {},
            })}
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
        
      </div>
    </div>
    </>
  );
}