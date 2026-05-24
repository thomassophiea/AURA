import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentWorkspace } from './AgentWorkspace';

vi.mock('./panels/ConsoleShell', () => ({
  ConsoleShell: () => <div data-testid="red-queen-shell">Terminal</div>,
}));
vi.mock('./panels/ConversationStream', () => ({
  ConversationStream: () => <div data-testid="conversation-stream">Chat</div>,
}));
vi.mock('./panels/ValidationPanel', () => ({
  ValidationPanel: () => <div data-testid="validation-panel">Validate</div>,
}));
vi.mock('./panels/DriftPanel', () => ({
  DriftPanel: () => <div data-testid="drift-panel">Drift</div>,
}));
vi.mock('./panels/ExecutionPlanView', () => ({
  ExecutionPlanView: () => <div data-testid="execution-panel">Execution</div>,
}));
vi.mock('./panels/ConfigDiffView', () => ({
  ConfigDiffView: () => <div data-testid="diff-panel">Diff</div>,
}));
vi.mock('./panels/AuditHistoryView', () => ({
  AuditHistoryView: () => <div data-testid="audit-panel">Audit</div>,
}));
vi.mock('./panels/APITimelineView', () => ({
  APITimelineView: () => <div data-testid="timeline-panel">Timeline</div>,
}));
vi.mock('../../contexts/CortexContext', () => ({
  useCortexContext: () => ({
    messages: [],
    isThinking: false,
    wirelessStage: null,
    suggestedPrompts: [],
    pendingPlan: null,
    auditEntries: [],
    apiTimeline: [],
    sendMessage: vi.fn(),
    confirmWirelessAction: vi.fn(),
  }),
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
  primaryTab: 'terminal' as const,
  activePanel: 'conversation' as const,
  onClose: vi.fn(),
  onMinimize: vi.fn(),
  onPin: vi.fn(),
  onDismiss: vi.fn(),
  onSetSize: vi.fn(),
  onSetPrimaryTab: vi.fn(),
  onSetActivePanel: vi.fn(),
};

describe('AgentWorkspace tabs', () => {
  it('shows Terminal tab content by default', async () => {
    render(<AgentWorkspace {...defaultProps} />);
    await waitFor(() => expect(screen.getByTestId('red-queen-shell')).toBeDefined());
  });

  it('shows Ops tab content when primaryTab is ops', async () => {
    render(<AgentWorkspace {...defaultProps} primaryTab="ops" />);
    await waitFor(() => expect(screen.getByTestId('conversation-stream')).toBeDefined());
  });

  it('calls onSetPrimaryTab when Ops tab is clicked', async () => {
    const onSetPrimaryTab = vi.fn();
    render(<AgentWorkspace {...defaultProps} onSetPrimaryTab={onSetPrimaryTab} />);
    await waitFor(() => screen.getByRole('tab', { name: /ops/i }));
    fireEvent.click(screen.getByRole('tab', { name: /ops/i }));
    expect(onSetPrimaryTab).toHaveBeenCalledWith('ops');
  });

  it('shows DriftPanel when activePanel is drift (Ops tab)', async () => {
    render(<AgentWorkspace {...defaultProps} primaryTab="ops" activePanel="drift" />);
    await waitFor(() => expect(screen.getByTestId('drift-panel')).toBeDefined());
  });

  it('shows ValidationPanel when activePanel is validate (Ops tab)', async () => {
    render(<AgentWorkspace {...defaultProps} primaryTab="ops" activePanel="validate" />);
    await waitFor(() => expect(screen.getByTestId('validation-panel')).toBeDefined());
  });
});
