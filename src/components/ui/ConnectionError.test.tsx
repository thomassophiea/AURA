import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionError } from './ConnectionError';

describe('ConnectionError', () => {
  it('renders the default title when none provided', () => {
    render(<ConnectionError />);
    expect(screen.getByText('Controller unreachable')).toBeInTheDocument();
  });

  it('renders a custom title when provided', () => {
    render(<ConnectionError title="Backend offline" />);
    expect(screen.getByText('Backend offline')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<ConnectionError description="The XIQC API timed out after 8s." />);
    expect(screen.getByText('The XIQC API timed out after 8s.')).toBeInTheDocument();
  });

  it('renders a custom action node', () => {
    render(<ConnectionError action={<button type="button">Retry</button>} />);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('exposes role=alert for screen readers', () => {
    const { container } = render(<ConnectionError />);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('uses larger spacing in hero scale vs inline', () => {
    const { container: inline } = render(<ConnectionError scale="inline" />);
    const { container: hero } = render(<ConnectionError scale="hero" />);
    const inlineRoot = inline.firstChild as HTMLElement;
    const heroRoot = hero.firstChild as HTMLElement;
    // hero gets min-h-[280px] and px-8; inline gets min-h-[160px] and px-6.
    expect(heroRoot.className).toMatch(/min-h-\[280px\]/);
    expect(inlineRoot.className).toMatch(/min-h-\[160px\]/);
  });

  it('always renders the "Connection error" eyebrow', () => {
    render(<ConnectionError title="Anything" />);
    expect(screen.getByText(/Connection error/i)).toBeInTheDocument();
  });
});
