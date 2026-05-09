import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const personaCtx = vi.hoisted(() => ({
  current: {
    activePersona: 'super-user' as const,
    setActivePersona: vi.fn(),
    isPageAllowed: () => true,
    filterItems: <T,>(x: T[]) => x,
    isDevTheme: false,
  },
}));

vi.mock('@/contexts/PersonaContext', () => ({
  usePersonaContext: () => personaCtx.current,
}));

import { PersonaSelector } from './PersonaSelector';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
});

beforeEach(() => {
  personaCtx.current = {
    activePersona: 'super-user',
    setActivePersona: vi.fn(),
    isPageAllowed: () => true,
    filterItems: <T,>(x: T[]) => x,
    isDevTheme: false,
  } as typeof personaCtx.current;
});

describe('PersonaSelector', () => {
  it('renders the trigger with the active persona label', () => {
    render(<PersonaSelector />);
    // SelectValue surfaces the matching item label — Super User
    expect(screen.getAllByText(/Super User/i).length).toBeGreaterThan(0);
  });

  it('renders a UserCog icon inside the trigger', () => {
    const { container } = render(<PersonaSelector />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('shows a different label when activePersona changes', () => {
    personaCtx.current.activePersona = 'netops' as typeof personaCtx.current.activePersona;
    render(<PersonaSelector />);
    expect(screen.getAllByText(/NetOps/i).length).toBeGreaterThan(0);
  });
});
