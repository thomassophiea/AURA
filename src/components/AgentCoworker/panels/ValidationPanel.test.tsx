import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ValidationPanel } from './ValidationPanel';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

describe('ValidationPanel', () => {
  it('renders the form fields', () => {
    render(<ValidationPanel />);
    expect(screen.getByLabelText(/SSID Name/i)).toBeDefined();
    expect(screen.getByLabelText(/VLAN ID/i)).toBeDefined();
    expect(screen.getByLabelText(/Security/i)).toBeDefined();
    expect(screen.getByLabelText(/Site/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Validate/i })).toBeDefined();
  });

  it('shows confidence band on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        confidence: 85,
        band: 'HIGH',
        checks: [{ name: 'VLAN exists', passed: true, detail: 'VLAN 10 found' }],
        recommendation: 'Ready to provision.',
        provisioningToken: 'tok_abc',
        expiresAt: '2026-05-22T12:00:00Z',
      }),
    });

    render(<ValidationPanel />);
    fireEvent.change(screen.getByLabelText(/SSID Name/i), { target: { value: 'Corp-WiFi' } });
    fireEvent.change(screen.getByLabelText(/VLAN ID/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /Validate/i }));

    await waitFor(() => {
      expect(screen.getByText('HIGH')).toBeDefined();
      expect(screen.getByText(/Ready to provision/i)).toBeDefined();
    });
  });

  it('shows error message on failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });

    render(<ValidationPanel />);
    fireEvent.change(screen.getByLabelText(/SSID Name/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /Validate/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed/i)).toBeDefined();
    });
  });
});
