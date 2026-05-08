import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useDeviceDetection', () => ({
  useDeviceDetection: vi.fn(() => ({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isTouchDevice: false,
    screenSize: 'lg',
    orientation: 'landscape',
  })),
}));

import { useDeviceDetection } from '@/hooks/useDeviceDetection';
import {
  MobileOptimized,
  MobileOnly,
  DesktopOnly,
  TouchOnly,
  withMobileOptimization,
} from './MobileOptimized';

const setDevice = (overrides: Partial<ReturnType<typeof useDeviceDetection>>) => {
  vi.mocked(useDeviceDetection).mockReturnValue({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isTouchDevice: false,
    screenSize: 'lg',
    orientation: 'landscape',
    ...overrides,
  });
};

describe('MobileOptimized', () => {
  it('renders default children when isMobile=false', () => {
    setDevice({ isMobile: false });
    render(
      <MobileOptimized mobileChildren={<span>MOBILE</span>}>
        <span>DESKTOP</span>
      </MobileOptimized>
    );
    expect(screen.getByText('DESKTOP')).toBeTruthy();
    expect(screen.queryByText('MOBILE')).toBeNull();
  });

  it('renders mobileChildren on mobile when provided', () => {
    setDevice({ isMobile: true });
    render(
      <MobileOptimized mobileChildren={<span>MOBILE</span>}>
        <span>DESKTOP</span>
      </MobileOptimized>
    );
    expect(screen.getByText('MOBILE')).toBeTruthy();
    expect(screen.queryByText('DESKTOP')).toBeNull();
  });

  it('falls back to default children on mobile when mobileChildren is omitted', () => {
    setDevice({ isMobile: true });
    render(
      <MobileOptimized>
        <span>DESKTOP</span>
      </MobileOptimized>
    );
    expect(screen.getByText('DESKTOP')).toBeTruthy();
  });

  it('forwards className onto the wrapper div', () => {
    setDevice({ isMobile: false });
    const { container } = render(
      <MobileOptimized className="my-wrap">
        <span>X</span>
      </MobileOptimized>
    );
    expect((container.firstChild as HTMLElement).className).toBe('my-wrap');
  });
});

describe('MobileOnly / DesktopOnly / TouchOnly', () => {
  it('MobileOnly renders only when isMobile=true', () => {
    setDevice({ isMobile: false });
    const r1 = render(<MobileOnly>x</MobileOnly>);
    expect(r1.container.textContent).toBe('');
    setDevice({ isMobile: true });
    const r2 = render(<MobileOnly>x</MobileOnly>);
    expect(r2.container.textContent).toBe('x');
  });

  it('DesktopOnly renders only when isMobile=false', () => {
    setDevice({ isMobile: false });
    const r1 = render(<DesktopOnly>d</DesktopOnly>);
    expect(r1.container.textContent).toBe('d');
    setDevice({ isMobile: true });
    const r2 = render(<DesktopOnly>d</DesktopOnly>);
    expect(r2.container.textContent).toBe('');
  });

  it('TouchOnly renders only when isTouchDevice=true', () => {
    setDevice({ isTouchDevice: false });
    const r1 = render(<TouchOnly>t</TouchOnly>);
    expect(r1.container.textContent).toBe('');
    setDevice({ isTouchDevice: true });
    const r2 = render(<TouchOnly>t</TouchOnly>);
    expect(r2.container.textContent).toBe('t');
  });
});

describe('withMobileOptimization', () => {
  function Desktop({ label }: { label: string }) {
    return <div data-testid="desktop">{label}</div>;
  }
  function Mobile({ label }: { label: string }) {
    return <div data-testid="mobile">{label}</div>;
  }

  it('renders the desktop component when isMobile=false', () => {
    setDevice({ isMobile: false });
    const Wrapped = withMobileOptimization(Desktop, Mobile);
    render(<Wrapped label="hi" />);
    expect(screen.getByTestId('desktop').textContent).toBe('hi');
  });

  it('renders the mobile component when isMobile=true and Mobile is provided', () => {
    setDevice({ isMobile: true });
    const Wrapped = withMobileOptimization(Desktop, Mobile);
    render(<Wrapped label="hi" />);
    expect(screen.getByTestId('mobile').textContent).toBe('hi');
  });

  it('renders the desktop component on mobile when no mobile variant is provided', () => {
    setDevice({ isMobile: true });
    const Wrapped = withMobileOptimization(Desktop);
    render(<Wrapped label="hi" />);
    expect(screen.getByTestId('desktop').textContent).toBe('hi');
  });
});
