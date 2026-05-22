import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CortexFollowUpChips } from './CortexFollowUpChips';

describe('CortexFollowUpChips', () => {
  it('renders nothing when chips array is empty', () => {
    const { container } = render(<CortexFollowUpChips chips={[]} onSelect={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a button for each chip', () => {
    render(
      <CortexFollowUpChips
        chips={['Show client timeline', 'Show AP RF stats']}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('Show client timeline')).toBeInTheDocument();
    expect(screen.getByText('Show AP RF stats')).toBeInTheDocument();
  });

  it('calls onSelect with chip label when clicked', () => {
    const onSelect = vi.fn();
    render(<CortexFollowUpChips chips={['Reboot AP']} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Reboot AP'));
    expect(onSelect).toHaveBeenCalledWith('Reboot AP');
  });
});
