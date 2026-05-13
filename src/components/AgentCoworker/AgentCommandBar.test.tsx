import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

vi.mock('../../contexts/UltronContext', () => ({
  useUltronContext: () => ({
    ultronContext: {
      pageName: 'Connected Clients',
      pageType: 'clients',
      route: 'connected-clients',
      siteName: 'HQ',
      timeRange: { label: '24h', start: '', end: '' },
      visibleRowsSummary: { rowCount: 312, columns: [], sampleRows: [] },
      filters: {},
    },
  }),
}));

// Imported after mock so the mocked hook is wired in.
import { AgentCommandBar } from './AgentCommandBar';

const PLACEHOLDER = /investigate connected clients…/i;

describe('AgentCommandBar', () => {
  it('renders the page-aware placeholder', () => {
    render(<AgentCommandBar value="" onChange={vi.fn()} onSubmit={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
  });

  it('surfaces the page name and context meta in the badge', () => {
    render(<AgentCommandBar value="" onChange={vi.fn()} onSubmit={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByText('Connected Clients')).toBeInTheDocument();
    expect(screen.getByText(/312 rows · 24h · HQ/)).toBeInTheDocument();
  });

  it('calls onOpen when input is focused', () => {
    const onOpen = vi.fn();
    render(<AgentCommandBar value="" onChange={vi.fn()} onSubmit={vi.fn()} onOpen={onOpen} />);
    fireEvent.focus(screen.getByPlaceholderText(PLACEHOLDER));
    expect(onOpen).toHaveBeenCalled();
  });

  it('calls onSubmit on Enter key', () => {
    const onSubmit = vi.fn();
    render(
      <AgentCommandBar value="test query" onChange={vi.fn()} onSubmit={onSubmit} onOpen={vi.fn()} />
    );
    fireEvent.keyDown(screen.getByPlaceholderText(PLACEHOLDER), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalled();
  });

  it('calls onChange when user types', () => {
    const onChange = vi.fn();
    render(<AgentCommandBar value="" onChange={onChange} onSubmit={vi.fn()} onOpen={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), {
      target: { value: 'hello' },
    });
    expect(onChange).toHaveBeenCalledWith('hello');
  });

  it('shows ⌘K hotkey hint', () => {
    render(<AgentCommandBar value="" onChange={vi.fn()} onSubmit={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByText('⌘K')).toBeInTheDocument();
  });
});
