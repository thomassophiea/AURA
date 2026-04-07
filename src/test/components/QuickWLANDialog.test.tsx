import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../services/api', () => ({
  apiService: { getSites: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../services/wlanAssignment', () => ({
  WLANAssignmentService: vi.fn().mockImplementation(() => ({
    createWLANUnassigned: vi.fn().mockResolvedValue({
      success: true,
      serviceId: 'svc-1',
      sitesProcessed: 0,
      profilesAssigned: 0,
      assignments: [],
    }),
    createWLANWithAutoAssignment: vi.fn().mockResolvedValue({
      success: true,
      serviceId: 'svc-1',
      sitesProcessed: 2,
      profilesAssigned: 4,
      assignments: [],
    }),
    createWLANWithSiteCentricDeployment: vi.fn().mockResolvedValue({
      success: true,
      serviceId: 'svc-1',
      sitesProcessed: 1,
      profilesAssigned: 2,
      assignments: [],
    }),
  })),
}));
vi.mock('../../contexts/AppContext', () => ({
  useAppContext: () => ({ siteGroups: [] }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { QuickWLANDialog } = await import('../../components/QuickWLANDialog');

function renderDialog(open = true) {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();
  render(<QuickWLANDialog open={open} onOpenChange={onOpenChange} onSuccess={onSuccess} />);
  return { onOpenChange, onSuccess };
}

describe('QuickWLANDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders when open is true', () => {
    renderDialog();
    expect(screen.getByText('Quick WLAN')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    renderDialog(false);
    expect(screen.queryByText('Quick WLAN')).not.toBeInTheDocument();
  });

  it('Create button is disabled when SSID is empty', () => {
    renderDialog();
    const btn = screen.getByRole('button', { name: /create wlan/i });
    expect(btn).toBeDisabled();
  });

  it('Create button is enabled after SSID and passphrase are filled', () => {
    renderDialog();
    fireEvent.change(screen.getByPlaceholderText(/network name/i), {
      target: { value: 'Corp-WiFi' },
    });
    fireEvent.change(screen.getByPlaceholderText(/passphrase/i), {
      target: { value: 'secret123' },
    });
    expect(screen.getByRole('button', { name: /create wlan/i })).not.toBeDisabled();
  });

  it('shows passphrase field by default (wpa2-psk)', () => {
    renderDialog();
    expect(screen.getByPlaceholderText(/passphrase/i)).toBeInTheDocument();
  });
});
