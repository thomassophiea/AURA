import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PartialData } from './PartialData';

describe('PartialData', () => {
  it('renders the message text', () => {
    render(<PartialData message="3 of 5 fields available" />);
    expect(screen.getByText('3 of 5 fields available')).toBeInTheDocument();
  });

  it('accepts a ReactNode message', () => {
    render(
      <PartialData
        message={
          <>
            <strong>Partial</strong> readings
          </>
        }
      />
    );
    expect(screen.getByText('Partial')).toBeInTheDocument();
    expect(screen.getByText('readings')).toBeInTheDocument();
  });

  it('exposes role=note for assistive tech', () => {
    const { container } = render(<PartialData message="x" />);
    expect(container.querySelector('[role="note"]')).not.toBeNull();
  });

  it('forwards a custom className', () => {
    const { container } = render(<PartialData message="x" className="custom-x" />);
    expect((container.firstChild as HTMLElement).className).toMatch(/custom-x/);
  });
});
