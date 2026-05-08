import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock the hook so we can flip touch detection per test.
vi.mock('@/hooks/useDeviceDetection', () => ({
  useIsTouchDevice: vi.fn(() => false),
}));

import { useIsTouchDevice } from '@/hooks/useDeviceDetection';
import { TouchButton } from './TouchButton';

describe('TouchButton', () => {
  it('renders a Button with text content', () => {
    render(<TouchButton>Click</TouchButton>);
    expect(screen.getByText('Click')).toBeTruthy();
  });

  it('does NOT add the 44px-min sizing on non-touch devices', () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(false);
    const { container } = render(<TouchButton>x</TouchButton>);
    const btn = container.querySelector('[data-slot="button"]')!;
    expect(btn.className).not.toContain('min-h-[44px]');
  });

  it('adds the 44px-min sizing when isTouchDevice is true', () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(true);
    const { container } = render(<TouchButton>x</TouchButton>);
    const btn = container.querySelector('[data-slot="button"]')!;
    expect(btn.className).toContain('min-h-[44px]');
    expect(btn.className).toContain('min-w-[44px]');
  });

  it('forceTouchSize forces the touch sizing even on non-touch', () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(false);
    const { container } = render(<TouchButton forceTouchSize>x</TouchButton>);
    const btn = container.querySelector('[data-slot="button"]')!;
    expect(btn.className).toContain('min-h-[44px]');
  });

  it('upgrades size="sm" to "default" on touch devices', () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(true);
    const { container } = render(<TouchButton size="sm">x</TouchButton>);
    const btn = container.querySelector('[data-slot="button"]')!;
    // default size includes h-9
    expect(btn.className).toContain('h-9');
    // and never the sm h-8
    expect(btn.className).not.toContain('h-8');
  });

  it('upgrades size="icon" to "default" on touch devices', () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(true);
    const { container } = render(<TouchButton size="icon">x</TouchButton>);
    const btn = container.querySelector('[data-slot="button"]')!;
    expect(btn.className).toContain('h-9');
    expect(btn.className).not.toContain('size-9');
  });

  it('keeps size="lg" untouched on touch devices', () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(true);
    const { container } = render(<TouchButton size="lg">x</TouchButton>);
    const btn = container.querySelector('[data-slot="button"]')!;
    expect(btn.className).toContain('h-10');
  });

  it('forwards a custom className alongside the touch-min sizing', () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(true);
    const { container } = render(<TouchButton className="my-touch">x</TouchButton>);
    const btn = container.querySelector('[data-slot="button"]')!;
    expect(btn.className).toContain('my-touch');
    expect(btn.className).toContain('min-h-[44px]');
  });

  it('forwards onClick', () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(false);
    const onClick = vi.fn();
    render(<TouchButton onClick={onClick}>Press</TouchButton>);
    fireEvent.click(screen.getByText('Press'));
    expect(onClick).toHaveBeenCalled();
  });
});
