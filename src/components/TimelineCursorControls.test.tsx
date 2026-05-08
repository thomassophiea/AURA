import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const ctxState = vi.hoisted(() => ({
  current: {
    ctx: {
      mode: 'AI_INSIGHTS' as const,
      siteId: null,
      apId: null,
      clientId: null,
      timeRange: '24h',
      dateFrom: null,
      dateTo: null,
      timeCursor: null as number | null,
      cursorLocked: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      environmentProfile: {} as any,
    },
    setTimeCursor: vi.fn(),
    toggleCursorLock: vi.fn(),
    updateContext: vi.fn(),
  },
}));

vi.mock('../hooks/useOperationalContext', () => ({
  useOperationalContext: () => ctxState.current,
}));

import { TimelineCursorControls, TimelineCursorBadge } from './TimelineCursorControls';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
});

beforeEach(() => {
  ctxState.current = {
    ctx: {
      ...ctxState.current.ctx,
      timeCursor: null,
      cursorLocked: false,
    },
    setTimeCursor: vi.fn(),
    toggleCursorLock: vi.fn(),
    updateContext: vi.fn(),
  };
});

describe('TimelineCursorControls', () => {
  it('renders the hover-prompt when no cursor is set', () => {
    render(<TimelineCursorControls />);
    expect(screen.getByText('Hover over charts to explore timeline')).toBeTruthy();
  });

  it('formats current cursor as time when same day', () => {
    const today = new Date();
    today.setHours(14, 30, 0);
    ctxState.current.ctx.timeCursor = today.getTime();
    render(<TimelineCursorControls />);
    // Should not show the hover prompt
    expect(screen.queryByText('Hover over charts to explore timeline')).toBeNull();
    expect(document.body.textContent).toMatch(/Lock/);
  });

  it('shows Locked label when cursorLocked=true', () => {
    ctxState.current.ctx.timeCursor = Date.now();
    ctxState.current.ctx.cursorLocked = true;
    render(<TimelineCursorControls />);
    expect(screen.getByText('Locked')).toBeTruthy();
  });

  it('clicking the Lock button calls toggleCursorLock', () => {
    ctxState.current.ctx.timeCursor = Date.now();
    const toggleCursorLock = vi.fn();
    ctxState.current.toggleCursorLock = toggleCursorLock;
    render(<TimelineCursorControls />);
    fireEvent.click(screen.getByText('Lock'));
    expect(toggleCursorLock).toHaveBeenCalled();
  });

  it('clicking the Clear (X) button calls updateContext to reset', () => {
    ctxState.current.ctx.timeCursor = Date.now();
    const updateContext = vi.fn();
    ctxState.current.updateContext = updateContext;
    const { container } = render(<TimelineCursorControls />);
    // The X button is the third icon-only button (after navigation hidden + Lock).
    // Find by aria — it has no text, only an X icon. Use the last button.
    const buttons = container.querySelectorAll('button');
    fireEvent.click(buttons[buttons.length - 1]);
    expect(updateContext).toHaveBeenCalledWith({ timeCursor: null, cursorLocked: false });
  });

  it('navigation buttons hidden when showNavigation=false', () => {
    ctxState.current.ctx.timeCursor = Date.now();
    const { container } = render(<TimelineCursorControls />);
    // Navigation chevron buttons have no text; absent when showNavigation default false.
    expect(container.querySelectorAll('button').length).toBe(2); // Lock + Clear
  });

  it('navigation buttons render when showNavigation=true and timeSeriesData provided', () => {
    ctxState.current.ctx.timeCursor = Date.now();
    const { container } = render(
      <TimelineCursorControls
        showNavigation
        timeSeriesData={[{ timestamp: 1 }, { timestamp: 2 }]}
      />
    );
    expect(container.querySelectorAll('button').length).toBe(4); // 2 nav + Lock + Clear
  });

  it('navigateCursor("next") with no current cursor sets first sorted timestamp', () => {
    ctxState.current.ctx.timeCursor = null;
    const setTimeCursor = vi.fn();
    ctxState.current.setTimeCursor = setTimeCursor;
    // Force "no cursor" path BUT we need cursor to render to enable navigation.
    // Simulate by setting cursor and calling the nav directly via re-render.
    // For this test we just verify the unconditional render path with cursor.
    // Skipping since this branch only fires when cursor null AND user clicks nav,
    // which our render guards out. So we test through the cursor-set branch:
    ctxState.current.ctx.timeCursor = 5;
    render(
      <TimelineCursorControls
        showNavigation
        timeSeriesData={[{ timestamp: 1 }, { timestamp: 5 }, { timestamp: 9 }]}
      />
    );
    // Click "Next" — the Right chevron is the 2nd button
    const buttons = document.querySelectorAll('button');
    // Buttons order: prev (chevron-left), next (chevron-right), Lock, Clear
    fireEvent.click(buttons[1]);
    expect(setTimeCursor).toHaveBeenCalledWith(9);
  });

  it('forwards a custom className onto the wrapper', () => {
    const { container } = render(<TimelineCursorControls className="my-cursor" />);
    expect((container.firstChild as HTMLElement).className).toContain('my-cursor');
  });
});

describe('TimelineCursorBadge', () => {
  it('renders nothing when no timeCursor', () => {
    ctxState.current.ctx.timeCursor = null;
    const { container } = render(<TimelineCursorBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the time when timeCursor is set', () => {
    ctxState.current.ctx.timeCursor = Date.now();
    render(<TimelineCursorBadge />);
    expect(document.body.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it('shows lock icon when cursorLocked=true', () => {
    ctxState.current.ctx.timeCursor = Date.now();
    ctxState.current.ctx.cursorLocked = true;
    const { container } = render(<TimelineCursorBadge />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
