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
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {children}
    </div>
  );
}
