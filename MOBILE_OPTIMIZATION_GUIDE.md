# Mobile Optimization Guide

This guide shows how to optimize your app for mobile devices without drastically changing the desktop experience.

## 🎯 Strategy

1. **Responsive CSS First** - Use Tailwind breakpoints (sm:, md:, lg:)
2. **Device Detection When Needed** - Use hooks for conditional rendering/behavior
3. **Touch-Friendly** - Larger tap targets, better spacing
4. **Performance** - Lazy load heavy components on mobile

---

## 📱 Available Tools

### 1. Device Detection Hook

```typescript
import { useDeviceDetection } from '@/hooks/useDeviceDetection';

function MyComponent() {
  const { isMobile, isTablet, isTouchDevice, screenSize, orientation } = useDeviceDetection();

  // Use device info to customize behavior
  if (isMobile) {
    // Mobile-specific logic
  }
}
```

### 2. Mobile Optimization Components

```typescript
import { MobileOptimized, MobileOnly, DesktopOnly, TouchOnly } from '@/components/MobileOptimized';

// Different content for mobile vs desktop
<MobileOptimized
  mobileChildren={<SimplifiedView />}
>
  <FullDesktopView />
</MobileOptimized>

// Show only on mobile
<MobileOnly>
  <TouchOptimizedControls />
</MobileOnly>

// Show only on desktop
<DesktopOnly>
  <AdvancedFilters />
</DesktopOnly>

// Show only on touch devices
<TouchOnly>
  <SwipeGestures />
</TouchOnly>
```

---

## 🎨 Recommended Mobile Optimizations

### 1. **Table Optimizations**

**Problem:** Large tables are hard to use on mobile

**Solution:** Card layout on mobile, table on desktop

```tsx
import { useDeviceDetection } from '@/hooks/useDeviceDetection';

function DataTable({ data }) {
  const { isMobile } = useDeviceDetection();

  if (isMobile) {
    // Card layout for mobile
    return (
      <div className="space-y-3">
        {data.map((item) => (
          <Card key={item.id} className="p-4">
            <div className="font-semibold">{item.name}</div>
            <div className="text-sm text-muted-foreground">{item.status}</div>
            <div className="text-xs mt-2">{item.details}</div>
          </Card>
        ))}
      </div>
    );
  }

  // Full table for desktop
  return (
    <Table>
      <TableHeader>...</TableHeader>
      <TableBody>...</TableBody>
    </Table>
  );
}
```

### 2. **Touch-Friendly Buttons**

**Problem:** Small buttons are hard to tap on mobile

**Solution:** Automatically increase button size on touch devices

```tsx
import { useIsTouchDevice } from '@/hooks/useDeviceDetection';

function ActionButton({ onClick, children }) {
  const isTouchDevice = useIsTouchDevice();

  return (
    <Button
      onClick={onClick}
      size={isTouchDevice ? "default" : "sm"}
      className={isTouchDevice ? "min-h-[44px] min-w-[44px]" : ""}
    >
      {children}
    </Button>
  );
}
```

### 3. **Simplified Navigation**

**Problem:** Too many nav items on mobile

**Solution:** Collapse into menu on mobile

```tsx
import { useIsMobile } from '@/hooks/useDeviceDetection';

function Navigation() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Menu className="h-6 w-6" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Dashboard</DropdownMenuItem>
          <DropdownMenuItem>Access Points</DropdownMenuItem>
          {/* ... */}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Full horizontal nav for desktop
  return (
    <nav className="flex gap-4">
      <NavLink to="/dashboard">Dashboard</NavLink>
      <NavLink to="/aps">Access Points</NavLink>
      {/* ... */}
    </nav>
  );
}
```

### 4. **Responsive Grid Layouts**

**Problem:** Multi-column grids too cramped on mobile

**Solution:** Use Tailwind responsive classes

```tsx
// Automatically adjusts: 1 col on mobile, 2 on tablet, 4 on desktop
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  <Card>...</Card>
  <Card>...</Card>
  <Card>...</Card>
  <Card>...</Card>
</div>
```

### 5. **Lazy Loading for Mobile**

**Problem:** Heavy components slow down mobile

**Solution:** Lazy load non-critical components

```tsx
import { lazy, Suspense } from 'react';
import { useIsMobile } from '@/hooks/useDeviceDetection';

const HeavyChart = lazy(() => import('./HeavyChart'));

function Dashboard() {
  const isMobile = useIsMobile();

  return (
    <div>
      {/* Always show critical info */}
      <StatusCards />

      {/* Lazy load charts on mobile */}
      {!isMobile ? (
        <HeavyChart />
      ) : (
        <Suspense fallback={<Skeleton className="h-64" />}>
          <HeavyChart />
        </Suspense>
      )}
    </div>
  );
}
```

