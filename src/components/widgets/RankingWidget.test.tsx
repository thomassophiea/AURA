import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RankingWidget } from './RankingWidget';

describe('RankingWidget', () => {
  it('renders the empty state when items is empty', () => {
    render(<RankingWidget title="Top APs" items={[]} />);
    expect(screen.getByText('Top APs')).toBeTruthy();
    expect(screen.getByText('No data available')).toBeTruthy();
  });

  it('renders each item with rank number, name, and value', () => {
    render(
      <RankingWidget
        title="Top APs"
        items={[
          { name: 'AP-1', value: 100 },
          { name: 'AP-2', value: 50 },
        ]}
      />
    );
    expect(screen.getByText('1.')).toBeTruthy();
    expect(screen.getByText('2.')).toBeTruthy();
    expect(screen.getByText('AP-1')).toBeTruthy();
    expect(screen.getByText('AP-2')).toBeTruthy();
  });

  it('truncates the list to maxItems and shows the truncation note', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      name: `AP-${i}`,
      value: 100 - i,
    }));
    render(<RankingWidget title="Top APs" items={items} maxItems={5} />);
    expect(screen.getByText(/Showing top 5 of 12 items/i)).toBeTruthy();
    expect(screen.queryByText('AP-5')).toBeNull();
  });

  it('does not show the truncation note when items.length ≤ maxItems', () => {
    const items = [{ name: 'A', value: 1 }];
    render(<RankingWidget title="X" items={items} maxItems={10} />);
    expect(screen.queryByText(/Showing top/)).toBeNull();
  });

  it('shows percentage when item.percentage is provided', () => {
    render(<RankingWidget title="X" items={[{ name: 'A', value: 1, percentage: 25.5 }]} />);
    expect(screen.getByText('25.5% of total')).toBeTruthy();
  });

  it('omits the bar when showBar=false', () => {
    const { container } = render(
      <RankingWidget title="X" items={[{ name: 'A', value: 1 }]} showBar={false} />
    );
    expect(container.querySelector('.bg-blue-500')).toBeNull();
  });

  it('uses different bar/icon colors for type="worst"', () => {
    const { container } = render(
      <RankingWidget title="X" items={[{ name: 'A', value: 1 }]} type="worst" />
    );
    expect(container.querySelector('.bg-orange-500')).toBeTruthy();
  });

  describe('formatValue (via rendered output)', () => {
    it.each([
      [{ name: 'A', value: 5.23e3 }, /5\.23 KB/],
      [{ name: 'A', value: 5.23e6 }, /5\.23 MB/],
      [{ name: 'A', value: 5.23e9 }, /5\.23 GB/],
      [{ name: 'A', value: 0.5 }, /0\.50/],
    ])('auto-formats unit-less large numbers (%s)', (item, expected) => {
      render(<RankingWidget title="X" items={[item]} />);
      expect(document.body.textContent).toMatch(expected);
    });

    it.each([
      [{ name: 'A', value: 1500 }, /1\.50 Kbps/, 'bps'],
      [{ name: 'A', value: 5.23e6 }, /5\.23 Mbps/, 'bps'],
      [{ name: 'A', value: 5.23e9 }, /5\.23 Gbps/, 'bps'],
      [{ name: 'A', value: 99.6 }, /99\.6%/, '%'],
      [{ name: 'A', value: 50 }, /50 ms/, 'ms'],
      [{ name: 'A', value: 1500 }, /1\.50 s/, 'ms'],
      [{ name: 'A', value: -65 }, /-65 dBm/, 'dBm'],
      [{ name: 'A', value: 25 }, /25 dB/, 'dB'],
      [{ name: 'A', value: 12 }, /^.*12.*$/, 'count'],
    ])('formats with unit %s', (item, expected, unit) => {
      render(<RankingWidget title="X" items={[item]} unit={unit} />);
      expect(document.body.textContent).toMatch(expected);
    });

    it('falls back to "value unit" for unrecognized units', () => {
      render(<RankingWidget title="X" items={[{ name: 'A', value: 12.4 }]} unit="widgets" />);
      expect(document.body.textContent).toMatch(/12\.40 widgets/);
    });

    it('treats unit values "undefined" / "null" strings as missing', () => {
      render(
        <RankingWidget
          title="X"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items={[{ name: 'A', value: 5e3 } as any]}
          unit="undefined"
        />
      );
      // Auto-format kicks in → "5.00 KB"
      expect(document.body.textContent).toMatch(/5\.00 KB/);
    });
  });
});
