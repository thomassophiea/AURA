/**
 * Unified UI Constants for AIO Platform Management Dashboard
 * AI-Informed Orchestration
 * Ensures consistency across all pages
 */

// ==================== Typography ====================
export const TYPOGRAPHY = {
  // Page Titles
  pageTitle: 'text-2xl font-medium text-foreground',
  
  // Section Headings
  sectionHeading: 'text-xl font-medium text-foreground',
  subsectionHeading: 'text-lg font-medium text-foreground',
  
  // Card Titles
  cardTitle: 'text-base font-medium text-foreground',
  cardSubtitle: 'text-sm text-muted-foreground',
  
  // Body Text
  bodyText: 'text-sm text-foreground',
  bodyTextMuted: 'text-sm text-muted-foreground',
  captionText: 'text-xs text-muted-foreground',
  
  // Labels
  label: 'text-sm font-medium text-foreground',
  labelMuted: 'text-sm font-medium text-muted-foreground',
  
  // Metrics
  metricValue: 'text-2xl font-bold text-foreground',
  metricLabel: 'text-xs text-muted-foreground uppercase tracking-wide',
  
  // Table
  tableHeader: 'text-xs font-medium text-muted-foreground uppercase tracking-wide',
  tableCell: 'text-sm text-foreground',
} as const;

// ==================== Spacing ====================
export const SPACING = {
  // Page Layout
  pageContainer: 'p-6',
  pagePadding: 'p-6',
  
  // Sections
  sectionGap: 'space-y-6',
  sectionPadding: 'p-6',
  
  // Cards
  cardPadding: 'p-6',
  cardGap: 'space-y-4',
  
  // Grid Layouts
  gridGap: 'gap-6',
  gridItemGap: 'gap-4',
  
  // Content
  contentGap: 'space-y-4',
  contentGapSm: 'space-y-2',
  
  // Inline Elements
  inlineGap: 'gap-2',
  inlineGapSm: 'gap-1',
} as const;

// ==================== Card Styles ====================
export const CARD_STYLES = {
  // Base Card
  base: 'surface-2dp rounded border border-border overflow-hidden',
  
  // Card with Hover
  interactive: 'surface-2dp rounded border border-border overflow-hidden transition-all hover:shadow-lg cursor-pointer',
  
  // Card Header
  header: 'p-6 border-b border-border',
  
  // Card Body
  body: 'p-6',
  
  // Card Footer
  footer: 'p-6 border-t border-border',
  
  // Compact Card
  compact: 'surface-2dp rounded border border-border p-4',
} as const;

// ==================== Button Styles ====================
export const BUTTON_STYLES = {
  // Icon sizes within buttons
  iconSize: 'h-4 w-4',
  iconSizeLg: 'h-5 w-5',
  
  // Button spacing
  iconButtonGap: 'gap-2',
} as const;

// ==================== Status Colors ====================
export const STATUS = {
  // Health Status
  healthy: {
    text: 'text-success',
    bg: 'bg-success',
    border: 'border-success',
    icon: 'text-success',
  },
  warning: {
    text: 'text-warning',
    bg: 'bg-warning',
    border: 'border-warning',
    icon: 'text-warning',
  },
  critical: {
    text: 'text-destructive',
    bg: 'bg-destructive',
    border: 'border-destructive',
    icon: 'text-destructive',
  },
  info: {
    text: 'text-info',
    bg: 'bg-info',
    border: 'border-info',
    icon: 'text-info',
  },
  neutral: {
    text: 'text-muted-foreground',
    bg: 'bg-muted',
    border: 'border-border',
    icon: 'text-muted-foreground',
  },
} as const;

// ==================== Semantic Color Tokens (Kroger Theme) ====================
export const SEMANTIC_COLORS = {
  // Background
  backgroundDefault: 'bg-[var(--background-default)]',
  backgroundSecondary: 'bg-[var(--background-secondary)]',
  backgroundInverse: 'bg-[var(--background-inverse)]',

  // Surface
  surfacePrimary: 'bg-[var(--surface-primary)]',
  surfaceSecondary: 'bg-[var(--surface-secondary)]',
  surfaceElevated: 'bg-[var(--surface-elevated)]',

  // Brand
  brandPrimary: 'bg-[var(--brand-primary)]',
  brandPrimaryHover: 'hover:bg-[var(--brand-primary-hover)]',
  brandPrimaryActive: 'active:bg-[var(--brand-primary-active)]',
  brandSecondary: 'bg-[var(--brand-secondary)]',

  // Text
  textPrimary: 'text-[var(--text-primary)]',
  textSecondary: 'text-[var(--text-secondary)]',
  textMuted: 'text-[var(--text-muted)]',
  textInverse: 'text-[var(--text-inverse)]',
  textOnBrand: 'text-[var(--text-on-brand)]',

  // Borders
  borderDefault: 'border-[var(--border-default)]',
  borderSubtle: 'border-[var(--border-subtle)]',
  borderFocus: 'border-[var(--border-focus)]',
} as const;

