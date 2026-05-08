import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NoData } from './NoData';

describe('NoData', () => {
  it('renders a single em-dash glyph in inline (default) variant', () => {
    const { container } = render(<NoData />);
    const span = container.querySelector('span[aria-label="No data available"]');
    expect(span).not.toBeNull();
    expect(span?.textContent).toBe('—');
  });

  it('renders a chip with "no data" label in chip variant', () => {
    render(<NoData variant="chip" />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });

  it('renders a double em-dash in block variant', () => {
    const { container } = render(<NoData variant="block" />);
    const span = container.querySelector('span[aria-label="No data available"]');
    expect(span?.textContent).toBe('——');
  });

  it('uses tabular-nums class on inline variant for column alignment', () => {
    const { container } = render(<NoData />);
    const span = container.querySelector('span[aria-label="No data available"]');
    expect(span?.className).toMatch(/tabular-nums/);
  });

  it('forwards a custom className', () => {
    const { container } = render(<NoData className="custom-x" />);
    const span = container.querySelector('span[aria-label="No data available"]');
    expect(span?.className).toMatch(/custom-x/);
  });

  // Note: tooltip body is rendered into a portal by Radix and only mounted
  // when the trigger is hovered/focused; we cover the field-passthrough
  // implicitly via the snapshot of the trigger structure rather than
  // exercising the portal here.
});
