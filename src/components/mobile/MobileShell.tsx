/**
 * MobileShell - Root container for iPhone-first mobile experience
 * Handles safe areas, prevents horizontal scroll, and enforces mobile-only UI
 */

import React from 'react';

interface MobileShellProps {
  children: React.ReactNode;
}

export function MobileShell({ children }: MobileShellProps) {
  return (
    <div
      className="min-h-screen bg-background overflow-x-hidden"
      style={{
        // Top/side safe areas are applied at the shell level.
        // Bottom safe area is intentionally omitted here — the fixed
        // MobileBottomNav handles its own env(safe-area-inset-bottom) padding
        // so the shell does not add a redundant gap.
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {children}
    </div>
  );
}
