import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmptyCell, MonoCell, TimestampCell, TruncatedCell, NumericCell } from './cells';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('EmptyCell', () => {
  it('renders the em dash with an accessible label', () => {
    render(<EmptyCell />);
    expect(screen.getByLabelText('No data')).toHaveTextContent('—');
  });
});

describe('MonoCell', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders the empty glyph for missing values', () => {
    render(<MonoCell value={null} />);
    expect(screen.getByLabelText('No data')).toBeInTheDocument();
  });

  it('renders the value in mono with a recovery title', () => {
    render(<MonoCell value="AA:BB:CC:DD:EE:FF" label="MAC address" />);
    const el = screen.getByTitle('AA:BB:CC:DD:EE:FF');
    expect(el).toHaveTextContent('AA:BB:CC:DD:EE:FF');
    expect(el.className).toContain('font-mono');
  });

  it('copies to clipboard without triggering row click', async () => {
    const rowClick = vi.fn();
    render(
      <div onClick={rowClick}>
        <MonoCell value="192.168.1.10" label="IP address" />
      </div>
    );
    fireEvent.click(screen.getByLabelText('Copy ip address'));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('192.168.1.10')
    );
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('hides the copy button when copyable is false', () => {
    render(<MonoCell value="SN12345" copyable={false} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('TimestampCell', () => {
  it('renders empty glyph for null and invalid dates', () => {
    const { rerender } = render(<TimestampCell value={null} />);
    expect(screen.getByLabelText('No data')).toBeInTheDocument();
    rerender(<TimestampCell value="not-a-date" />);
    expect(screen.getByLabelText('No data')).toBeInTheDocument();
  });

  it('renders relative time with absolute tooltip', () => {
    // RelativeTime shares a 1Hz tick whose snapshot can lag test time by a
    // few seconds, so assert the shape, not the exact minute count.
    const twoMinAgo = Date.now() - 120_000;
    render(<TimestampCell value={twoMinAgo} />);
    const el = screen.getByText(/^\d+m ago$/);
    expect(el).toHaveAttribute('title', new Date(twoMinAgo).toLocaleString());
  });

  it('renders absolute mode', () => {
    render(<TimestampCell value="2026-03-04T14:05:00" mode="absolute" />);
    expect(screen.getByTitle(new Date('2026-03-04T14:05:00').toLocaleString())).toBeInTheDocument();
  });
});

describe('TruncatedCell', () => {
  it('truncates with title recovery by default', () => {
    render(<TruncatedCell value="a-very-long-client-hostname.corp.example.com" />);
    const el = screen.getByTitle('a-very-long-client-hostname.corp.example.com');
    expect(el.className).toContain('truncate');
    expect(el.className).toContain('block');
  });

  it('renders empty glyph for missing values', () => {
    render(<TruncatedCell value="" />);
    expect(screen.getByLabelText('No data')).toBeInTheDocument();
  });
});

describe('NumericCell', () => {
  it('right-aligns with tabular numerals and a muted unit', () => {
    render(<NumericCell value={-64} unit="dBm" />);
    const el = screen.getByText('-64');
    expect(el.className).toContain('text-right');
    expect(el.className).toContain('tabular-nums');
    expect(screen.getByText('dBm')).toBeInTheDocument();
  });

  it('renders empty glyph for null', () => {
    render(<NumericCell value={null} />);
    expect(screen.getByLabelText('No data')).toBeInTheDocument();
  });
});
