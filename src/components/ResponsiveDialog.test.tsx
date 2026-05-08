import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useDeviceDetection', () => ({
  useIsMobile: vi.fn(() => false),
}));

import { useIsMobile } from '@/hooks/useDeviceDetection';
import { ResponsiveDialog } from './ResponsiveDialog';

// Radix Dialog/Sheet rely on these jsdom-missing APIs.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
});

describe('ResponsiveDialog', () => {
  it('renders nothing visible when open=false', () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    render(
      <ResponsiveDialog open={false} onOpenChange={vi.fn()} title="X">
        <span>Body</span>
      </ResponsiveDialog>
    );
    // Closed Radix dialog leaves no portal content
    expect(screen.queryByText('Body')).toBeNull();
  });

  it('renders Dialog (not Sheet) on desktop with title + description', () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    render(
      <ResponsiveDialog open onOpenChange={vi.fn()} title="My title" description="my desc">
        <span>Body</span>
      </ResponsiveDialog>
    );
    expect(screen.getByText('My title')).toBeTruthy();
    expect(screen.getByText('my desc')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('renders Sheet on mobile', () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    render(
      <ResponsiveDialog open onOpenChange={vi.fn()} title="Mobile title">
        <span>Body</span>
      </ResponsiveDialog>
    );
    expect(screen.getByText('Mobile title')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('omits header when neither title nor description supplied', () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    render(
      <ResponsiveDialog open onOpenChange={vi.fn()}>
        <span data-testid="body">Body</span>
      </ResponsiveDialog>
    );
    expect(screen.queryByText(/title/i)).toBeNull();
    expect(screen.getByTestId('body')).toBeTruthy();
  });

  it('forwards a custom className onto the dialog content', () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    const { container } = render(
      <ResponsiveDialog open onOpenChange={vi.fn()} title="X" className="my-dialog-class">
        <span>Body</span>
      </ResponsiveDialog>
    );
    expect(container.ownerDocument.body.querySelector('.my-dialog-class')).toBeTruthy();
  });

  it.each([
    ['sm', 'max-w-sm'],
    ['md', 'max-w-md'],
    ['lg', 'max-w-lg'],
    ['xl', 'max-w-xl'],
    ['2xl', 'max-w-2xl'],
    ['full', 'max-w-full'],
  ] as const)('maxWidth="%s" applies "%s"', (maxWidth, expected) => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    const { container } = render(
      <ResponsiveDialog open onOpenChange={vi.fn()} title="X" maxWidth={maxWidth}>
        <span>Body</span>
      </ResponsiveDialog>
    );
    expect(container.ownerDocument.body.querySelector(`.${expected}`)).toBeTruthy();
  });
});
