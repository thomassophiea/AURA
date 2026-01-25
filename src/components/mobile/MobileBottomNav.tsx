/**
 * MobileBottomNav - iPhone-style bottom tab navigation
 * Thumb-reachable navigation with icons and labels
 */

import React from 'react';
import { Home, Users, Wifi, AppWindow } from 'lucide-react';

export type MobileTab = 'home' | 'clients' | 'aps' | 'apps';

interface MobileBottomNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  badges?: {
    clients?: number;
    aps?: number;
    apps?: number;
  };
}

export function MobileBottomNav({ activeTab, onTabChange, badges }: MobileBottomNavProps) {
  const tabs = [
    { id: 'home' as MobileTab, icon: Home, label: 'Home' },
    { id: 'clients' as MobileTab, icon: Users, label: 'Clients', badge: badges?.clients },
    { id: 'aps' as MobileTab, icon: Wifi, label: 'APs', badge: badges?.aps },
    { id: 'apps' as MobileTab, icon: AppWindow, label: 'Apps', badge: badges?.apps },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50"
      style={{
        height: 'calc(56px + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="h-14 flex items-stretch">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                flex-1 flex flex-col items-center justify-center gap-0.5 relative
                min-h-[44px] transition-colors
                ${isActive ? 'text-primary' : 'text-muted-foreground'}
              `}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative">
                <Icon className={`h-5 w-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-medium ${isActive ? 'font-semibold' : ''}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
