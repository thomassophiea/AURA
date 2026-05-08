import { describe, it, expect } from 'vitest';
import { supabase } from './supabaseClient';

describe('supabase client', () => {
  it('exports a usable Supabase client (has .from() builder method)', () => {
    expect(supabase).toBeDefined();
    expect(typeof supabase.from).toBe('function');
  });

  it('exposes auth interface', () => {
    expect(supabase.auth).toBeDefined();
    expect(typeof supabase.auth.getSession).toBe('function');
  });

  it('from() returns a chainable query builder', () => {
    const builder = supabase.from('controllers');
    expect(builder).toBeDefined();
    expect(typeof builder.select).toBe('function');
    expect(typeof builder.insert).toBe('function');
    expect(typeof builder.update).toBe('function');
    expect(typeof builder.delete).toBe('function');
  });
});
