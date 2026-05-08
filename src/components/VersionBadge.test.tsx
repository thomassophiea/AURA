import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { VersionBadge } from './VersionBadge';

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

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VersionBadge', () => {
  it('shows the short commit hash when present and non-"unknown"', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        version: '1.2.3',
        commit: 'abc1234',
        commitFull: 'abc1234deadbeef',
        buildDate: '2026-05-07T12:00:00Z',
        message: 'msg',
      }),
    }));
    render(<VersionBadge />);
    await waitFor(() => {
      expect(screen.getByText('abc1234')).toBeTruthy();
    });
  });

  it('falls back to the version string when commit is "unknown"', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        version: '1.2.3',
        commit: 'unknown',
        commitFull: '',
        buildDate: '',
        message: '',
      }),
    }));
    render(<VersionBadge />);
    await waitFor(() => {
      expect(screen.getByText('1.2.3')).toBeTruthy();
    });
  });

  it('falls back to "dev" when both commit and version are missing/unknown', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        version: 'unknown',
        commit: 'unknown',
        commitFull: '',
        buildDate: '',
        message: '',
      }),
    }));
    render(<VersionBadge />);
    await waitFor(() => {
      expect(screen.getByText('dev')).toBeTruthy();
    });
  });

  it('renders the network-error fallback when fetch throws', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    render(<VersionBadge />);
    await waitFor(() => {
      // network-error fallback uses version='dev'
      expect(screen.getByText('dev')).toBeTruthy();
    });
    expect(console.error).toHaveBeenCalled();
  });

  it('renders nothing while waiting for the first response', () => {
    // Never-resolving fetch so the component stays in its initial null state.
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    const { container } = render(<VersionBadge />);
    expect(container.firstChild).toBeNull();
  });
});
