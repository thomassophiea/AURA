import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DriftPanel } from './DriftPanel';
import type { DriftAlert } from './DriftPanel';

const mockAlert: DriftAlert = {
  id: 'd1',
  type: 'ssid-mismatch',
  detail: 'SSID Corp-WiFi missing on AP abc123',
  detectedAt: '2026-05-22T10:00:00Z',
};

const baseProps = {
  alerts: [],
  loading: false,
  error: null,
  onRefresh: vi.fn(),
  onClear: vi.fn(),
};

describe('DriftPanel', () => {
  it('shows empty state when no alerts', () => {
    render(<DriftPanel {...baseProps} />);
    expect(screen.getByText(/no drift detected/i)).toBeDefined();
  });

  it('displays alerts when provided', () => {
    render(<DriftPanel {...baseProps} alerts={[mockAlert]} />);
    expect(screen.getByText(/ssid-mismatch/i)).toBeDefined();
    expect(screen.getByText(/Corp-WiFi missing/i)).toBeDefined();
  });

  it('shows loading state', () => {
    render(<DriftPanel {...baseProps} loading={true} />);
    expect(screen.getByText(/loading/i)).toBeDefined();
  });

  it('calls onClear when Clear button is clicked', () => {
    const onClear = vi.fn();
    render(<DriftPanel {...baseProps} alerts={[mockAlert]} onClear={onClear} />);
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('calls onRevalidate when Validate button is clicked', () => {
    const onRevalidate = vi.fn();
    render(<DriftPanel {...baseProps} alerts={[mockAlert]} onRevalidate={onRevalidate} />);
    fireEvent.click(screen.getByRole('button', { name: /validate/i }));
    expect(onRevalidate).toHaveBeenCalledOnce();
  });
});
