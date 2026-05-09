import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileStatusRow } from './MobileStatusRow';

describe('MobileStatusRow', () => {
  it('renders primary and secondary text', () => {
    render(<MobileStatusRow primaryText="AP-Lobby-3" secondaryText="MAC: aa:bb:cc..." />);
    expect(screen.getByText('AP-Lobby-3')).toBeTruthy();
    expect(screen.getByText('MAC: aa:bb:cc...')).toBeTruthy();
  });

  it('renders as a <button> when onClick is provided', () => {
    render(<MobileStatusRow primaryText="x" secondaryText="y" onClick={vi.fn()} />);
    expect(screen.getByText('x').closest('button')).toBeTruthy();
  });

  it('renders as a <div> when onClick is not provided', () => {
    const { container } = render(<MobileStatusRow primaryText="x" secondaryText="y" />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('clicking the row fires onClick when present', () => {
    const onClick = vi.fn();
    render(<MobileStatusRow primaryText="x" secondaryText="y" onClick={onClick} />);
    fireEvent.click(screen.getByText('x').closest('button')!);
    expect(onClick).toHaveBeenCalled();
  });

  it('shows the chevron only when onClick is present', () => {
    const { container, rerender } = render(<MobileStatusRow primaryText="x" secondaryText="y" />);
    // No onClick, no rightContent → no svg
    expect(container.querySelector('svg')).toBeNull();
    rerender(<MobileStatusRow primaryText="x" secondaryText="y" onClick={vi.fn()} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders rightContent in place of the chevron when provided', () => {
    render(
      <MobileStatusRow
        primaryText="x"
        secondaryText="y"
        onClick={vi.fn()}
        rightContent={<span data-testid="custom-right">★</span>}
      />
    );
    expect(screen.getByTestId('custom-right')).toBeTruthy();
  });

  it('renders the status badge with the provided label', () => {
    render(
      <MobileStatusRow
        primaryText="x"
        secondaryText="y"
        status={{ label: 'Online', variant: 'success' }}
      />
    );
    expect(screen.getByText('Online')).toBeTruthy();
  });

  it.each([
    ['online', 'bg-green-500'],
    ['offline', 'bg-red-500'],
    ['warning', 'bg-amber-500'],
  ] as const)('indicator="%s" applies the matching dot color', (indicator, expectedClass) => {
    const { container } = render(
      <MobileStatusRow primaryText="x" secondaryText="y" indicator={indicator} />
    );
    expect(container.querySelector(`.${expectedClass}`)).toBeTruthy();
  });

  it('renders no indicator dot when prop is omitted', () => {
    const { container } = render(<MobileStatusRow primaryText="x" secondaryText="y" />);
    expect(container.querySelector('.bg-green-500')).toBeNull();
    expect(container.querySelector('.bg-red-500')).toBeNull();
    expect(container.querySelector('.bg-amber-500')).toBeNull();
  });
});
