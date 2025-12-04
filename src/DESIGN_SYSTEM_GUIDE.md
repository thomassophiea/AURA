# AURA Platform Management Dashboard - Design System Guide
## Autonomous Unified Radio Agent

## Overview
This guide ensures consistency across all pages of the AURA Platform Management Dashboard using Material Design principles with authentic colors (#BB86FC primary, #03DAC5 secondary, #121212 background), Roboto typography, proper elevation shadows, and interaction states.

## Quick Reference

### Import These Utilities
```typescript
import { 
  TYPOGRAPHY, 
  SPACING, 
  CARD_STYLES, 
  ICON_SIZES, 
  TERMINOLOGY,
  formatDateTime,
  formatMetric,
  LAYOUTS,
  TABLE_STYLES 
} from '../utils/ui-constants';
import { PageHeader } from './PageHeader';
import { MetricCard } from './MetricCard';
import { StatusBadge } from './StatusBadge';
import { DataTable } from './DataTable';
```

## 1. Page Headers

**USE THIS:**
```tsx
<PageHeader
  title="Access Points"
  subtitle="Manage and monitor all access points"
  icon={Wifi}
  onRefresh={handleRefresh}
  refreshing={isRefreshing}
/>
```

**INSTEAD OF:** Inconsistent header divs with varying sizes and spacing

## 2. Metric Cards

**USE THIS:**
```tsx
<div className={LAYOUTS.metricGrid}>
  <MetricCard
    title="Total APs"
    value={totalAPs}
    icon={Wifi}
    status="healthy"
    subtitle="Online"
  />
  <MetricCard
    title="Connected Clients"
    value={totalClients}
    icon={Users}
    status="neutral"
  />
</div>
```

**INSTEAD OF:** Custom card implementations with varying padding and typography

## 3. Status Badges

**USE THIS:**
```tsx
<StatusBadge status="success" label="Online" />
<StatusBadge status="warning" label="Warning" />
<StatusBadge status="error" label="Offline" />
```

**INSTEAD OF:** Inconsistent badge colors and styles

## 4. Data Tables

**USE THIS:**
```tsx
<DataTable
  columns={[
    { key: 'name', header: 'Name' },
    { 
      key: 'status', 
      header: 'Status',
      render: (item) => <StatusBadge status={getStatus(item)} label={item.status} />
    },
  ]}
  data={items}
  loading={isLoading}
  emptyMessage="No items found"
  getRowKey={(item) => item.id}
  onRowClick={handleRowClick}
/>
```

**INSTEAD OF:** Custom table implementations with inconsistent styling

## 5. Typography

**USE THESE CLASSES:**
- Page titles: `TYPOGRAPHY.pageTitle` (text-2xl font-medium)
- Section headings: `TYPOGRAPHY.sectionHeading` (text-xl font-medium)
- Card titles: `TYPOGRAPHY.cardTitle` (text-base font-medium)
- Body text: `TYPOGRAPHY.bodyText` (text-sm)
- Muted text: `TYPOGRAPHY.bodyTextMuted` (text-sm text-muted-foreground)
- Captions: `TYPOGRAPHY.captionText` (text-xs text-muted-foreground)
- Metric values: `TYPOGRAPHY.metricValue` (text-2xl font-medium)
- Metric labels: `TYPOGRAPHY.metricLabel` (text-xs uppercase)

## 6. Spacing

**USE THESE CONSTANTS:**
- Page padding: `SPACING.pagePadding` (p-6)
- Section gaps: `SPACING.sectionGap` (space-y-6)
- Card padding: `SPACING.cardPadding` (p-6)
- Grid gaps: `SPACING.gridGap` (gap-6)
- Content gaps: `SPACING.contentGap` (space-y-4)

## 7. Card Styles

**USE THESE:**
```tsx
<Card className={CARD_STYLES.base}>
  {/* Content */}
</Card>

<Card className={CARD_STYLES.interactive}> {/* For clickable cards */}
  {/* Content */}
</Card>
```

## 8. Icon Sizes

**USE THESE:**
```tsx
<Wifi className={ICON_SIZES.sm} /> {/* h-4 w-4 */}
<Wifi className={ICON_SIZES.md} /> {/* h-5 w-5 */}
<Wifi className={ICON_SIZES.lg} /> {/* h-6 w-6 */}
```

## 9. Terminology Standards

**ALWAYS USE:**
- "Access Point" or "AP" (use TERMINOLOGY.accessPoint or .accessPointShort)
- "Client" not "Station" or "User" in UI (use TERMINOLOGY.client)
- "Site" not "Location" (use TERMINOLOGY.site)
- "Network" not "SSID" or "WLAN" (use TERMINOLOGY.network)
- "Connected" not "Associated" (use TERMINOLOGY.connected)
- "Throughput" not "Speed" (use TERMINOLOGY.throughput)

## 10. Date/Time Formatting

**USE THESE FUNCTIONS:**
```tsx
// Full datetime: "Nov 6, 2025 at 2:30 PM"
{formatDateTime.full(date)}

// Date only: "Nov 6, 2025"
{formatDateTime.date(date)}

// Time only: "2:30 PM"
{formatDateTime.time(date)}

// Relative: "2 minutes ago"
{formatDateTime.relative(date)}
```

## 11. Metric Formatting

**USE THESE FUNCTIONS:**
```tsx
// Bytes: "1.5 MB"
{formatMetric.bytes(bytes)}

// Throughput: "150.5 Mbps"
{formatMetric.bps(bitsPerSecond)}

// Numbers: "1,234,567"
{formatMetric.number(count)}

// Percentage: "45.2%"
{formatMetric.percentage(value)}

// Duration: "2h 30m"
{formatMetric.duration(seconds)}

// Latency: "12 ms"
{formatMetric.latency(milliseconds)}

// Signal: "-45 dBm"
{formatMetric.signal(dbm)}
```

## 12. Layout Patterns

**USE THESE:**
```tsx
// Page container
<div className={LAYOUTS.page}>
  <div className={SPACING.pagePadding}>
    {/* Content */}
  </div>
</div>

// 2-column grid
<div className={LAYOUTS.grid2Col}>
  {/* Cards */}
</div>

// 3-column grid
<div className={LAYOUTS.grid3Col}>
  {/* Cards */}
</div>

// 4-column grid
<div className={LAYOUTS.grid4Col}>
  {/* Cards */}
</div>

// Flex layouts
<div className={LAYOUTS.flexBetween}>{/* Items */}</div>
```

## 13. Button Consistency

**ALWAYS USE:**
- Refresh buttons with `<RefreshCw className={cn(BUTTON_STYLES.iconSize, refreshing && 'animate-spin')} />`
- Icon + text buttons with `className={BUTTON_STYLES.iconButtonGap}` (gap-2)
- Consistent button sizes: `size="sm"` for most actions

## 14. Loading States

**USE THESE:**
```tsx
{isLoading && (
  <div className={STATES.loading}>
    <Skeleton className="h-32 w-full" />
  </div>
)}

{error && (
  <div className={STATES.error}>
    {error}
  </div>
)}

{!isLoading && items.length === 0 && (
  <div className={STATES.empty}>
    <p>No items found</p>
  </div>
)}
```

## 15. Color Consistency

**USE SEMANTIC COLORS:**
- Success/Healthy: `text-success`, `bg-success`
- Warning: `text-warning`, `bg-warning`
- Error/Critical: `text-destructive`, `bg-destructive`
- Info: `text-info`, `bg-info`
- Primary: `text-primary`, `bg-primary`
- Secondary: `text-secondary`, `bg-secondary`
- Muted: `text-muted-foreground`, `bg-muted`

## Complete Page Example

```tsx
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Wifi, Users } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { MetricCard } from './MetricCard';
import { StatusBadge } from './StatusBadge';
import { DataTable, Column } from './DataTable';
import { 
  LAYOUTS, 
  SPACING, 
  CARD_STYLES,
  formatDateTime,
  formatMetric,
  TERMINOLOGY 
} from '../utils/ui-constants';

export function ExamplePage() {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const columns: Column<any>[] = [
    { 
      key: 'name', 
      header: 'Name' 
    },
    { 
      key: 'status', 
      header: 'Status',
      render: (item) => <StatusBadge status={item.status} label={item.statusText} />
    },
    { 
      key: 'timestamp', 
      header: 'Last Seen',
      render: (item) => formatDateTime.relative(item.timestamp)
    },
  ];

  return (
    <div className={LAYOUTS.page}>
      <div className={SPACING.pagePadding}>
        <div className={SPACING.sectionGap}>
          <PageHeader
            title={TERMINOLOGY.accessPoints}
            subtitle="Manage and monitor all access points"
            icon={Wifi}
            onRefresh={() => loadData()}
            refreshing={isLoading}
          />

          <div className={LAYOUTS.metricGrid}>
            <MetricCard
              title="Total APs"
              value={formatMetric.number(totalAPs)}
              icon={Wifi}
              status="healthy"
            />
            <MetricCard
              title="Connected Clients"
              value={formatMetric.number(totalClients)}
              icon={Users}
              status="neutral"
            />
          </div>

          <Card className={CARD_STYLES.base}>
            <CardHeader>
              <CardTitle>Access Points</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={columns}
                data={data}
                loading={isLoading}
                getRowKey={(item) => item.id}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

## Migration Checklist

For each page, verify:
- [ ] Uses PageHeader component
- [ ] Uses consistent typography classes
- [ ] Uses formatDateTime for all dates
- [ ] Uses formatMetric for all numbers/metrics
- [ ] Uses consistent terminology (AP not "Access Point Radio", etc.)
- [ ] Uses consistent icon sizes
- [ ] Uses consistent spacing
- [ ] Uses consistent card styles
- [ ] Uses StatusBadge for status indicators
- [ ] Uses consistent button styles
- [ ] Uses semantic color variables
- [ ] Uses consistent loading/error states