import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSync } from './useSync';

// Mock browser runtime
const mockSendMessage = vi.fn();
global.browser = {
  runtime: {
    sendMessage: mockSendMessage,
    lastError: null
  }
} as any;

describe('useSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMessage.mockClear();
  });

  describe('initialization', () => {
    it('should fetch status on mount', async () => {
      const mockStatus = {
        status: 'idle',
        lastSync: 1234567890,
        queueLength: 0,
        isGitHubConfigured: true,
        totalBookmarks: 5
      };

      mockSendMessage.mockImplementation((message, callback) => {
        if (message.type === 'GET_SYNC_STATUS') {
          callback({ success: true, status: mockStatus });
        }
      });

      const { result } = renderHook(() => useSync());

      // Wait for useEffect to complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        { type: 'GET_SYNC_STATUS' },
        expect.any(Function)
      );
      expect(result.current.status).toEqual(mockStatus);
      expect(result.current.isConfigured).toBe(true);
      expect(result.current.totalBookmarks).toBe(5);
    });

    it('should handle status fetch error', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        if (message.type === 'GET_SYNC_STATUS') {
          callback({ success: false, error: 'Failed to get status' });
        }
      });

      const { result } = renderHook(() => useSync());

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.error).toBe('Failed to get status');
      expect(result.current.status).toBeNull();
    });
  });

  describe('triggerSync', () => {
    it('should trigger sync and refresh status', async () => {
      const mockResult = {
        success: true,
        status: 'idle',
        changes: { added: [], modified: [], deleted: [] },
        conflicts: []
      };

      mockSendMessage.mockImplementation((message, callback) => {
        if (message.type === 'TRIGGER_SYNC') {
          callback({ success: true, result: mockResult });
        } else if (message.type === 'GET_SYNC_STATUS') {
          callback({ success: true, status: { status: 'idle' } });
        }
      });

      const { result } = renderHook(() => useSync());

      await act(async () => {
        const syncResult = await result.current.triggerSync();
        expect(syncResult).toEqual(mockResult);
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        { type: 'TRIGGER_SYNC', direction: undefined },
        expect.any(Function)
      );
    });

    it('should trigger sync with specific direction', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        callback({ success: true, result: {} });
      });

      const { result } = renderHook(() => useSync());

      await act(async () => {
        await result.current.triggerSync('to-github');
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        { type: 'TRIGGER_SYNC', direction: 'to-github' },
        expect.any(Function)
      );
    });

    it('should handle sync failure', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        if (message.type === 'TRIGGER_SYNC') {
          callback({ success: false, error: 'Sync failed' });
        }
      });

      const { result } = renderHook(() => useSync());

      await act(async () => {
        const syncResult = await result.current.triggerSync();
        expect(syncResult).toBeNull();
      });

      expect(result.current.error).toBe('Sync failed');
    });
  });

  describe('resolveConflicts', () => {
    it('should resolve conflicts with strategy', async () => {
      const mockResult = {
        success: true,
        status: 'idle',
        changes: { added: [], modified: [], deleted: [] },
        conflicts: []
      };

      mockSendMessage.mockImplementation((message, callback) => {
        if (message.type === 'RESOLVE_CONFLICTS') {
          callback({ success: true, result: mockResult });
        } else if (message.type === 'GET_SYNC_STATUS') {
          callback({ success: true, status: { status: 'idle' } });
        }
      });

      const { result } = renderHook(() => useSync());

      await act(async () => {
        const resolveResult = await result.current.resolveConflicts('latest-wins');
        expect(resolveResult).toEqual(mockResult);
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        { type: 'RESOLVE_CONFLICTS', strategy: 'latest-wins' },
        expect.any(Function)
      );
    });

    it('should handle conflict resolution failure', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        if (message.type === 'RESOLVE_CONFLICTS') {
          callback({ success: false, error: 'Resolution failed' });
        }
      });

      const { result } = renderHook(() => useSync());

      await act(async () => {
        const resolveResult = await result.current.resolveConflicts('browser-wins');
        expect(resolveResult).toBeNull();
      });

      expect(result.current.error).toBe('Resolution failed');
    });
  });

  describe('computed values', () => {
    it('should compute sync state properties correctly', async () => {
      const mockStatus = {
        status: 'conflicts',
        lastSync: 1234567890,
        queueLength: 2,
        isGitHubConfigured: true,
        totalBookmarks: 10
      };

      mockSendMessage.mockImplementation((message, callback) => {
        if (message.type === 'GET_SYNC_STATUS') {
          callback({ success: true, status: mockStatus });
        }
      });

      const { result } = renderHook(() => useSync());

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.isConfigured).toBe(true);
      expect(result.current.hasConflicts).toBe(true);
      expect(result.current.isSyncing).toBe(false);
      expect(result.current.totalBookmarks).toBe(10);
      expect(result.current.lastSync).toBe(1234567890);
    });

    it('should handle unconfigured state', async () => {
      mockSendMessage.mockImplementation((message, callback) => {
        if (message.type === 'GET_SYNC_STATUS') {
          callback({ 
            success: true, 
            status: { 
              status: 'idle',
              isGitHubConfigured: false,
              totalBookmarks: 0,
              lastSync: 0
            } 
          });
        }
      });

      const { result } = renderHook(() => useSync());

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.isConfigured).toBe(false);
      expect(result.current.hasConflicts).toBe(false);
      expect(result.current.totalBookmarks).toBe(0);
      expect(result.current.lastSync).toBe(0);
    });
  });
});