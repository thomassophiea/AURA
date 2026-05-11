import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentCommandBar } from './AgentCommandBar';

describe('AgentCommandBar', () => {
  it('renders placeholder text', () => {
    render(<AgentCommandBar value="" onChange={vi.fn()} onSubmit={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByPlaceholderText(/ask me anything/i)).toBeInTheDocument();
  });

  it('calls onOpen when input is focused', () => {
    const onOpen = vi.fn();
    render(<AgentCommandBar value="" onChange={vi.fn()} onSubmit={vi.fn()} onOpen={onOpen} />);
    fireEvent.focus(screen.getByPlaceholderText(/ask me anything/i));
    expect(onOpen).toHaveBeenCalled();
  });

  it('calls onSubmit on Enter key', () => {
    const onSubmit = vi.fn();
    render(
      <AgentCommandBar value="test query" onChange={vi.fn()} onSubmit={onSubmit} onOpen={vi.fn()} />
    );
    fireEvent.keyDown(screen.getByPlaceholderText(/ask me anything/i), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalled();
  });

  it('calls onChange when user types', () => {
    const onChange = vi.fn();
    render(<AgentCommandBar value="" onChange={onChange} onSubmit={vi.fn()} onOpen={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/ask me anything/i), {
      target: { value: 'hello' },
    });
    expect(onChange).toHaveBeenCalledWith('hello');
  });
});
