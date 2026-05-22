import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CortexProgress } from './CortexProgress';

describe('CortexProgress', () => {
  it('renders detecting stage label', () => {
    render(<CortexProgress stage="detecting" />);
    expect(screen.getByText('Detecting intent…')).toBeInTheDocument();
  });

  it('renders fetching stage label', () => {
    render(<CortexProgress stage="fetching" />);
    expect(screen.getByText('Fetching live evidence…')).toBeInTheDocument();
  });

  it('renders generating stage label', () => {
    render(<CortexProgress stage="generating" />);
    expect(screen.getByText('Generating answer…')).toBeInTheDocument();
  });

  it('renders an animated pulse indicator', () => {
    const { container } = render(<CortexProgress stage="classifying" />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });
});