### 6. **Mobile-Optimized Modals**

**Problem:** Full modals take too much space on mobile

**Solution:** Use drawer/sheet on mobile, dialog on desktop

```tsx
import { useIsMobile } from '@/hooks/useDeviceDetection';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';

function ConfigureAP({ open, onClose, data }) {
  const isMobile = useIsMobile();

  const content = (
    <div>
      <h2>Configure Access Point</h2>
      <form>...</form>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="bottom" className="h-[90vh]">
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        {content}
      </DialogContent>
    </Dialog>
  );
}
```

### 7. **Hide Non-Essential Info on Mobile**

**Problem:** Too much info clutters mobile screen

**Solution:** Show essentials only, hide extras

```tsx
import { DesktopOnly } from '@/components/MobileOptimized';

function APCard({ ap }) {
  return (
    <Card>
      {/* Always show */}
      <div className="font-semibold">{ap.name}</div>
      <div className="text-sm">{ap.status}</div>

      {/* Desktop only - extra details */}
      <DesktopOnly>
        <div className="text-xs text-muted-foreground mt-2">
          <div>Serial: {ap.serial}</div>
          <div>Model: {ap.model}</div>
          <div>Firmware: {ap.firmware}</div>
        </div>
      </DesktopOnly>
    </Card>
  );
}
```

### 8. **Mobile-Optimized Charts**

**Problem:** Complex charts hard to read on small screens

**Solution:** Simplify charts on mobile

```tsx
import { useIsMobile } from '@/hooks/useDeviceDetection';

function MetricsChart({ data }) {
  const isMobile = useIsMobile();

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 200 : 400}>
      <LineChart data={data}>
        {/* Show fewer data points on mobile */}
        <XAxis
          dataKey="timestamp"
          tickFormatter={(val) => isMobile ? format(val, 'HH:mm') : format(val, 'MMM dd HH:mm')}
          interval={isMobile ? 2 : 0}
        />
        <YAxis width={isMobile ? 40 : 60} />

        {/* Hide legend on mobile */}
        {!isMobile && <Legend />}

        <Line type="monotone" dataKey="value" stroke="#8884d8" strokeWidth={isMobile ? 2 : 3} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### 9. **Swipe Gestures (Mobile Only)**

**Problem:** Lack of intuitive mobile interactions

**Solution:** Add swipe actions for touch devices

```tsx
import { TouchOnly } from '@/components/MobileOptimized';
import { useSwipeable } from 'react-swipeable'; // npm install react-swipeable

