import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
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

// Mock next-themes so we can spy on setTheme calls.
const setTheme = vi.fn();
let themeValue = 'dark';
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: themeValue, setTheme }),
}));

beforeEach(() => {
  setTheme.mockClear();
  themeValue = 'dark';
});

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
    render(<CommandPalette />);
    openPalette();
    expect(screen.getByText('Navigate')).toBeInTheDocument();
    expect(screen.getByText('Configure')).toBeInTheDocument();
    expect(screen.getByText('Visualize')).toBeInTheDocument();
    expect(screen.getByText('Operate')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('renders Dashboard / Access Points / Connected Clients in Navigate', () => {
    render(<CommandPalette />);
    openPalette();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Access Points')).toBeInTheDocument();
    expect(screen.getByText('Connected Clients')).toBeInTheDocument();
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
  it('fires onNavigate with the route page when a route is selected', () => {
    const onNavigate = vi.fn();
    render(<CommandPalette onNavigate={onNavigate} />);
    openPalette();
    fireEvent.click(screen.getByText('Dashboard'));
    expect(onNavigate).toHaveBeenCalledWith('dashboard');
  });

  it('closes after a route selection', () => {
    render(<CommandPalette onNavigate={() => {}} />);
    openPalette();
    fireEvent.click(screen.getByText('Dashboard'));
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
  it('switches from dark to light when theme=dark', () => {
    themeValue = 'dark';
    render(<CommandPalette />);
    openPalette();
    fireEvent.click(screen.getByText(/Switch to light theme/));
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  it('switches from light to dark when theme=light', () => {
    themeValue = 'light';
    render(<CommandPalette />);
    openPalette();
    fireEvent.click(screen.getByText(/Switch to dark theme/));
    expect(setTheme).toHaveBeenCalledWith('dark');
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
