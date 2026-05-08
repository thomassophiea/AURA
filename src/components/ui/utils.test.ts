import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn (clsx + tailwind-merge)', () => {
  it('joins multiple class strings', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('drops falsy values (false / null / undefined / "")', () => {
    const condFalse = (() => false)();
    expect(cn('px-2', condFalse && 'should-not', null, undefined, '')).toBe('px-2');
  });

  it('honors conditional shorthand from clsx', () => {
    expect(cn('px-2', { 'bg-red-500': true, 'bg-blue-500': false })).toBe('px-2 bg-red-500');
  });

  it('flattens nested arrays', () => {
    expect(cn(['px-2', ['py-1', 'rounded']])).toBe('px-2 py-1 rounded');
  });

  it('tailwind-merge resolves conflicting padding utilities', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('tailwind-merge resolves conflicting bg utilities', () => {
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
  });

  it('preserves non-conflicting utilities alongside merged ones', () => {
    expect(cn('text-sm font-bold p-2', 'p-4')).toBe('text-sm font-bold p-4');
  });

  it('returns an empty string when no classes are passed', () => {
    expect(cn()).toBe('');
  });
});
