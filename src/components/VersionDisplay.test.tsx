import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VersionDisplay } from './VersionDisplay';

describe('VersionDisplay', () => {
  it('renders the compact view by default with the version label', () => {
    const { container } = render(<VersionDisplay />);
    // Either a real version or "dev" is shown.
    expect(container.querySelector('.font-mono')?.textContent).toBeTruthy();
  });

  it('does not render expanded details until clicked', () => {
    render(<VersionDisplay />);
    expect(screen.queryByText(/Build #/)).toBeNull();
  });

  it('clicking expands to show commit/branch/build-date details', () => {
    const { container } = render(<VersionDisplay />);
    const compact = container.querySelector('.cursor-pointer') as HTMLElement;
    fireEvent.click(compact);
    expect(screen.getByText(/Build #/)).toBeTruthy();
  });

  it('clicking twice collapses again', () => {
    const { container } = render(<VersionDisplay />);
    const compact = container.querySelector('.cursor-pointer') as HTMLElement;
    fireEvent.click(compact);
    fireEvent.click(compact);
    expect(screen.queryByText(/Build #/)).toBeNull();
  });

  it('expandable=false suppresses the click handler and never expands', () => {
    const { container } = render(<VersionDisplay expandable={false} />);
    const compact = container.querySelector('.cursor-pointer') as HTMLElement;
    fireEvent.click(compact);
    expect(screen.queryByText(/Build #/)).toBeNull();
  });

  it('position="bottom-right" applies the right-edge classes', () => {
    const { container } = render(<VersionDisplay position="bottom-right" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('right-4');
    expect(root.className).not.toContain('left-4');
  });

  it('position="bottom-left" (default) applies the left-edge classes', () => {
    const { container } = render(<VersionDisplay />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('left-4');
  });

  it('forwards a custom className alongside positioning', () => {
    const { container } = render(<VersionDisplay className="my-version-fab" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('my-version-fab');
    expect(root.className).toContain('fixed');
  });
});
