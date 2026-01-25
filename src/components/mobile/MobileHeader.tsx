/**
 * MobileHeader - Clean header that clears notch/Dynamic Island
 * Title-focused with minimal clutter
 */

import React from 'react';
import { UserMenu } from '../UserMenu';

interface MobileHeaderProps {
  title: string;
  theme: 'light' | 'dark' | 'system';
  onThemeToggle: () => void;
  onLogout: () => void;
  userEmail?: string;
}

export function MobileHeader({ title, theme, onThemeToggle, onLogout, userEmail }: MobileHeaderProps) {
  return (
    <header
      className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 12px)',
      }}
    >
      <div className="h-14 px-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground truncate flex-1">
          {title}
        </h1>
        <UserMenu
          onLogout={onLogout}
          theme={theme}
          onThemeToggle={onThemeToggle}
          userEmail={userEmail}
        />
      </div>
    </header>
  );
}
