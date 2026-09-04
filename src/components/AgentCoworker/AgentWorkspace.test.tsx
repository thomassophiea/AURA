import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentWorkspace } from './AgentWorkspace';

vi.mock('./wireless/WirelessAssistantPanel', () => ({
  WirelessAssistantPanel: () => <div data-testid="wireless-assistant-panel">AURA workflow</div>,
}));
vi.mock('../../hooks/useCortexModel', () => ({
  useCortexModel: () => ({
    providers: [],
    models: [],
    selectedModel: null,
    setSelectedModel: vi.fn(),
    loading: false,
  }),
}));
vi.mock('../../contexts/AppContext', () => ({
  useAppContext: () => ({ siteGroup: null, navigationScope: 'global' }),
}));
vi.mock('../../services/agentContextService', () => ({
  writeAgentContext: vi.fn(),
}));
vi.mock('./ModelSelector', () => ({
  ModelSelector: () => <div>ModelSelector</div>,
}));

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ alerts: [] }) })
  );
});

const defaultProps = {
  mode: 'open' as const,
  size: 'standard' as const,
  onClose: vi.fn(),
  onMinimize: vi.fn(),
  onPin: vi.fn(),
  onDismiss: vi.fn(),
  onSetSize: vi.fn(),
};

describe('AgentWorkspace', () => {
  it('renders the single unified AURA workflow panel — no Terminal/Ops tabs', async () => {
    render(<AgentWorkspace {...defaultProps} />);
    await waitFor(() => expect(screen.getByTestId('wireless-assistant-panel')).toBeDefined());
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('renders a minimized rail when mode is minimized', () => {
    render(<AgentWorkspace {...defaultProps} mode="minimized" />);
    expect(screen.getByTitle('Expand AURA Agent')).toBeDefined();
  });

  it('calls onClose/onMinimize/onPin/onSetSize from header controls', () => {
    const onClose = vi.fn();
    const onMinimize = vi.fn();
    const onPin = vi.fn();
    const onSetSize = vi.fn();
    render(
      <AgentWorkspace
        {...defaultProps}
        onClose={onClose}
        onMinimize={onMinimize}
        onPin={onPin}
        onSetSize={onSetSize}
      />
    );

    fireEvent.click(screen.getByTitle('Minimize'));
    expect(onMinimize).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Pin open'));
    expect(onPin).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Toggle expanded'));
    expect(onSetSize).toHaveBeenCalledWith('expanded');
    fireEvent.click(screen.getByTitle('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('reports drift count from /api/drift', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ alerts: [{ id: '1' }, { id: '2' }] }) })
    );
    const onDriftCount = vi.fn();
    render(<AgentWorkspace {...defaultProps} onDriftCount={onDriftCount} />);
    await waitFor(() => expect(onDriftCount).toHaveBeenCalledWith(2));
  });
});
