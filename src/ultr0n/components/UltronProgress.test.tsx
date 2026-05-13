import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UltronProgress } from './UltronProgress';

describe('UltronProgress', () => {
  it('renders detecting stage label', () => {
    render(<UltronProgress stage="detecting" />);
    expect(screen.getByText('Detecting intent…')).toBeInTheDocument();
  });

  it('renders fetching stage label', () => {
    render(<UltronProgress stage="fetching" />);
    expect(screen.getByText('Fetching live evidence…')).toBeInTheDocument();
  });

  it('renders generating stage label', () => {
    render(<UltronProgress stage="generating" />);
    expect(screen.getByText('Generating answer…')).toBeInTheDocument();
  });

  it('renders an animated pulse indicator', () => {
    const { container } = render(<UltronProgress stage="classifying" />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });
});
