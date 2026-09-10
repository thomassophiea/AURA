import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCortexHistory, deriveTitle } from './useCortexHistory';
import type { AgentMessage } from '../components/AgentCoworker/agentTypes';

const msg = (role: 'user' | 'agent', content: string): AgentMessage => ({
  id: `${role}-${content}`,
  role,
  content,
  timestamp: new Date('2026-09-10T12:00:00Z'),
});

const exchange = (q = 'why is this client slow?') => [msg('user', q), msg('agent', 'weak signal')];

describe('deriveTitle', () => {
  it('uses the operator’s own first question, so the row is recognisable', () => {
    expect(deriveTitle(exchange('why can’t this client connect?'))).toBe('why can’t this client connect?');
  });

  it('truncates a long question rather than blowing out the row', () => {
    const t = deriveTitle([msg('user', 'x'.repeat(200))]);
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t.endsWith('…')).toBe(true);
  });

  it('collapses whitespace', () => {
    expect(deriveTitle([msg('user', 'why   is\n\nthis slow')])).toBe('why is this slow');
  });

  it('handles a transcript with no question', () => {
    expect(deriveTitle([])).toBe('Empty conversation');
  });
});

describe('useCortexHistory', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('does not save a conversation Cortex has not answered yet', () => {
    // An abandoned draft is not history.
    const { result } = renderHook(() => useCortexHistory());
    act(() => result.current.save('c1', [msg('user', 'hello?')]));
    expect(result.current.conversations).toHaveLength(0);
  });

  it('saves once there is an answer', () => {
    const { result } = renderHook(() => useCortexHistory());
    act(() => result.current.save('c1', exchange()));
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].title).toBe('why is this client slow?');
  });

  it('upserts the live conversation rather than appending a row per message', () => {
    const { result } = renderHook(() => useCortexHistory());
    act(() => result.current.save('c1', exchange()));
    act(() => result.current.save('c1', [...exchange(), msg('user', 'and the VLAN?')]));
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].messages).toHaveLength(3);
  });

  it('keeps the original title as a conversation grows', () => {
    const { result } = renderHook(() => useCortexHistory());
    act(() => result.current.save('c1', exchange('first question')));
    act(() => result.current.save('c1', [...exchange('first question'), msg('user', 'second')]));
    expect(result.current.conversations[0].title).toBe('first question');
  });

  it('orders newest first', () => {
    const { result } = renderHook(() => useCortexHistory());
    act(() => result.current.save('a', exchange('older')));
    act(() => result.current.save('b', exchange('newer')));
    expect(result.current.conversations.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('survives a reload and revives timestamps as Dates', () => {
    // JSON turns a Date into a string; AgentMessage.timestamp must stay a Date
    // or every consumer calling .toLocaleTimeString() breaks.
    const first = renderHook(() => useCortexHistory());
    act(() => first.result.current.save('c1', exchange()));

    const second = renderHook(() => useCortexHistory());
    expect(second.result.current.conversations).toHaveLength(1);
    const restored = second.result.current.load('c1');
    expect(restored).toHaveLength(2);
    expect(restored![0].timestamp).toBeInstanceOf(Date);
    expect(restored![0].timestamp.toISOString()).toBe('2026-09-10T12:00:00.000Z');
  });

  it('load() returns null for an unknown id', () => {
    const { result } = renderHook(() => useCortexHistory());
    expect(result.current.load('nope')).toBeNull();
  });

  it('remove() deletes one conversation and leaves the rest', () => {
    const { result } = renderHook(() => useCortexHistory());
    act(() => result.current.save('a', exchange('one')));
    act(() => result.current.save('b', exchange('two')));
    act(() => result.current.remove('a'));
    expect(result.current.conversations.map((c) => c.id)).toEqual(['b']);
  });

  it('clearAll() empties both state and storage', () => {
    const { result } = renderHook(() => useCortexHistory());
    act(() => result.current.save('a', exchange()));
    act(() => result.current.clearAll());
    expect(result.current.conversations).toHaveLength(0);
    expect(localStorage.getItem('cortex_history')).toBeNull();
  });

  it('caps the number of conversations kept', () => {
    const { result } = renderHook(() => useCortexHistory());
    act(() => {
      for (let i = 0; i < 30; i++) result.current.save(`c${i}`, exchange(`q${i}`));
    });
    expect(result.current.conversations.length).toBeLessThanOrEqual(25);
    // The newest must survive the prune.
    expect(result.current.conversations[0].id).toBe('c29');
  });

  it('tolerates corrupt storage instead of breaking the panel', () => {
    localStorage.setItem('cortex_history', '{not json');
    const { result } = renderHook(() => useCortexHistory());
    expect(result.current.conversations).toEqual([]);
  });

  it('ignores non-array stored payloads', () => {
    localStorage.setItem('cortex_history', '{"a":1}');
    const { result } = renderHook(() => useCortexHistory());
    expect(result.current.conversations).toEqual([]);
  });

  it('does not throw when storage is unavailable (private window / quota)', () => {
    // Losing history is annoying; breaking the chat is not acceptable.
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { result } = renderHook(() => useCortexHistory());
    expect(() => act(() => result.current.save('c1', exchange()))).not.toThrow();
    spy.mockRestore();
  });
});
