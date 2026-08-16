/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@testing-library/jest-dom/vitest" />
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Node 22 shipped Web Storage behind a flag; Node 25 defines `localStorage` as a
// getter on globalThis unconditionally, and without a valid `--localstorage-file`
// it yields a bare `{}` with none of the Storage methods. That getter is
// installed before Vitest populates the jsdom globals, so jsdom's real Storage
// never lands and every `localStorage.clear()` throws. The runtime image is
// node:22-alpine, where this does not happen — so the failures are purely local,
// which is the worst kind: a suite that is red on a developer's machine and
// green in CI stops being read at all.
//
// Install a working Storage whenever the ambient one is unusable. Kept writable
// and configurable because ~20 suites replace it with their own stub.
if (typeof (globalThis as any).localStorage?.getItem !== 'function') {
  class MemoryStorage implements Storage {
    private store = new Map<string, string>();

    get length() {
      return this.store.size;
    }

    key(index: number) {
      return Array.from(this.store.keys())[index] ?? null;
    }

    getItem(key: string) {
      return this.store.get(String(key)) ?? null;
    }

    setItem(key: string, value: string) {
      this.store.set(String(key), String(value));
    }

    removeItem(key: string) {
      this.store.delete(String(key));
    }

    clear() {
      this.store.clear();
    }

    [name: string]: any;
  }

  for (const target of [globalThis, window]) {
    for (const name of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(target, name, {
        value: new MemoryStorage(),
        writable: true,
        configurable: true,
      });
    }
  }
}

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock scrollIntoView (not implemented in jsdom)
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;
