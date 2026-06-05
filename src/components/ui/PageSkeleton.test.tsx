import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PageSkeleton, getSkeletonVariant } from './PageSkeleton';

describe('PageSkeleton', () => {
  it('renders the default variant when no prop is passed', () => {
    const { container } = render(<PageSkeleton />);
    expect(container.firstChild).toBeTruthy();
    // default has 5 row skeletons + a header pair
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it('renders the dashboard variant', () => {
    const { container } = render(<PageSkeleton variant="dashboard" />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders the table variant', () => {
    const { container } = render(<PageSkeleton variant="table" />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders the cards variant', () => {
    const { container } = render(<PageSkeleton variant="cards" />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe('getSkeletonVariant', () => {
  it('maps dashboard pages to "dashboard"', () => {
    expect(getSkeletonVariant('dashboard')).toBe('dashboard');
    expect(getSkeletonVariant('service-levels')).toBe('dashboard');
    expect(getSkeletonVariant('insights')).toBe('dashboard');
    expect(getSkeletonVariant('reports')).toBe('dashboard');
    expect(getSkeletonVariant('security-dashboard')).toBe('dashboard');
  });

  it('maps table pages to "table"', () => {
    expect(getSkeletonVariant('access-points')).toBe('table');
    expect(getSkeletonVariant('connected-clients')).toBe('table');
    expect(getSkeletonVariant('alerts-events')).toBe('table');
    expect(getSkeletonVariant('guest-management')).toBe('table');
  });

  it('maps configuration pages to "cards"', () => {
    expect(getSkeletonVariant('configure-networks')).toBe('cards');
    expect(getSkeletonVariant('configure-sites-groups')).toBe('cards');
    expect(getSkeletonVariant('administration')).toBe('cards');
    expect(getSkeletonVariant('tools')).toBe('cards');
  });

  it('falls back to "default" for unknown pages', () => {
    expect(getSkeletonVariant('made-up-page')).toBe('default');
    expect(getSkeletonVariant('')).toBe('default');
  });
});
