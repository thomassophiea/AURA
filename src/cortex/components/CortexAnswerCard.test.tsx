import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CortexAnswerCard } from './CortexAnswerCard';
import type { CortexWirelessAnswer } from '@/cortex/types';

const baseAnswer: CortexWirelessAnswer = {
  id: 'ans-1',
  question: 'Why did this client disconnect?',
  narrative: 'The client disconnected due to low RSSI (-80 dBm).',
  rootCause: { category: 'COVERAGE', explanation: 'Low signal detected.' },
  confidence: 'High',
  apiEvidenceUsed: ['/v1/stations/{mac}'],
  followUpChips: ['Show AP RF stats', 'Reboot AP'],
  missingData: [],
};

describe('CortexAnswerCard', () => {
  it('renders the narrative text', () => {
    render(<CortexAnswerCard answer={baseAnswer} onFollowUp={vi.fn()} />);
    expect(screen.getByText(/low RSSI/)).toBeInTheDocument();
  });

  it('renders root cause badge', () => {
    render(<CortexAnswerCard answer={baseAnswer} onFollowUp={vi.fn()} />);
    expect(screen.getByText('Coverage Gap')).toBeInTheDocument();
  });

  it('renders confidence badge', () => {
    render(<CortexAnswerCard answer={baseAnswer} onFollowUp={vi.fn()} />);
    expect(screen.getByText(/High confidence/)).toBeInTheDocument();
  });

  it('calls onFollowUp when a chip is clicked', () => {
    const onFollowUp = vi.fn();
    render(<CortexAnswerCard answer={baseAnswer} onFollowUp={onFollowUp} />);
    fireEvent.click(screen.getByText('Show AP RF stats'));
    expect(onFollowUp).toHaveBeenCalledWith('Show AP RF stats');
  });

  it('renders confirmation card when requiresConfirmation is set', () => {
    const answer: CortexWirelessAnswer = {
      ...baseAnswer,
      requiresConfirmation: {
        action: 'Reboot AP',
        description: 'This will reboot the AP.',
        confirmationToken: 'tok-123',
      },
    };
    const onConfirm = vi.fn();
    render(<CortexAnswerCard answer={answer} onFollowUp={vi.fn()} onConfirm={onConfirm} />);
    expect(screen.getByText('Reboot AP')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith('tok-123');
  });
});
