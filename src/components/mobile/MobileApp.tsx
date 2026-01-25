/**
 * MobileApp - Main mobile application container
 * iPhone-first, badass wireless status monitoring
 */

import React, { useState, useEffect } from 'react';
import { MobileShell } from './MobileShell';
import { MobileHeader } from './MobileHeader';
import { MobileBottomNav, MobileTab } from './MobileBottomNav';
import { MobileHome } from './MobileHome';
import { MobileClientsList } from './MobileClientsList';
import { MobileAPsList } from './MobileAPsList';
import { MobileAppsList } from './MobileAppsList';
import { useHaptic } from '@/hooks/useHaptic';

interface MobileAppProps {
  theme: 'light' | 'dark' | 'system';
  onThemeToggle: () => void;
  onLogout: () => void;
  userEmail?: string;
  currentSite: string;
  onSiteChange: (siteId: string) => void;
}

export function MobileApp({
  theme,
  onThemeToggle,
  onLogout,
  userEmail,
  currentSite,
  onSiteChange,
}: MobileAppProps) {
  const haptic = useHaptic();
  const [activeTab, setActiveTab] = useState<MobileTab>('home');
  const [badges, setBadges] = useState<{ clients?: number; aps?: number; apps?: number }>({});

  const handleTabChange = (tab: MobileTab) => {
    haptic.light();
    setActiveTab(tab);
  };

  const handleNavigate = (tab: MobileTab) => {
    haptic.light();
    setActiveTab(tab);
  };

  // Get page title
  const getPageTitle = (): string => {
    switch (activeTab) {
      case 'home':
        return 'Wireless Status';
      case 'clients':
        return 'Clients';
      case 'aps':
        return 'Access Points';
      case 'apps':
        return 'Applications';
      default:
        return 'Wireless Status';
    }
  };

  // Render active page
  const renderPage = () => {
    switch (activeTab) {
      case 'home':
        return (
          <MobileHome
            currentSite={currentSite}
            onSiteChange={onSiteChange}
            onNavigate={handleNavigate}
          />
        );
      case 'clients':
        return <MobileClientsList currentSite={currentSite} />;
      case 'aps':
        return <MobileAPsList currentSite={currentSite} />;
      case 'apps':
        return <MobileAppsList currentSite={currentSite} />;
      default:
        return null;
    }
  };

  return (
    <MobileShell>
      <div className="flex flex-col h-screen">
        {/* Header */}
        <MobileHeader
          title={getPageTitle()}
          theme={theme}
          onThemeToggle={onThemeToggle}
          onLogout={onLogout}
          userEmail={userEmail}
        />

        {/* Page Content */}
        <div className="flex-1 overflow-hidden">
          {renderPage()}
        </div>

        {/* Bottom Navigation */}
        <MobileBottomNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          badges={badges}
        />
      </div>
    </MobileShell>
  );
}
