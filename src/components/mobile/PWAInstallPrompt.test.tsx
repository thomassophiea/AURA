import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PWAInstallPrompt } from './PWAInstallPrompt';

describe('PWAInstallPrompt', () => {
  it('renders the headline + secondary copy', () => {
    render(<PWAInstallPrompt onInstall={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText('Install AURA for quick access')).toBeTruthy();
    expect(
      screen.getByText('Add to your home screen for faster loading and offline access')
    ).toBeTruthy();
  });

  it('renders Install + Maybe Later buttons', () => {
    render(<PWAInstallPrompt onInstall={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText('Install')).toBeTruthy();
    expect(screen.getByText('Maybe Later')).toBeTruthy();
  });

  it('clicking Install fires onInstall', () => {
    const onInstall = vi.fn();
    render(<PWAInstallPrompt onInstall={onInstall} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByText('Install'));
    expect(onInstall).toHaveBeenCalled();
  });

  it('clicking Maybe Later fires onDismiss', () => {
    const onDismiss = vi.fn();
    render(<PWAInstallPrompt onInstall={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText('Maybe Later'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('clicking the X close button fires onDismiss', () => {
    const onDismiss = vi.fn();
    render(<PWAInstallPrompt onInstall={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('renders the app icon SVG', () => {
    const { container } = render(<PWAInstallPrompt onInstall={vi.fn()} onDismiss={vi.fn()} />);
    // Three <path> elements in the icon
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(3);
  });
});