// ==================== Table Semantic Tokens ====================
export const TABLE_SEMANTIC = {
  // Header
  headerBg: 'bg-[var(--table-header-bg)]',
  headerText: 'text-[var(--table-header-text)]',
  headerBorder: 'border-[var(--table-header-border)]',

  // Rows
  rowBg: 'bg-[var(--table-row-bg)]',
  rowHover: 'hover:bg-[var(--table-row-hover)]',
  rowSelected: 'bg-[var(--table-row-selected)]',
  rowBorder: 'border-[var(--table-row-border)]',

  // Cells
  cellText: 'text-[var(--table-cell-text)]',
  cellMuted: 'text-[var(--table-cell-muted)]',
} as const;

// ==================== Badge Styles ====================
export const BADGE_STYLES = {
  // Status Badges
  success: 'bg-success/10 text-success border-success/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  error: 'bg-destructive/10 text-destructive border-destructive/20',
  info: 'bg-info/10 text-info border-info/20',
  neutral: 'bg-muted text-muted-foreground border-border',
} as const;

// ==================== Icon Sizes ====================
export const ICON_SIZES = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-8 w-8',
} as const;

// ==================== Terminology Standards ====================
export const TERMINOLOGY = {
  // Device Types
  accessPoint: 'Access Point',
  accessPointShort: 'AP',
  accessPoints: 'Access Points',
  accessPointsShort: 'APs',
  
  // Network Elements
  client: 'Client',
  clients: 'Clients',
  device: 'Device',
  devices: 'Devices',
  site: 'Site',
  sites: 'Sites',
  network: 'Network',
  networks: 'Networks',
  
  // Status Terms
  connected: 'Connected',
  disconnected: 'Disconnected',
  online: 'Online',
  offline: 'Offline',
  active: 'Active',
  inactive: 'Inactive',
  
  // Metrics
  throughput: 'Throughput',
  bandwidth: 'Bandwidth',
  latency: 'Latency',
  uptime: 'Uptime',
  clients: 'Clients',
} as const;

// ==================== Date/Time Formatting ====================
export const formatDateTime = {
  // Full date and time: "Nov 6, 2025 at 2:30 PM"
  full: (date: Date | string | number): string => {
    const d = new Date(date);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  },
  
  // Date only: "Nov 6, 2025"
  date: (date: Date | string | number): string => {
    const d = new Date(date);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  },
  
  // Time only: "2:30 PM"
  time: (date: Date | string | number): string => {
    const d = new Date(date);
    return d.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  },
  
  // Relative time: "2 minutes ago"
  relative: (date: Date | string | number): string => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    return formatDateTime.date(d);
  },
  
  // ISO format: "2025-11-06T14:30:00"
  iso: (date: Date | string | number): string => {
    const d = new Date(date);
    return d.toISOString();
  },
};

// ==================== Metric Formatting ====================
export const formatMetric = {
  // Bytes: "1.5 MB", "500 KB", "1.2 GB"
  bytes: (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  },
  
  // Bits per second: "1.5 Mbps", "500 Kbps", "1.2 Gbps"
  bps: (bps: number): string => {
    if (bps === 0) return '0 bps';
    const k = 1000;
    const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
    const i = Math.floor(Math.log(bps) / Math.log(k));
    return `${(bps / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  },
  
  // Number with commas: "1,234,567"
  number: (num: number): string => {
    return num.toLocaleString('en-US');
  },
  
  // Percentage: "45.2%"
  percentage: (num: number, decimals: number = 1): string => {
    return `${num.toFixed(decimals)}%`;
  },
  
  // Duration: "2h 30m", "45m", "30s"
  duration: (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  },
  
  // Latency: "12 ms"
  latency: (ms: number): string => {
    return `${ms.toFixed(0)} ms`;
  },
  
  // Signal strength: "-45 dBm"
  signal: (dbm: number): string => {
    return `${dbm} dBm`;
  },
};

// ==================== Layout Patterns ====================
export const LAYOUTS = {
  // Page Container
  page: 'min-h-screen bg-background',
  
  // Page Header
  pageHeader: 'flex items-center justify-between mb-6',
  
  // Content Grid (for cards)
  grid2Col: 'grid grid-cols-1 md:grid-cols-2 gap-6',
  grid3Col: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6',
  grid4Col: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6',
  
  // Metric Grid
  metricGrid: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6',
  
  // Table Container
  tableContainer: 'surface-2dp rounded border border-border overflow-hidden',
  
  // Flex Layouts
  flexBetween: 'flex items-center justify-between',
  flexStart: 'flex items-center justify-start',
  flexCenter: 'flex items-center justify-center',
  flexEnd: 'flex items-center justify-end',
} as const;

// ==================== Table Styles ====================
export const TABLE_STYLES = {
  // Table wrapper
  wrapper: 'surface-2dp rounded border border-border overflow-hidden',
  
  // Table element
  table: 'w-full',
  
  // Table header
  header: 'bg-muted/30 border-b border-border',
  headerRow: '',
  headerCell: 'px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide',
  
  // Table body
  body: '',
  bodyRow: 'border-b border-border last:border-0 hover:bg-muted/20 transition-colors',
  bodyCell: 'px-6 py-4 text-sm text-foreground',
} as const;

// ==================== Loading & Empty States ====================
export const STATES = {
  loading: 'flex items-center justify-center p-8 text-muted-foreground',
  error: 'flex items-center justify-center p-8 text-destructive',
  empty: 'flex flex-col items-center justify-center p-12 text-muted-foreground',
} as const;

// ==================== Animation Durations ====================
export const ANIMATION = {
  fast: 150,
  normal: 200,
  slow: 300,
} as const;