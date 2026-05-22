import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DriftPanel } from './DriftPanel';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

describe('DriftPanel', () => {
  it('fetches and displays alerts on mount', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        alerts: [
          {
            id: 'd1',
            type: 'ssid-mismatch',
            detail: 'SSID Corp-WiFi missing on AP abc123',
            detectedAt: '2026-05-22T10:00:00Z',
          },
        ],
      }),
    });

    render(<DriftPanel />);

    await waitFor(() => {
      expect(screen.getByText(/ssid-mismatch/i)).toBeDefined();
      expect(screen.getByText(/Corp-WiFi missing/i)).toBeDefined();
    });
  });

  it('shows empty state when no alerts', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ alerts: [] }),
    });

    render(<DriftPanel />);

    await waitFor(() => {
      expect(screen.getByText(/no drift detected/i)).toBeDefined();
    });
  });

  it('clears alerts on DELETE button click', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          alerts: [
            { id: 'd1', type: 'ssid-mismatch', detail: 'x', detectedAt: '2026-05-22T10:00:00Z' },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cleared: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ alerts: [] }) });

    render(<DriftPanel />);

    await waitFor(() => expect(screen.getByText(/ssid-mismatch/i)).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    await waitFor(() => {
      expect(screen.getByText(/no drift detected/i)).toBeDefined();
    });
  });
});
