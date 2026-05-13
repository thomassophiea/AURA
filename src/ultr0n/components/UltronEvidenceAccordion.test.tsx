import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UltronEvidenceAccordion } from './UltronEvidenceAccordion';

describe('UltronEvidenceAccordion', () => {
  it('renders nothing when both lists are empty', () => {
    const { container } = render(<UltronEvidenceAccordion apiEvidenceUsed={[]} missingData={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows API count in summary before expanding', () => {
    render(
      <UltronEvidenceAccordion
        apiEvidenceUsed={['/v1/stations/{mac}', '/v1/aps/ifstats/{sn}']}
        missingData={[]}
      />
    );
    expect(screen.getByText(/2 APIs called/)).toBeInTheDocument();
  });

  it('shows missing count in summary', () => {
    render(
      <UltronEvidenceAccordion
        apiEvidenceUsed={['/v1/stations/{mac}']}
        missingData={['/v1/aps/ifstats/{sn}']}
      />
    );
    expect(screen.getByText(/1 missing/)).toBeInTheDocument();
  });

  it('expands to reveal API paths on click', () => {
    render(<UltronEvidenceAccordion apiEvidenceUsed={['/v1/stations/{mac}']} missingData={[]} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('/v1/stations/{mac}')).toBeInTheDocument();
  });

  it('shows missing data section after expand', () => {
    render(<UltronEvidenceAccordion apiEvidenceUsed={[]} missingData={['/v1/stations/{mac}']} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('/v1/stations/{mac}')).toBeInTheDocument();
  });
});
