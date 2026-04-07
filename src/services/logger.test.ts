import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from './logger';

describe('Logger Service', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    // Spy on console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('log method', () => {
    it('should call console.log when enabled', () => {
      logger.enable();
      logger.log('Test message');
      expect(console.log).toHaveBeenCalled();
    });

    it('should not call console.log when disabled', () => {
      logger.disable();
      logger.log('Test message');
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should format message with timestamp', () => {
      logger.enable();
      logger.log('Test message', 'arg1', 'arg2');
      expect(console.log).toHaveBeenCalled();
      const calls = (console.log as any).mock.calls[0];
      expect(calls[0]).toContain('[LOG]');
      expect(calls[1]).toBe('Test message');
      expect(calls[2]).toBe('arg1');
      expect(calls[3]).toBe('arg2');
    });
  });

  describe('error method', () => {
    it('should call console.error when enabled', () => {
      logger.enable();
      logger.error('Error message');
      expect(console.error).toHaveBeenCalled();
    });

    it('should not call console.error when disabled', () => {
      logger.disable();
      logger.error('Error message');
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe('warn method', () => {
    it('should call console.warn when enabled', () => {
      logger.enable();
      logger.warn('Warning message');
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('info method', () => {
    it('should call console.info when enabled', () => {
      logger.enable();
      logger.info('Info message');
      expect(console.info).toHaveBeenCalled();
    });
  });

  describe('debug method', () => {
    it('should call console.debug when enabled', () => {
      logger.enable();
      logger.debug('Debug message');
      expect(console.debug).toHaveBeenCalled();
    });
  });

  describe('enable/disable', () => {
    it('should enable logging', () => {
      logger.enable();
      logger.log('Test');
      expect(console.log).toHaveBeenCalled();
    });

    it('should disable logging', () => {
      logger.disable();
      logger.log('Test');
      expect(console.log).not.toHaveBeenCalled();
    });
  });
});
