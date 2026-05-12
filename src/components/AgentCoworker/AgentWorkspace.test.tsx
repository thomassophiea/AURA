import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  onApprove: noop,
  onReject: noop,
  onRollback: noop,
};

describe('AgentWorkspace', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders panel when mode is open', () => {
    render(<AgentWorkspace {...baseProps} />);
    expect(screen.getByText('Ultr0n')).toBeInTheDocument();
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

  it('shows conversation tab as selected by default', () => {
    render(<AgentWorkspace {...baseProps} />);
    const tab = screen.getByRole('tab', { name: /conversation/i });
    expect(tab).toHaveAttribute('aria-selected', 'true');
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
