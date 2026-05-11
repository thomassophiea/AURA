import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Hooks ---------------------------------------------------------------
const hapticMock = vi.hoisted(() => ({
  light: vi.fn(),
  medium: vi.fn(),
  heavy: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
const pwaMock = vi.hoisted(() => ({
  current: {
    isInstallable: false,
    isInstalled: false,
    showPrompt: false,
    promptToInstall: vi.fn(),
    dismissPrompt: vi.fn(),
  },
}));
vi.mock('@/hooks/useHaptic', () => ({ useHaptic: () => hapticMock }));
vi.mock('@/hooks/usePWAInstall', () => ({ usePWAInstall: () => pwaMock.current }));

// Children — render simple identifiable stubs.
vi.mock('./MobileShell', () => ({
  MobileShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ),
}));
vi.mock('./MobileHeader', () => ({
  MobileHeader: ({ title }: { title: string }) => <header data-testid="header">{title}</header>,
}));
vi.mock('./MobileBottomNav', () => ({
  MobileBottomNav: ({
    activeTab,
    onTabChange,
  }: {
    activeTab: string;
    onTabChange: (t: string) => void;
  }) => (
    <nav data-testid="bottom-nav" data-active={activeTab}>
      <button onClick={() => onTabChange('sle')}>go-sle</button>
      <button onClick={() => onTabChange('networks')}>go-networks</button>
      <button onClick={() => onTabChange('clients')}>go-clients</button>
      <button onClick={() => onTabChange('aps')}>go-aps</button>
    </nav>
  ),
}));
vi.mock('./MobileHome', () => ({
  MobileHome: () => <div data-testid="page-home">Home</div>,
}));
vi.mock('./MobileSLEView', () => ({
  MobileSLEView: () => <div data-testid="page-sle">SLE</div>,
}));
vi.mock('./MobileNetworksList', () => ({
  MobileNetworksList: () => <div data-testid="page-networks">Networks</div>,
}));
vi.mock('./MobileClientsList', () => ({
  MobileClientsList: () => <div data-testid="page-clients">Clients</div>,
}));
vi.mock('./MobileAPsList', () => ({
  MobileAPsList: () => <div data-testid="page-aps">APs</div>,
}));
vi.mock('./PWAInstallPrompt', () => ({
  PWAInstallPrompt: () => <div data-testid="pwa-prompt">PWA</div>,
}));

import { MobileApp } from './MobileApp';

const baseProps = {
  theme: 'dark',
  onThemeToggle: vi.fn(),
  onLogout: vi.fn(),
  currentSite: 'site-1',
  onSiteChange: vi.fn(),
};

beforeEach(() => {
  pwaMock.current = {
    isInstallable: false,
    isInstalled: false,
    showPrompt: false,
    promptToInstall: vi.fn(),
    dismissPrompt: vi.fn(),
  };
  hapticMock.light.mockClear();
});

describe('MobileApp', () => {
  it('renders shell + header + bottom nav', () => {
    render(<MobileApp {...baseProps} />);
    expect(screen.getByTestId('shell')).toBeTruthy();
    expect(screen.getByTestId('header')).toBeTruthy();
    expect(screen.getByTestId('bottom-nav')).toBeTruthy();
  });

  it('defaults to Home tab + "Wireless Status" title', () => {
    render(<MobileApp {...baseProps} />);
    expect(screen.getByTestId('page-home')).toBeTruthy();
    expect(screen.getByTestId('header').textContent).toBe('Wireless Status');
  });

  it.each([
    ['sle', 'Service Levels', 'page-sle'],
    ['networks', 'Networks', 'page-networks'],
    ['clients', 'Clients', 'page-clients'],
    ['aps', 'Access Points', 'page-aps'],
  ] as const)('switches to %s tab', (tab, title, pageId) => {
    render(<MobileApp {...baseProps} />);
    fireEvent.click(screen.getByText(`go-${tab}`));
    expect(screen.getByTestId(pageId)).toBeTruthy();
    expect(screen.getByTestId('header').textContent).toBe(title);
  });

  it('fires haptic.light() on tab change', () => {
    render(<MobileApp {...baseProps} />);
    fireEvent.click(screen.getByText('go-sle'));
    expect(hapticMock.light).toHaveBeenCalled();
  });

  it('does NOT render the PWA prompt when showPrompt=false', () => {
    pwaMock.current.showPrompt = false;
    render(<MobileApp {...baseProps} />);
    expect(screen.queryByTestId('pwa-prompt')).toBeNull();
  });

  it('renders the PWA prompt when showPrompt=true', () => {
    pwaMock.current.showPrompt = true;
    render(<MobileApp {...baseProps} />);
    expect(screen.getByTestId('pwa-prompt')).toBeTruthy();
  });
});
