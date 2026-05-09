import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileStatusList } from './MobileStatusList';

describe('MobileStatusList', () => {
  it('renders children when not loading + not empty', () => {
    render(
      <MobileStatusList>
        <div data-testid="row">row content</div>
      </MobileStatusList>
    );
    expect(screen.getByTestId('row').textContent).toBe('row content');
  });

  it('renders skeleton rows when loading=true', () => {
    const { container } = render(
      <MobileStatusList loading>
        <div>child</div>
      </MobileStatusList>
    );
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    // children NOT rendered while loading
    expect(screen.queryByText('child')).toBeNull();
  });

  it('honors loadingRows count', () => {
    const { container } = render(
      <MobileStatusList loading loadingRows={3}>
        <div />
      </MobileStatusList>
    );
    // 3 rows × 2 skeletons each (title + subtitle)
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(6);
  });

  it('shows the empty-state message when children is an empty array', () => {
    render(<MobileStatusList>{[]}</MobileStatusList>);
    expect(screen.getByText('No items found')).toBeTruthy();
  });

  it('honors a custom emptyMessage', () => {
    render(<MobileStatusList emptyMessage="Nothing here">{[]}</MobileStatusList>);
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });

  it('shows empty state when children is null/undefined', () => {
    render(<MobileStatusList>{null}</MobileStatusList>);
    expect(screen.getByText('No items found')).toBeTruthy();
  });
});
