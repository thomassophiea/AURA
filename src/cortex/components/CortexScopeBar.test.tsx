import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CortexScopeBar } from './CortexScopeBar';
import { CortexClarifyPrompt } from './CortexClarifyPrompt';

describe('CortexScopeBar', () => {
  it('renders nothing without a scope, rather than implying one', () => {
    const { container } = render(<CortexScopeBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says plainly when an answer covered the whole estate', () => {
    // The defect: an operator on one site got an estate-wide count with nothing
    // saying so. The number was true and their conclusion was wrong.
    render(
      <CortexScopeBar
        scope={{ level: 'fleet', siteNames: null, reason: 'no site specified', source: 'rule7' }}
      />
    );
    expect(screen.getByText('All sites')).toBeInTheDocument();
  });

  it('names the site when the answer was scoped to one', () => {
    render(
      <CortexScopeBar
        scope={{ level: 'site', siteNames: ['AURA_LAB'], reason: 'you named it', source: 'rule2' }}
      />
    );
    expect(screen.getByText('AURA_LAB')).toBeInTheDocument();
  });

  it('shows the measured blast radius next to the scope', () => {
    render(
      <CortexScopeBar
        scope={{ level: 'site', siteNames: ['AURA_LAB'], reason: '', source: 'rule2' }}
        impact={{ affected: 12, total: 47, unit: 'clients', basis: 'observed' }}
      />
    );
    expect(screen.getByText('12 of 47')).toBeInTheDocument();
    expect(screen.getByText('clients affected')).toBeInTheDocument();
  });

  it('offers to narrow a fleet answer to a known site', () => {
    const onRescope = vi.fn();
    render(
      <CortexScopeBar
        scope={{ level: 'fleet', siteNames: null, reason: '', source: 'rule7' }}
        knownSites={['AURA_LAB', 'PrimarySite']}
        onRescope={onRescope}
      />
    );
    fireEvent.click(screen.getByText('Just AURA_LAB'));
    expect(onRescope).toHaveBeenCalledWith({ siteNames: ['AURA_LAB'] });
  });

  it('offers to widen a site answer to the estate', () => {
    const onRescope = vi.fn();
    render(
      <CortexScopeBar
        scope={{ level: 'site', siteNames: ['AURA_LAB'], reason: '', source: 'rule2' }}
        onRescope={onRescope}
      />
    );
    fireEvent.click(screen.getByText('All sites'));
    expect(onRescope).toHaveBeenCalledWith({ level: 'fleet' });
  });

  it('offers no re-scope for a single device, where site is meaningless', () => {
    render(
      <CortexScopeBar
        scope={{ level: 'entity', siteNames: null, reason: '', source: 'rule1' }}
        knownSites={['AURA_LAB']}
        onRescope={vi.fn()}
      />
    );
    expect(screen.queryByText('Just AURA_LAB')).not.toBeInTheDocument();
    expect(screen.getByText('One device')).toBeInTheDocument();
  });
});

describe('CortexClarifyPrompt', () => {
  const clarification = {
    question: 'More than one site matches what you named: Beta North, Beta South.',
    originalQuestion: 'any problems at Beta?',
    candidates: [
      { label: 'Beta North', value: 'Beta North' },
      { label: 'Beta South', value: 'Beta South' },
    ],
    allOption: { label: 'Check all 2 sites', value: '__all_sites__' },
    unresolved: [],
  };

  it('asks the question and offers every candidate', () => {
    render(<CortexClarifyPrompt clarification={clarification} onChoose={vi.fn()} />);
    expect(screen.getByText(/More than one site matches/)).toBeInTheDocument();
    expect(screen.getByText('Beta North')).toBeInTheDocument();
    expect(screen.getByText('Beta South')).toBeInTheDocument();
  });

  it('always offers an escape to the whole estate', () => {
    // Without this the operator is trapped choosing between two readings when
    // what they wanted was both.
    const onChoose = vi.fn();
    render(<CortexClarifyPrompt clarification={clarification} onChoose={onChoose} />);
    fireEvent.click(screen.getByText('Check all 2 sites'));
    expect(onChoose).toHaveBeenCalledWith({ level: 'fleet' });
  });

  it('returns the chosen site as an override', () => {
    const onChoose = vi.fn();
    render(<CortexClarifyPrompt clarification={clarification} onChoose={onChoose} />);
    fireEvent.click(screen.getByText('Beta South'));
    expect(onChoose).toHaveBeenCalledWith({ siteNames: ['Beta South'] });
  });

  it('says which name matched nothing', () => {
    render(
      <CortexClarifyPrompt
        clarification={{ ...clarification, unresolved: ['Boston'] }}
        onChoose={vi.fn()}
      />
    );
    expect(screen.getByText(/No site matched "Boston"/)).toBeInTheDocument();
  });
});
