import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UltronAnswerCard } from './UltronAnswerCard';
import type { UltronWirelessAnswer } from '@/ultr0n/types';

const baseAnswer: UltronWirelessAnswer = {
  id: 'ans-1',
  question: 'Why did this client disconnect?',
  narrative: 'The client disconnected due to low RSSI (-80 dBm).',
  rootCause: { category: 'COVERAGE', explanation: 'Low signal detected.' },
  confidence: 'High',
  apiEvidenceUsed: ['/v1/stations/{mac}'],
  followUpChips: ['Show AP RF stats', 'Reboot AP'],
  missingData: [],
};

describe('UltronAnswerCard', () => {
  it('renders the narrative text', () => {
    render(<UltronAnswerCard answer={baseAnswer} onFollowUp={vi.fn()} />);
    expect(screen.getByText(/low RSSI/)).toBeInTheDocument();
  });

  it('renders root cause badge', () => {
    render(<UltronAnswerCard answer={baseAnswer} onFollowUp={vi.fn()} />);
    expect(screen.getByText('Coverage Gap')).toBeInTheDocument();
  });

  it('renders confidence badge', () => {
    render(<UltronAnswerCard answer={baseAnswer} onFollowUp={vi.fn()} />);
    expect(screen.getByText(/High confidence/)).toBeInTheDocument();
  });

  it('calls onFollowUp when a chip is clicked', () => {
    const onFollowUp = vi.fn();
    render(<UltronAnswerCard answer={baseAnswer} onFollowUp={onFollowUp} />);
    fireEvent.click(screen.getByText('Show AP RF stats'));
    expect(onFollowUp).toHaveBeenCalledWith('Show AP RF stats');
  });

  it('renders confirmation card when requiresConfirmation is set', () => {
    const answer: UltronWirelessAnswer = {
      ...baseAnswer,
      requiresConfirmation: {
        action: 'Reboot AP',
        description: 'This will reboot the AP.',
        confirmationToken: 'tok-123',
      },
    };
    const onConfirm = vi.fn();
    render(<UltronAnswerCard answer={answer} onFollowUp={vi.fn()} onConfirm={onConfirm} />);
    expect(screen.getByText('Reboot AP')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith('tok-123');
  });
});
