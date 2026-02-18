/**
 * Sidebar — 4 switchable nav styles:
 *   glass   : frosted glass, section labels, gradient left-border active
 *   pill    : icon-only rail, pill active highlight, always w-14
 *   hover   : collapses to w-14, expands to w-60 on CSS hover (no JS)
 *   command : solid bg, full-width block active, bold section dividers
 *
 * Style is persisted in localStorage under 'aura-nav-style'.
 * Workspace item has Service Levels as an always-visible sub-item.
 */

import {
  Users, Wifi, MapPin, Settings, Brain, LogOut, Menu, ChevronRight,
  Cog, Network, Shield, UserCheck, UserPlus, Sun, Moon, Monitor, Zap,
  BarChart3, Wrench, AppWindow, FileCheck, Database, Key, Download,
  Activity, Bell, HardDrive, LayoutDashboard, HelpCircle, Target, PanelLeft,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from './ui/utils';
import { useBranding } from '@/lib/branding';
import { VersionBadge } from './VersionBadge';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';

// ── Types ─────────────────────────────────────────────────────────────────────

type NavStyle = 'glass' | 'pill' | 'hover' | 'command';
const ALL_STYLES: NavStyle[] = ['glass', 'pill', 'hover', 'command'];
const STYLE_LABEL: Record<NavStyle, string> = {
  glass: 'Glass', pill: 'Pill', hover: 'Hover', command: 'Command',
};
const NAV_STYLE_KEY = 'aura-nav-style';

function loadNavStyle(): NavStyle {
  try {
    const s = localStorage.getItem(NAV_STYLE_KEY) as NavStyle;
    if (ALL_STYLES.includes(s)) return s;
  } catch { /* */ }
  return 'glass';
}

interface SidebarProps {
  onLogout: () => void;
  adminRole: string | null;
  currentPage: string;
  onPageChange: (page: string) => void;
  theme?: 'light' | 'dark' | 'synthwave' | 'system';
  onThemeToggle?: () => void;
}

// ── Data ──────────────────────────────────────────────────────────────────────

/** Sub-items of Workspace — always visible, indented below it */
const workspaceChildren = [
  { id: 'sle-dashboard', label: 'Service Levels', icon: Target },
];

const mainItems = [
  { id: 'service-levels', label: 'Contextual Insights', icon: Brain },
  { id: 'app-insights', label: 'App Insights', icon: AppWindow },
];

const networkItems = [
  { id: 'connected-clients', label: 'Connected Clients', icon: Users },
  { id: 'access-points', label: 'Access Points', icon: Wifi },
  { id: 'report-widgets', label: 'Report Widgets', icon: BarChart3 },
];

const configureItems = [
  { id: 'configure-sites', label: 'Sites', icon: MapPin },
  { id: 'configure-networks', label: 'Networks', icon: Network },
  { id: 'configure-policy', label: 'Policy', icon: Shield },
  { id: 'configure-aaa-policies', label: 'AAA Policies', icon: UserCheck },
  { id: 'configure-guest', label: 'Guest', icon: UserPlus },
  { id: 'configure-advanced', label: 'Advanced', icon: Settings },
];

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

// ── Shared sub-components ─────────────────────────────────────────────────────

/** A single nav row that adapts its active-indicator to the current style. */
function NavItem({
  item,
  isActive,
  onClick,
  navStyle,
  isChild = false,
  iconOnly = false,
}: {
  item: { id: string; label: string; icon: React.ElementType };
  isActive: boolean;
  onClick: () => void;
  navStyle: NavStyle;
  isChild?: boolean;
  iconOnly?: boolean;
}) {
  const Icon = item.icon;
  const isGlass = navStyle === 'glass' || navStyle === 'hover';
  const isCmd = navStyle === 'command';

  // ── Pill / icon-only mode ──────────────────────────────────────────────────
  if (iconOnly || navStyle === 'pill') {
    return (
      <button
        onClick={onClick}
        title={item.label}
        className={cn(
          'relative w-full flex justify-center items-center rounded-lg transition-all duration-150',
          isChild ? 'py-1.5' : 'py-2.5',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/45 hover:text-sidebar-foreground hover:bg-white/[0.05]',
        )}
      >
        {/* Thin left pip for glass-collapsed active */}
        {isActive && isGlass && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-gradient-to-b from-blue-400 to-violet-500 opacity-90" />
        )}
        <Icon className={cn(
          isChild ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]',
          isActive && (isGlass ? 'text-blue-400' : 'text-sidebar-accent-foreground'),
        )} />
      </button>
    );
  }

  // ── Command style ──────────────────────────────────────────────────────────
  if (isCmd) {
    return (
      <button
        onClick={onClick}
        className={cn(
          'relative w-full flex items-center transition-all duration-100 rounded-sm',
          isChild ? 'gap-2 px-4 py-1.5 text-xs' : 'gap-3 px-3 py-2.5 text-sm',
          isActive
            ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
            : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/20',
        )}
      >
        <Icon className={cn(isChild ? 'h-3.5 w-3.5' : 'h-4 w-4', 'shrink-0')} />
        <span className="truncate">{item.label}</span>
      </button>
    );
  }

  // ── Glass / hover expanded mode ────────────────────────────────────────────
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative w-full flex items-center rounded-lg transition-all duration-150',
        isChild ? 'gap-2.5 px-3 py-1.5 text-xs' : 'gap-3 px-3 py-2 text-sm',
        isActive
          ? 'bg-sidebar-accent/40 text-sidebar-foreground'
          : 'text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-white/[0.04]',
      )}
    >
      {/* Gradient left border */}
      {isActive && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-gradient-to-b from-blue-400 to-violet-500 opacity-90" />
      )}
      <Icon className={cn(
        'shrink-0',
        isChild ? 'h-3.5 w-3.5' : 'h-4 w-4',
        isActive && 'text-blue-400',
      )} />
      {navStyle === 'hover' ? (
        // For hover style: label fades in with the sidebar expansion
        <span className={cn(
          'truncate whitespace-nowrap transition-opacity duration-150 overflow-hidden',
          'opacity-0 group-hover/sb:opacity-100',
          isActive && 'font-medium',
        )}>
          {item.label}
        </span>
      ) : (
        <span className={cn('truncate', isActive && 'font-medium')}>{item.label}</span>
      )}
    </button>
  );
}

