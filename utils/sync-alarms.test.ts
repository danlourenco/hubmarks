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
      
      expect(chrome.alarms.create).toHaveBeenCalledWith('hubmark-periodic-sync', {
        periodInMinutes: 5
      });
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
        
        expect(chrome.alarms.create).toHaveBeenCalledWith('hubmark-periodic-sync', {
          periodInMinutes: expectedMinutes
        });
      });
    });

    it('should use chrome.alarms.clear for stopping', () => {
      syncManager.stopScheduledSync();
      
      expect(chrome.alarms.clear).toHaveBeenCalledWith('hubmark-periodic-sync');
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
      expect(chrome.alarms.create).toHaveBeenCalledWith('hubmark-periodic-sync', {
        periodInMinutes: 10 // This ensures the alarm repeats
      });
    });

  });

  describe('Error Handling', () => {
    it('should handle missing chrome.alarms gracefully during stop', () => {
      // Temporarily remove chrome.alarms
      const originalChrome = globalThis.chrome;
      (globalThis as any).chrome = {};
      
      // Should not throw even if Chrome APIs not available
      expect(() => {
        syncManager.stopScheduledSync();
      }).not.toThrow();
      
      // Restore chrome object
      (globalThis as any).chrome = originalChrome;
    });
  });
});