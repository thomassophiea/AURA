import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModelSelector } from './ModelSelector';

describe('ModelSelector', () => {
  it('shows the active model label when one is loaded', () => {
    render(
      <ModelSelector
        providers={['groq']}
        models={[{ id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', contextWindow: 128000, notes: '', provider: 'groq' }]}
        selectedModel="llama-3.3-70b-versatile"
        onSelect={vi.fn()}
        loading={false}
      />
    );
    expect(screen.getByText('Llama 3.3 70B')).toBeDefined();
  });

  it('shows "Loading…" while the model list is still being fetched', () => {
    render(<ModelSelector providers={[]} models={[]} selectedModel="" onSelect={vi.fn()} loading={true} />);
    expect(screen.getByText('Loading…')).toBeDefined();
  });

  it('shows "Unavailable" — never a raw placeholder id — once loading has settled with no models', () => {
    render(<ModelSelector providers={[]} models={[]} selectedModel="" onSelect={vi.fn()} loading={false} />);
    expect(screen.getByText('Unavailable')).toBeDefined();
    expect(screen.queryByText('mock')).toBeNull();
  });

  it('never renders the literal placeholder id even if one were passed as selectedModel', () => {
    render(<ModelSelector providers={[]} models={[]} selectedModel="mock" onSelect={vi.fn()} loading={false} />);
    expect(screen.queryByText('mock')).toBeNull();
    expect(screen.getByText('Unavailable')).toBeDefined();
  });
});