function SwipeableCard({ item, onDelete, onEdit }) {
  const handlers = useSwipeable({
    onSwipedLeft: () => onDelete(item.id),
    onSwipedRight: () => onEdit(item.id),
  });

  return (
    <div>
      <TouchOnly>
        <div {...handlers} className="touch-action-pan-y">
          <Card>{item.name}</Card>
        </div>
      </TouchOnly>

      {/* Desktop version with buttons */}
      <DesktopOnly>
        <Card>
          {item.name}
          <Button onClick={() => onEdit(item.id)}>Edit</Button>
          <Button onClick={() => onDelete(item.id)}>Delete</Button>
        </Card>
      </DesktopOnly>
    </div>
  );
}
```

---

## 🚀 Quick Implementation Checklist

### Phase 1: Foundation (No visual changes)
- [x] Create `useDeviceDetection` hook
- [x] Create `MobileOptimized` components
- [ ] Add to main layout for testing

### Phase 2: Critical Mobile UX (Improves mobile without changing desktop)
- [ ] **Tables → Cards** on mobile (AccessPoints, ServiceLevels)
- [ ] **Increase tap targets** (all buttons, 44px min on touch)
- [ ] **Responsive grids** (1 col mobile, multi-col desktop)
- [ ] **Modals → Sheets** on mobile (all dialogs)

### Phase 3: Performance (Mobile-specific)
- [ ] **Lazy load charts** on mobile
- [ ] **Reduce polling frequency** on mobile (60s instead of 30s)
- [ ] **Limit table rows** on mobile (20 instead of 100)
- [ ] **Compress images** for mobile

### Phase 4: Polish (Enhanced mobile experience)
- [ ] **Swipe gestures** for common actions
- [ ] **Bottom sheet navigation** on mobile
- [ ] **Simplified charts** on mobile
- [ ] **Pull-to-refresh** on mobile dashboards

---

## 📊 Example: Mobile-Optimized Dashboard

Here's a complete example of a mobile-optimized dashboard component:

```tsx
import { useState } from 'react';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';
import { MobileOnly, DesktopOnly } from '@/components/MobileOptimized';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export function DashboardMobileOptimized() {
  const { isMobile, isTouchDevice } = useDeviceDetection();
  const [data, setData] = useState([/* ... */]);

  const refreshData = () => {
    // Refresh logic
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header - responsive padding and text size */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">
          Dashboard
        </h1>
        <Button
          onClick={refreshData}
          size={isTouchDevice ? "default" : "sm"}
          className={isTouchDevice ? "min-h-[44px]" : ""}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Grid - 1 col mobile, 4 cols desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total APs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl md:text-3xl font-bold">1,234</div>
          </CardContent>
        </Card>
        {/* More cards... */}
      </div>

      {/* Data Display - Cards on mobile, Table on desktop */}
      <Card>
        <CardHeader>
          <CardTitle>Access Points</CardTitle>
        </CardHeader>
        <CardContent>
          <MobileOnly>
            {/* Mobile: Card layout with essential info */}
            <div className="space-y-3">
              {data.slice(0, 10).map((ap) => (
                <Card key={ap.id} className="p-4">
                  <div className="font-semibold text-base">{ap.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`h-2 w-2 rounded-full ${ap.online ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-sm">{ap.online ? 'Online' : 'Offline'}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    {ap.clientCount} clients
                  </div>
                </Card>
              ))}
            </div>
          </MobileOnly>

          <DesktopOnly>
            {/* Desktop: Full table with all columns */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Clients</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Firmware</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((ap) => (
                  <TableRow key={ap.id}>
                    <TableCell>{ap.name}</TableCell>
                    <TableCell>{ap.online ? 'Online' : 'Offline'}</TableCell>
                    <TableCell>{ap.clientCount}</TableCell>
                    <TableCell>{ap.model}</TableCell>
                    <TableCell>{ap.firmware}</TableCell>
                    <TableCell>
                      <Button size="sm">Configure</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DesktopOnly>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## 🎯 Best Practices

### DO ✅
- Use responsive CSS (Tailwind breakpoints) for most layouts
- Increase touch targets to 44×44px minimum on touch devices
- Simplify tables to cards on mobile
- Hide non-essential information on mobile
- Use sheets/drawers instead of modals on mobile
- Test on real mobile devices, not just browser DevTools

### DON'T ❌
- Don't drastically change functionality between mobile/desktop
- Don't remove critical features on mobile
- Don't assume mobile = low bandwidth (use feature detection instead)
- Don't rely only on viewport width (use touch detection too)
- Don't create separate mobile/desktop apps (keep it unified)

---

## 📱 Testing

### Browser DevTools
```bash
# Chrome DevTools
1. Open DevTools (F12)
2. Click device toolbar icon (Ctrl+Shift+M)
3. Test various devices (iPhone, iPad, Galaxy)
4. Test both portrait and landscape
```

### Real Device Testing
```bash
# For local testing on mobile device:
1. Connect to same WiFi network
2. Find your local IP: `ifconfig` or `ipconfig`
3. On mobile, visit: http://YOUR_IP:5173
4. Test touch interactions, scrolling, tap targets
```

---

## 🔧 Performance Monitoring

```tsx
// Add performance tracking for mobile
import { useDeviceDetection } from '@/hooks/useDeviceDetection';
import { useEffect } from 'react';

function usePerformanceMonitoring() {
  const { isMobile } = useDeviceDetection();

  useEffect(() => {
    if (isMobile && 'PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          console.log(`Mobile Performance - ${entry.name}:`, entry.duration);
        }
      });
      observer.observe({ entryTypes: ['measure', 'navigation'] });
      return () => observer.disconnect();
    }
  }, [isMobile]);
}
```

---

## 📚 Additional Resources

- [Tailwind Responsive Design](https://tailwindcss.com/docs/responsive-design)
- [React Hook Form - Mobile Validation](https://react-hook-form.com/)
- [Touch Events Best Practices](https://developers.google.com/web/fundamentals/design-and-ux/input/touch)
- [Mobile Web Performance](https://web.dev/fast/)

---

**Remember:** The goal is to enhance mobile experience without compromising desktop. Use progressive enhancement!
