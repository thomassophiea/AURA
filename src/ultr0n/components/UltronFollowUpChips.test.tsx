import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UltronFollowUpChips } from './UltronFollowUpChips';

describe('UltronFollowUpChips', () => {
  it('renders nothing when chips array is empty', () => {
    const { container } = render(<UltronFollowUpChips chips={[]} onSelect={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a button for each chip', () => {
    render(
      <UltronFollowUpChips
        chips={['Show client timeline', 'Show AP RF stats']}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('Show client timeline')).toBeInTheDocument();
    expect(screen.getByText('Show AP RF stats')).toBeInTheDocument();
  });

  it('calls onSelect with chip label when clicked', () => {
    const onSelect = vi.fn();
    render(<UltronFollowUpChips chips={['Reboot AP']} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Reboot AP'));
    expect(onSelect).toHaveBeenCalledWith('Reboot AP');
  });
});