/** Section label row. In command style: uppercase + horizontal rule. */
function SectionLabel({
  label,
  navStyle,
  iconOnly,
}: {
  label: string;
  navStyle: NavStyle;
  iconOnly: boolean;
}) {
  if (navStyle === 'pill' || iconOnly) {
    // Tiny divider in pill/collapsed mode
    return (
      <div className="py-2 px-2 flex justify-center">
        <div className="w-5 h-px bg-sidebar-border/40" />
      </div>
    );
  }
  if (navStyle === 'command') {
    return (
      <div className="flex items-center gap-2 px-3 pt-4 pb-1">
        <span className="text-[10px] font-bold tracking-widest text-sidebar-foreground/40 uppercase shrink-0">
          {label}
        </span>
        <div className="flex-1 h-px bg-sidebar-border/30" />
      </div>
    );
  }
  // glass / hover
  const isHover = navStyle === 'hover';
  return (
    <p className={cn(
      'px-3 pt-3 pb-1 text-[10px] font-semibold tracking-widest text-sidebar-foreground/35 uppercase select-none whitespace-nowrap',
      isHover && 'opacity-0 group-hover/sb:opacity-100 transition-opacity duration-150',
    )}>
      {label}
    </p>
  );
}

/** Small icon-only footer action button. */
function FooterIcon({
  icon: Icon,
  onClick,
  active,
  title,
}: {
  icon: React.ElementType;
  onClick?: () => void;
  active?: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded-md transition-colors',
        active
          ? 'text-sidebar-foreground bg-sidebar-accent/40'
          : 'text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-white/[0.06]',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Sidebar({
  onLogout,
  adminRole,
  currentPage,
  onPageChange,
  theme = 'system',
  onThemeToggle,
}: SidebarProps) {
  const [navStyle, setNavStyle] = useState<NavStyle>(loadNavStyle);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const branding = useBranding();
  const device = useDeviceDetection();

  const isWorkspaceChildActive = workspaceChildren.some(c => currentPage === c.id);
  const isConfigureActive = configureItems.some(c => currentPage === c.id);
  const isSystemActive = systemItems.some(c => currentPage === c.id);
  const [isConfigureExpanded, setIsConfigureExpanded] = useState(isConfigureActive);
  const [isSystemExpanded, setIsSystemExpanded] = useState(isSystemActive);

  useEffect(() => {
    if (device.isMobile) setIsMobileOpen(false);
  }, [currentPage, device.isMobile]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && device.isMobile && isMobileOpen) setIsMobileOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [device.isMobile, isMobileOpen]);

  const handlePageChange = (page: string) => {
    onPageChange(page);
    if (device.isMobile) setIsMobileOpen(false);
  };

  function cycleStyle() {
    const next = ALL_STYLES[(ALL_STYLES.indexOf(navStyle) + 1) % ALL_STYLES.length];
    setNavStyle(next);
    try { localStorage.setItem(NAV_STYLE_KEY, next); } catch { /* */ }
  }

  // In pill mode: always icon-only. In other styles: icon-only when collapsed.
  const isPill = navStyle === 'pill';
  const isHover = navStyle === 'hover';
  const isCmd = navStyle === 'command';
  const collapsed = !device.isMobile && isCollapsed && !isPill && !isHover;
  const iconOnly = isPill || collapsed;

  const ThemeIcon =
    theme === 'light' ? Sun :
    theme === 'dark' ? Moon :
    theme === 'synthwave' ? Zap :
    Monitor;

  // ── Container classes ──────────────────────────────────────────────────────
  const sidebarCls = cn(
    'h-full flex flex-col border-r transition-all duration-300',
    // Glass
    navStyle === 'glass' && 'bg-sidebar/95 backdrop-blur-xl border-sidebar-border/60 shadow-xl',
    navStyle === 'glass' && !device.isMobile && (collapsed ? 'w-14' : 'w-60'),
    // Pill
    navStyle === 'pill' && 'bg-sidebar border-sidebar-border w-14',
    // Hover: CSS-only expand via group/sb
    navStyle === 'hover' && [
      'group/sb bg-sidebar/95 backdrop-blur-xl border-sidebar-border/60 shadow-xl overflow-hidden',
      !device.isMobile && 'w-14 hover:w-60 transition-[width] duration-200 ease-out',
    ],
    // Command
    navStyle === 'command' && 'bg-sidebar border-sidebar-border',
    navStyle === 'command' && !device.isMobile && (collapsed ? 'w-14' : 'w-64'),
    // Mobile: always slide-over
    device.isMobile && [
      'fixed inset-y-0 left-0 z-50 w-64',
      'transform transition-transform duration-300',
      isMobileOpen ? 'translate-x-0' : '-translate-x-full',
    ],
  );

  // ── Shared: collapsible section button ─────────────────────────────────────
  function SectionToggle({
    icon: Icon,
    label,
    isActive,
    isExpanded,
    onToggle,
    onClickCollapsed,
  }: {
    icon: React.ElementType;
    label: string;
    isActive: boolean;
    isExpanded: boolean;
    onToggle: () => void;
    onClickCollapsed?: () => void;
  }) {
    if (iconOnly || isPill) {
      return (
        <button
          onClick={onClickCollapsed}
          title={label}
          className={cn(
            'relative w-full flex justify-center items-center py-2.5 rounded-lg transition-all duration-150',
            isActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/45 hover:text-sidebar-foreground hover:bg-white/[0.05]',
          )}
        >
          {isActive && !isPill && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-gradient-to-b from-blue-400 to-violet-500 opacity-90" />
          )}
          <Icon className={cn('h-[18px] w-[18px]', isActive && (isPill ? '' : 'text-blue-400'))} />
        </button>
      );
    }
    if (isCmd) {
      return (
        <button
          onClick={onToggle}
          className={cn(
            'relative w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm transition-all duration-100',
            isActive
              ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
              : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/20',
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left truncate">{label}</span>
          <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', isExpanded && 'rotate-90', !isActive && 'text-sidebar-foreground/30')} />
        </button>
      );
    }
    // glass / hover
    return (
      <button
        onClick={isHover ? onToggle : onToggle}
        className={cn(
          'relative w-full flex items-center rounded-lg text-sm transition-all duration-150',
          'gap-3 px-3 py-2',
          isActive
            ? 'bg-sidebar-accent/40 text-sidebar-foreground'
            : 'text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-white/[0.04]',
        )}
      >
        {isActive && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-gradient-to-b from-blue-400 to-violet-500 opacity-90" />
        )}
        <Icon className={cn('h-4 w-4 shrink-0', isActive && 'text-blue-400')} />
        {isHover ? (
          <>
            <span className={cn('flex-1 text-left truncate whitespace-nowrap opacity-0 group-hover/sb:opacity-100 transition-opacity duration-150', isActive && 'font-medium')}>
              {label}
            </span>
            <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform opacity-0 group-hover/sb:opacity-100', isExpanded && 'rotate-90', !isActive && 'text-sidebar-foreground/25')} />
          </>
        ) : (
          <>
            <span className={cn('flex-1 text-left truncate', isActive && 'font-medium')}>{label}</span>
            <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform text-sidebar-foreground/25', isExpanded && 'rotate-90')} />
          </>
        )}
      </button>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Mobile overlay */}
      {device.isMobile && isMobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsMobileOpen(false)} />
      )}

      {/* Mobile hamburger */}
      {device.isMobile && (
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="fixed top-4 left-4 z-50 p-2 rounded-md bg-sidebar border border-sidebar-border shadow-lg lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      <div className={sidebarCls}>

        {/* ── Header ────────────────────────────────────────────────── */}
        <div className={cn(
          'flex items-center border-b border-sidebar-border/50 shrink-0',
          isPill ? 'flex-col py-3 px-2 gap-2' : 'px-4 py-4 gap-2',
          collapsed && 'flex-col py-3 px-2 gap-2',
        )}>
          {/* Brand mark */}
          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-white">A</span>
          </div>

          {!iconOnly && !isPill && (
            isHover ? (
              <span className="flex-1 text-xs font-medium text-sidebar-foreground/55 truncate whitespace-nowrap opacity-0 group-hover/sb:opacity-100 transition-opacity duration-150">
                {branding.fullName}
              </span>
            ) : (
              <span className="flex-1 text-xs font-medium text-sidebar-foreground/55 truncate">
                {branding.fullName}
              </span>
            )
          )}

          {/* Collapse toggle (glass + command only) */}
          {!device.isMobile && !isPill && !isHover && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              title={collapsed ? 'Expand' : 'Collapse'}
              className="p-1 rounded-md text-sidebar-foreground/35 hover:text-sidebar-foreground hover:bg-white/[0.06] transition-colors shrink-0"
            >
              <Menu className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* ── Navigation ────────────────────────────────────────────── */}
        <nav className={cn('flex-1 overflow-y-auto py-1 space-y-0.5', isPill || collapsed ? 'px-1' : 'px-2')}>

          {/* MAIN / WORKSPACE */}
          <SectionLabel label="Main" navStyle={navStyle} iconOnly={iconOnly} />

          {/* Workspace parent item */}
          <NavItem
            item={{ id: 'workspace', label: 'Workspace', icon: LayoutDashboard }}
            isActive={currentPage === 'workspace'}
            onClick={() => handlePageChange('workspace')}
            navStyle={navStyle}
            iconOnly={iconOnly}
          />

          {/* Service Levels: always-visible child of Workspace */}
          {iconOnly || isPill ? (
            // In icon-only/pill: show as regular icon with a faint dot connector
            <div className="relative">
              <div className="absolute left-1/2 -translate-x-1/2 top-0 w-px h-2 bg-sidebar-border/30" />
              <NavItem
                item={workspaceChildren[0]}
                isActive={currentPage === workspaceChildren[0].id}
                onClick={() => handlePageChange(workspaceChildren[0].id)}
                navStyle={navStyle}
                isChild
                iconOnly={iconOnly}
              />
            </div>
          ) : (
            // In expanded: indented with left connector line
            <div className={cn(
              'ml-3 pl-3 border-l border-sidebar-border/35',
              isHover && 'opacity-0 group-hover/sb:opacity-100 transition-opacity duration-150',
            )}>
              <NavItem
                item={workspaceChildren[0]}
                isActive={currentPage === workspaceChildren[0].id}
                onClick={() => handlePageChange(workspaceChildren[0].id)}
                navStyle={navStyle}
                isChild
              />
            </div>
          )}

          {/* Rest of main items */}
          {mainItems.map(item => (
            <NavItem
              key={item.id}
              item={item}
              isActive={currentPage === item.id}
              onClick={() => handlePageChange(item.id)}
              navStyle={navStyle}
              iconOnly={iconOnly}
            />
          ))}

          {/* NETWORK */}
          <SectionLabel label="Network" navStyle={navStyle} iconOnly={iconOnly} />
          {networkItems.map(item => (
            <NavItem
              key={item.id}
              item={item}
              isActive={currentPage === item.id}
              onClick={() => handlePageChange(item.id)}
              navStyle={navStyle}
              iconOnly={iconOnly}
            />
          ))}

          {/* CONFIGURE */}
          <SectionLabel label="Configure" navStyle={navStyle} iconOnly={iconOnly} />
          <SectionToggle
            icon={Cog}
            label="Configure"
            isActive={isConfigureActive}
            isExpanded={isConfigureExpanded}
            onToggle={() => setIsConfigureExpanded(!isConfigureExpanded)}
            onClickCollapsed={() => handlePageChange('configure-sites')}
          />
          {!iconOnly && isConfigureExpanded && (
            <div className={cn(
              'ml-3 pl-3 border-l border-sidebar-border/35 space-y-0.5 mt-0.5 mb-1',
              isHover && 'opacity-0 group-hover/sb:opacity-100 transition-opacity duration-150',
            )}>
              {configureItems.map(item => (
                <NavItem
                  key={item.id}
                  item={item}
                  isActive={currentPage === item.id}
                  onClick={() => handlePageChange(item.id)}
                  navStyle={navStyle}
                  isChild
                />
              ))}
            </div>
          )}

          {/* SYSTEM — desktop only */}
          {!device.isMobile && (
            <>
              <SectionLabel label="System" navStyle={navStyle} iconOnly={iconOnly} />
              <SectionToggle
                icon={HardDrive}
                label="System"
                isActive={isSystemActive}
                isExpanded={isSystemExpanded}
                onToggle={() => setIsSystemExpanded(!isSystemExpanded)}
                onClickCollapsed={() => handlePageChange('system-backup')}
              />
              {!iconOnly && isSystemExpanded && (
                <div className={cn(
                  'ml-3 pl-3 border-l border-sidebar-border/35 space-y-0.5 mt-0.5 mb-1',
                  isHover && 'opacity-0 group-hover/sb:opacity-100 transition-opacity duration-150',
                )}>
                  {systemItems.map(item => (
                    <NavItem
                      key={item.id}
                      item={item}
                      isActive={currentPage === item.id}
                      onClick={() => handlePageChange(item.id)}
                      navStyle={navStyle}
                      isChild
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </nav>

        {/* ── Footer ────────────────────────────────────────────────── */}
        <div className={cn(
          'border-t border-sidebar-border/50 shrink-0',
          isPill || collapsed ? 'px-1 py-3' : 'px-2 py-3',
          'space-y-2',
        )}>
          {/* Desktop action icons */}
          {!device.isMobile && (
            <div className={cn(
              'flex items-center',
              iconOnly || isPill ? 'flex-col gap-1' : 'justify-between',
            )}>
              {/* Left cluster: tools, admin, help */}
              <div className={cn('flex items-center', iconOnly || isPill ? 'flex-col gap-1' : 'gap-0.5')}>
                <FooterIcon
                  icon={Wrench}
                  onClick={() => handlePageChange('tools')}
                  active={currentPage === 'tools'}
                  title="Tools"
                />
                <FooterIcon
                  icon={Settings}
                  onClick={() => handlePageChange('administration')}
                  active={currentPage === 'administration'}
                  title="Administration"
                />
                <FooterIcon
                  icon={HelpCircle}
                  onClick={() => handlePageChange('help')}
                  active={currentPage === 'help'}
                  title="Help"
                />
              </div>

              {/* Right cluster: style switcher, theme, logout */}
              <div className={cn('flex items-center', iconOnly || isPill ? 'flex-col gap-1' : 'gap-0.5')}>
                {/* Nav style cycle button */}
                <FooterIcon
                  icon={PanelLeft}
                  onClick={cycleStyle}
                  title={`Layout: ${STYLE_LABEL[navStyle]} — click to change`}
                />
                {onThemeToggle && (
                  <FooterIcon
                    icon={ThemeIcon}
                    onClick={onThemeToggle}
                    title={`Theme: ${theme === 'system' ? 'auto' : theme}`}
                  />
                )}
                <FooterIcon icon={LogOut} onClick={onLogout} title="Logout" />
              </div>
            </div>
          )}

          {/* Admin · version (hidden when fully icon-only) */}
          {!iconOnly && !isPill && (
            isHover ? (
              <div className="flex items-center justify-between px-1 opacity-0 group-hover/sb:opacity-100 transition-opacity duration-150">
                {adminRole && (
                  <span className="text-[10px] text-sidebar-foreground/30 truncate whitespace-nowrap">{adminRole}</span>
                )}
                <VersionBadge />
              </div>
            ) : (
              <div className="flex items-center justify-between px-1">
                {adminRole && (
                  <span className="text-[10px] text-sidebar-foreground/30 truncate">{adminRole}</span>
                )}
                <VersionBadge />
              </div>
            )
          )}

          {/* Mobile: just theme + logout */}
          {device.isMobile && (
            <div className="flex items-center gap-1">
              {onThemeToggle && (
                <FooterIcon icon={ThemeIcon} onClick={onThemeToggle} title={`Theme: ${theme}`} />
              )}
              <FooterIcon icon={LogOut} onClick={onLogout} title="Logout" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
