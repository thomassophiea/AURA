import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// jsdom doesn't ship ResizeObserver; cmdk uses it. Stub before the
// component module imports cmdk transitively.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  }
  // Radix Dialog uses pointer capture APIs that aren't on the jsdom Element
  // prototype.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

import { CommandPalette } from './CommandPalette';
import { ALL_CONFIGURE_FEATURES } from '@/config/featureRegistry';

afterEach(() => {
  // Close any open palette to avoid bleed-over.
  fireEvent.keyDown(window, { key: 'Escape' });
});

const openPalette = () => {
  fireEvent.keyDown(window, { key: 'P', metaKey: true, shiftKey: true });
};

describe('CommandPalette — open/close behaviour', () => {
  it('opens on ⌘⇧P', () => {
    render(<CommandPalette />);
    expect(screen.queryByPlaceholderText(/Type a command/)).not.toBeInTheDocument();
    openPalette();
    expect(screen.getByPlaceholderText(/Type a command/)).toBeInTheDocument();
  });

  it('opens on ctrl+shift+P (cross-platform)', () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true });
    expect(screen.getByPlaceholderText(/Type a command/)).toBeInTheDocument();
  });

  it('toggles closed when the shortcut fires while open', () => {
    render(<CommandPalette />);
    openPalette();
    expect(screen.getByPlaceholderText(/Type a command/)).toBeInTheDocument();
    openPalette();
    expect(screen.queryByPlaceholderText(/Type a command/)).not.toBeInTheDocument();
  });

  it('does not open on plain ⌘P (must include shift)', () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: 'P', metaKey: true });
    expect(screen.queryByPlaceholderText(/Type a command/)).not.toBeInTheDocument();
  });

  it('does not open on ⌘⇧K (must be P)', () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: 'K', metaKey: true, shiftKey: true });
    expect(screen.queryByPlaceholderText(/Type a command/)).not.toBeInTheDocument();
  });
});

describe('CommandPalette — items', () => {
  it('lists every group heading when open', () => {
    render(<CommandPalette onToggleTheme={() => {}} />);
    openPalette();
    expect(screen.getByText('Navigate')).toBeInTheDocument();
    expect(screen.getByText('Configure')).toBeInTheDocument();
    expect(screen.getByText('Operate')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('renders Network Overview / Access Points / Clients in Navigate', () => {
    render(<CommandPalette />);
    openPalette();
    expect(screen.getByText('Network Overview')).toBeInTheDocument();
    // "Access Points" exists in both Navigate (monitoring) and Configure —
    // deliberate multiple entry points onto different pages.
    expect(screen.getAllByText('Access Points').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Clients')).toBeInTheDocument();
  });

  it('lists every registry Configure feature', () => {
    render(<CommandPalette />);
    openPalette();
    for (const feature of ALL_CONFIGURE_FEATURES) {
      expect(
        screen.getAllByText(feature.label).length,
        `${feature.label} missing from palette`
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('finds Private Credentials by its protocol aliases', () => {
    render(<CommandPalette onNavigate={() => {}} />);
    openPalette();
    fireEvent.change(screen.getByPlaceholderText(/Type a command/), {
      target: { value: 'wpa3' },
    });
    expect(screen.getByText('Private Credentials')).toBeInTheDocument();
  });

  it('shows the keyboard cheatsheet footer', () => {
    render(<CommandPalette />);
    openPalette();
    expect(screen.getByText(/↑↓ navigate/)).toBeInTheDocument();
    expect(screen.getByText(/↵ select/)).toBeInTheDocument();
    expect(screen.getByText(/esc close/)).toBeInTheDocument();
    expect(screen.getByText('⌘⇧P')).toBeInTheDocument();
  });
});

describe('CommandPalette — selection', () => {
  it('fires onNavigate with the real view id when a route is selected', () => {
    const onNavigate = vi.fn();
    render(<CommandPalette onNavigate={onNavigate} />);
    openPalette();
    fireEvent.click(screen.getByText('Network Overview'));
    expect(onNavigate).toHaveBeenCalledWith('insights');
  });

  it('fires onNavigate with the unified Private Credentials view id', () => {
    const onNavigate = vi.fn();
    render(<CommandPalette onNavigate={onNavigate} />);
    openPalette();
    fireEvent.click(screen.getByText('Private Credentials'));
    expect(onNavigate).toHaveBeenCalledWith('configure-private-credentials');
  });

  it('closes after a route selection', () => {
    render(<CommandPalette onNavigate={() => {}} />);
    openPalette();
    fireEvent.click(screen.getByText('Network Overview'));
    expect(screen.queryByPlaceholderText(/Type a command/)).not.toBeInTheDocument();
  });

  it('Refresh dashboard fires onRefresh callback', () => {
    const onRefresh = vi.fn();
    render(<CommandPalette onRefresh={onRefresh} />);
    openPalette();
    fireEvent.click(screen.getByText('Refresh dashboard'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('CommandPalette — theme toggle', () => {
  it('fires onToggleTheme when provided', () => {
    const onToggleTheme = vi.fn();
    render(<CommandPalette onToggleTheme={onToggleTheme} />);
    openPalette();
    fireEvent.click(screen.getByText('Toggle theme'));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('omits the theme item when no handler is wired', () => {
    render(<CommandPalette />);
    openPalette();
    expect(screen.queryByText('Toggle theme')).not.toBeInTheDocument();
  });
});

describe('CommandPalette — keyboard listener cleanup', () => {
  it('removes its keydown listener on unmount', () => {
    const { unmount } = render(<CommandPalette />);
    unmount();
    // After unmount, the shortcut should not open anything (component is gone),
    // and shouldn't throw. This is a smoke test for cleanup.
    act(() => {
      fireEvent.keyDown(window, { key: 'P', metaKey: true, shiftKey: true });
    });
    expect(screen.queryByPlaceholderText(/Type a command/)).not.toBeInTheDocument();
  });
});
