import { describe, it, expect, vi, beforeEach } from 'vitest';
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

vi.mock('../../hooks/useUltr0nModel', () => ({
  useUltr0nModel: () => ({
    provider: 'groq',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      {
        id: 'llama-3.3-70b-versatile',
        label: 'Llama 3.3 70B',
        contextWindow: 128000,
        notes: 'Default',
      },
    ],
    selectedModel: 'llama-3.3-70b-versatile',
    setSelectedModel: vi.fn(),
    loading: false,
    error: null,
  }),
}));

import { AgentWorkspace } from './AgentWorkspace';

const noop = vi.fn();
const baseProps = {
  mode: 'open' as const,
  size: 'standard' as const,
  activePanel: 'conversation' as const,
  messages: [],
  isThinking: false,
  inputValue: '',
  isListening: false,
  pendingPlan: null,
  auditEntries: [],
  apiTimelineEntries: [],
  onClose: noop,
  onMinimize: noop,
  onPin: noop,
  onDismiss: noop,
  onSetSize: noop,
  onSetActivePanel: noop,
  onInput: noop,
  onSubmit: noop,
  onMicToggle: noop,
  onFeedback: noop,
  onToggleReasoning: noop,
  onFollowUp: noop,
  onConfirmWireless: noop,
  onApprove: noop,
  onReject: noop,
  onRollback: noop,
};

describe('AgentWorkspace', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the current page name as the workspace title', () => {
    render(<AgentWorkspace {...baseProps} />);
    expect(screen.getByRole('heading', { name: 'Connected Clients' })).toBeInTheDocument();
  });

  it('does not display Ultr0n / Coworker branding anymore', () => {
    render(<AgentWorkspace {...baseProps} />);
    expect(screen.queryByText('Ultr0n')).not.toBeInTheDocument();
    expect(screen.queryByText('Coworker')).not.toBeInTheDocument();
  });

  it('renders context chips for time range, site, and row count', () => {
    render(<AgentWorkspace {...baseProps} />);
    expect(screen.getByText(/24h/i)).toBeInTheDocument();
    expect(screen.getByText(/HQ/i)).toBeInTheDocument();
    expect(screen.getByText(/312 rows/i)).toBeInTheDocument();
  });

  it('is visually hidden (translate-x-full) when mode is idle', () => {
    const { container } = render(<AgentWorkspace {...baseProps} mode="idle" />);
    const panel = container.querySelector('[data-testid="agent-workspace"]');
    expect(panel?.className).toContain('translate-x-full');
  });

  it('calls onClose when × is clicked', () => {
    const onClose = vi.fn();
    render(<AgentWorkspace {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByTitle('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the Observe tab as selected by default', () => {
    render(<AgentWorkspace {...baseProps} />);
    const tab = screen.getByRole('tab', { name: /observe/i });
    expect(tab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders the renamed tabs in order Observe / Plan / Apply / Audit / API', () => {
    render(<AgentWorkspace {...baseProps} />);
    const tabs = screen.getAllByRole('tab').map((el) => el.textContent?.trim());
    expect(tabs).toEqual(['Observe', 'Plan', 'Apply', 'Audit', 'API']);
  });

  it('applies correct width for each size', () => {
    const { rerender, container } = render(<AgentWorkspace {...baseProps} size="compact" />);
    expect(container.querySelector('[data-testid="agent-workspace"]')).toHaveStyle({
      width: '400px',
    });
    rerender(<AgentWorkspace {...baseProps} size="standard" />);
    expect(container.querySelector('[data-testid="agent-workspace"]')).toHaveStyle({
      width: '520px',
    });
    rerender(<AgentWorkspace {...baseProps} size="expanded" />);
    expect(container.querySelector('[data-testid="agent-workspace"]')).toHaveStyle({
      width: '720px',
    });
  });
});
