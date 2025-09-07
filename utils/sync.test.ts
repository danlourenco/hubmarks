import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';
import type { StoredBookmark, GitHubConfig } from './storage';

// Mock all dependencies with factory functions
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
  bookmarkManager: {
    getAllBookmarks: vi.fn(),
    normalizedToStored: vi.fn(),
    storedToNormalized: vi.fn(),
    createBookmark: vi.fn(),
  }
}));

vi.mock('./github', () => ({
  GitHubClient: vi.fn(() => ({
    authenticate: vi.fn(),
    getFileContent: vi.fn(),
    createFile: vi.fn(),
    updateFile: vi.fn(),
  })),
  generateMarkdownContent: vi.fn(() => '# Bookmarks\n\n- [Test](https://example.com)')
}));

// Import after mocking
import { SyncManager, createSyncManager, getSyncManager } from './sync';
import { storageManager } from './storage';
import { bookmarkManager } from './bookmarks';
import { GitHubClient } from './github';

describe('SyncManager', () => {
  let syncManager: SyncManager;

  beforeEach(async () => {
    // Reset fake browser state (WXT best practice)
    fakeBrowser.reset();
    
    vi.clearAllMocks();
    
    // Default mock returns
    vi.mocked(storageManager.getGitHubConfig).mockResolvedValue(null);
    vi.mocked(storageManager.getBookmarks).mockResolvedValue([]);
    vi.mocked(storageManager.getLastSyncTime).mockResolvedValue(0);
    
    syncManager = new SyncManager();
  });

  afterEach(() => {
    // Clean up any intervals
    syncManager.stopScheduledSync();
  });

  describe('initialization', () => {
    it('should initialize without GitHub config', async () => {
      vi.mocked(storageManager.getGitHubConfig).mockResolvedValue(null);
      
      await syncManager.initialize();
      
      expect(storageManager.getGitHubConfig).toHaveBeenCalled();
    });

    it('should initialize with GitHub config', async () => {
      const githubConfig: GitHubConfig = {
        token: 'test-token',
        repoOwner: 'testuser',
        repoName: 'bookmarks'
      };
      
      vi.mocked(storageManager.getGitHubConfig).mockResolvedValue(githubConfig);
      
      await syncManager.initialize();
      
      expect(GitHubClient).toHaveBeenCalledWith(githubConfig);
    });
  });

  describe('performSync', () => {
    it('should fail without GitHub configuration', async () => {
      const result = await syncManager.performSync();
      
      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
      expect(result.errors).toContain('GitHub not configured');
    });

    it('should perform basic sync with GitHub configured', async () => {
      const githubConfig: GitHubConfig = {
        token: 'test-token',
        repoOwner: 'testuser',
        repoName: 'bookmarks'
      };
      
      vi.mocked(storageManager.getGitHubConfig).mockResolvedValue(githubConfig);
      
      // Mock GitHub client methods
      const mockClient = {
        authenticate: vi.fn().mockResolvedValue({ login: 'testuser' }),
        getFileContent: vi.fn().mockRejectedValue(new Error('File not found')),
        createFile: vi.fn().mockResolvedValue({ sha: 'abc123' }),
        updateFile: vi.fn().mockResolvedValue({ sha: 'def456' }),
      };
      
      vi.mocked(GitHubClient).mockImplementation(() => mockClient as any);
      
      await syncManager.initialize();

      // Setup sync mocks
      vi.mocked(storageManager.getBookmarks).mockResolvedValue([]);
      vi.mocked(bookmarkManager.getAllBookmarks).mockResolvedValue([]);
      vi.mocked(bookmarkManager.normalizedToStored).mockReturnValue([]);

      const result = await syncManager.performSync();

      expect(result.success).toBe(true);
      expect(result.status).toBe('idle');
      expect(storageManager.setLastSyncTime).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return current sync status', async () => {
      const bookmarks: StoredBookmark[] = [
        {
          id: 'test1',
          title: 'Test',
          url: 'https://test.com',
          dateAdded: Date.now(),
          dateModified: Date.now(),
        }
      ];

      vi.mocked(storageManager.getLastSyncTime).mockResolvedValue(1234567890);
      vi.mocked(storageManager.getBookmarks).mockResolvedValue(bookmarks);

      const status = await syncManager.getStatus();

      expect(status).toEqual({
        status: 'idle',
        lastSync: 1234567890,
        queueLength: 0,
        isGitHubConfigured: false,
        totalBookmarks: 1,
      });
    });
  });

  describe('scheduleSync', () => {
    it('should schedule and stop sync operations', () => {
      vi.useFakeTimers();
      
      syncManager.scheduleSync(1000);
      syncManager.stopScheduledSync();
      
      // Should not throw and should clean up properly
      expect(() => syncManager.stopScheduledSync()).not.toThrow();
      
      vi.useRealTimers();
    });
  });

  describe('validateSyncState', () => {
    it('should validate sync state and report issues', async () => {
      vi.mocked(bookmarkManager.getAllBookmarks).mockResolvedValue([
        { id: '1', title: 'Browser Bookmark' } as any
      ]);
      vi.mocked(storageManager.getBookmarks).mockResolvedValue([]);

      const validation = await syncManager.validateSyncState();

      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain('GitHub not configured');
      expect(validation.issues).toContain('Browser and cache bookmark count mismatch');
    });
  });
});

describe('Factory Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storageManager.getGitHubConfig).mockResolvedValue(null);
  });

  describe('createSyncManager', () => {
    it('should create and initialize a new sync manager', async () => {
      const manager = await createSyncManager();
      
      expect(manager).toBeInstanceOf(SyncManager);
      expect(storageManager.getGitHubConfig).toHaveBeenCalled();
    });
  });

  describe('getSyncManager', () => {
    it('should return singleton instance', async () => {
      const manager1 = await getSyncManager();
      const manager2 = await getSyncManager();
      
      expect(manager1).toBe(manager2);
      expect(manager1).toBeInstanceOf(SyncManager);
    });
  });
});