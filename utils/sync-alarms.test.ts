import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';
import { SyncManager } from './sync';

// Mock dependencies
vi.mock('./storage', () => ({
  storageManager: {
    getGitHubConfig: vi.fn(),
    saveGitHubConfig: vi.fn(),
    getBookmarks: vi.fn(),
    saveBookmarks: vi.fn(),
    getLastSyncTime: vi.fn(),
    setLastSyncTime: vi.fn(),
  }
}));

vi.mock('./bookmarks', () => ({
  bookmarkManager: null
}));

vi.mock('./github', () => ({
  GitHubClient: vi.fn(),
  generateMarkdownContent: vi.fn(),
  parseMarkdownContent: vi.fn(),
}));

describe('SyncManager Chrome Alarms Integration', () => {
  let syncManager: SyncManager;

  beforeEach(() => {
    // Reset fake browser state following WXT best practices
    fakeBrowser.reset();
    
    // Clear all mocks
    vi.clearAllMocks();
    
    // Reset Chrome alarms mocks
    vi.mocked(chrome.alarms.create).mockClear();
    vi.mocked(chrome.alarms.clear).mockClear();
    vi.mocked(chrome.alarms.onAlarm.addListener).mockClear();
    vi.mocked(chrome.alarms.onAlarm.removeListener).mockClear();
    vi.mocked(chrome.alarms.onAlarm.hasListener).mockReturnValue(false);
    
    syncManager = new SyncManager();
  });

  afterEach(() => {
    syncManager.stopScheduledSync();
  });

  describe('Chrome Alarms API Integration', () => {
    it('should use chrome.alarms.create for scheduling', () => {
      const intervalMs = 5 * 60 * 1000; // 5 minutes
      
      syncManager.scheduleSync(intervalMs);
      
      expect(chrome.alarms.create).toHaveBeenCalledWith('hubmark-sync-alarm', {
        delayInMinutes: 5,
        periodInMinutes: 5
      });
      expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalled();
    });

    it('should convert milliseconds to minutes correctly', () => {
      // Test various intervals
      const testCases = [
        { ms: 60000, expectedMinutes: 1 },      // 1 minute
        { ms: 300000, expectedMinutes: 5 },     // 5 minutes  
        { ms: 900000, expectedMinutes: 15 },    // 15 minutes
        { ms: 1800000, expectedMinutes: 30 },   // 30 minutes
        { ms: 30000, expectedMinutes: 1 },      // 30 seconds -> rounds to 1 minute minimum
      ];

      testCases.forEach(({ ms, expectedMinutes }) => {
        vi.clearAllMocks();
        syncManager.scheduleSync(ms);
        
        expect(chrome.alarms.create).toHaveBeenCalledWith('hubmark-sync-alarm', {
          delayInMinutes: expectedMinutes,
          periodInMinutes: expectedMinutes
        });
      });
    });

    it('should use chrome.alarms.clear for stopping', () => {
      // First schedule to set up listener
      syncManager.scheduleSync(60000);
      
      // Verify listener was added and capture it
      expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalled();
      const addListenerCalls = vi.mocked(chrome.alarms.onAlarm.addListener).mock.calls;
      const listener = addListenerCalls[0][0];
      
      // Set up hasListener to return true for this listener
      vi.mocked(chrome.alarms.onAlarm.hasListener).mockImplementation((l) => l === listener);
      
      // Clear mocks to isolate the stop call
      vi.clearAllMocks();
      vi.mocked(chrome.alarms.onAlarm.hasListener).mockImplementation((l) => l === listener);
      
      syncManager.stopScheduledSync();
      
      expect(chrome.alarms.clear).toHaveBeenCalledWith('hubmark-sync-alarm');
      expect(chrome.alarms.onAlarm.removeListener).toHaveBeenCalled();
    });

    it('should handle alarm listener management correctly', () => {
      // Mock that listener already exists
      vi.mocked(chrome.alarms.onAlarm.hasListener).mockReturnValue(true);
      
      syncManager.scheduleSync(60000);
      
      // Should remove existing listener before adding new one
      expect(chrome.alarms.onAlarm.removeListener).toHaveBeenCalled();
      expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalled();
    });

    it('should create unique alarm names for delays', () => {
      // This tests the private createMV3Delay method indirectly
      const syncManagerAny = syncManager as any;
      
      // Call createMV3Delay multiple times (don't await to avoid timeout)
      syncManagerAny.createMV3Delay(100);
      syncManagerAny.createMV3Delay(100);
      
      // Both should create alarms with different names (indicated by multiple calls)
      expect(chrome.alarms.create).toHaveBeenCalledTimes(2);
      expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalledTimes(2);
      
      // Verify they use different alarm names by checking call arguments
      const createCalls = vi.mocked(chrome.alarms.create).mock.calls;
      expect(createCalls.length).toBe(2);
      expect(createCalls[0][0]).toMatch(/^hubmark-delay-\d+-[a-z0-9]+$/);
      expect(createCalls[1][0]).toMatch(/^hubmark-delay-\d+-[a-z0-9]+$/);
      expect(createCalls[0][0]).not.toBe(createCalls[1][0]);
    });

    it('should handle missing Chrome APIs gracefully', () => {
      // Temporarily remove chrome.alarms
      const originalChrome = globalThis.chrome;
      (globalThis as any).chrome = {};
      
      // Should not throw and should log warning
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      syncManager.scheduleSync(60000);
      
      expect(consoleSpy).toHaveBeenCalledWith('Chrome alarms API not available - sync scheduling disabled');
      
      // Restore chrome object
      (globalThis as any).chrome = originalChrome;
      consoleSpy.mockRestore();
    });

    it('should handle stopping when Chrome APIs not available', () => {
      // Temporarily remove chrome.alarms
      const originalChrome = globalThis.chrome;
      (globalThis as any).chrome = {};
      
      // Should not throw
      expect(() => {
        syncManager.stopScheduledSync();
      }).not.toThrow();
      
      // Restore chrome object
      (globalThis as any).chrome = originalChrome;
    });

    it('should handle environment detection for delays', () => {
      const syncManagerAny = syncManager as any;
      
      // Test with Chrome APIs available
      syncManagerAny.createMV3Delay(100);
      expect(chrome.alarms.create).toHaveBeenCalled();
      
      // Clear mocks and temporarily remove chrome.alarms to test fallback
      vi.clearAllMocks();
      const originalChrome = globalThis.chrome;
      (globalThis as any).chrome = {};
      
      // Mock setTimeout to verify fallback behavior
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, delay) => {
        // Immediately call the function for testing purposes
        if (typeof fn === 'function') fn();
        return 1 as any;
      });
      
      // Should fallback to setTimeout
      syncManagerAny.createMV3Delay(100);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100);
      expect(chrome.alarms?.create).toBeUndefined(); // Chrome APIs not available
      
      // Restore
      (globalThis as any).chrome = originalChrome;
      setTimeoutSpy.mockRestore();
    });
  });

  describe('MV3 Compliance', () => {
    it('should not use setInterval or setTimeout for scheduling', () => {
      // Spy on global timer functions to ensure they're not used
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      
      syncManager.scheduleSync(300000); // 5 minutes
      
      // Should use chrome.alarms, not traditional timers
      expect(setIntervalSpy).not.toHaveBeenCalled();
      expect(chrome.alarms.create).toHaveBeenCalled();
      
      setIntervalSpy.mockRestore();
      setTimeoutSpy.mockRestore();
    });

    it('should persist alarm configuration across service worker restarts', () => {
      syncManager.scheduleSync(600000); // 10 minutes
      
      // Verify alarm is configured to repeat
      expect(chrome.alarms.create).toHaveBeenCalledWith('hubmark-sync-alarm', {
        delayInMinutes: 10,
        periodInMinutes: 10 // This ensures the alarm repeats
      });
    });

    it('should handle alarm events correctly', () => {
      syncManager.scheduleSync(60000);
      
      // Get the listener that was added
      const addListenerCalls = vi.mocked(chrome.alarms.onAlarm.addListener).mock.calls;
      expect(addListenerCalls.length).toBe(1);
      
      const alarmListener = addListenerCalls[0][0];
      
      // Mock performSync to track calls
      const performSyncSpy = vi.spyOn(syncManager, 'performSync').mockResolvedValue({
        success: true,
        status: 'idle',
        conflicts: [],
        changes: { added: 0, modified: 0, deleted: 0 },
        errors: [],
        duration: 100
      });
      
      // Simulate alarm firing
      alarmListener({ name: 'hubmark-sync-alarm', scheduledTime: Date.now() });
      
      // Should trigger sync
      expect(performSyncSpy).toHaveBeenCalled();
      
      performSyncSpy.mockRestore();
    });

    it('should ignore non-matching alarms', () => {
      syncManager.scheduleSync(60000);
      
      const addListenerCalls = vi.mocked(chrome.alarms.onAlarm.addListener).mock.calls;
      const alarmListener = addListenerCalls[0][0];
      
      const performSyncSpy = vi.spyOn(syncManager, 'performSync').mockResolvedValue({
        success: true,
        status: 'idle',
        conflicts: [],
        changes: { added: 0, modified: 0, deleted: 0 },
        errors: [],
        duration: 100
      });
      
      // Simulate different alarm firing
      alarmListener({ name: 'other-alarm', scheduledTime: Date.now() });
      
      // Should not trigger sync
      expect(performSyncSpy).not.toHaveBeenCalled();
      
      performSyncSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle sync errors in alarm callbacks gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      syncManager.scheduleSync(60000);
      
      const addListenerCalls = vi.mocked(chrome.alarms.onAlarm.addListener).mock.calls;
      const alarmListener = addListenerCalls[0][0];
      
      // Mock performSync to reject
      vi.spyOn(syncManager, 'performSync').mockRejectedValue(new Error('Sync failed'));
      
      // Should handle error gracefully
      expect(() => {
        alarmListener({ name: 'hubmark-sync-alarm', scheduledTime: Date.now() });
      }).not.toThrow();
      
      // Allow promise to settle
      return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Scheduled sync failed:', expect.any(Error));
        consoleErrorSpy.mockRestore();
      });
    });

    it('should clean up listeners on stop even if removal fails', () => {
      vi.mocked(chrome.alarms.onAlarm.removeListener).mockImplementation(() => {
        throw new Error('Removal failed');
      });
      
      syncManager.scheduleSync(60000);
      
      // Should not throw even if listener removal fails
      expect(() => {
        syncManager.stopScheduledSync();
      }).not.toThrow();
      
      expect(chrome.alarms.clear).toHaveBeenCalled();
    });
  });
});