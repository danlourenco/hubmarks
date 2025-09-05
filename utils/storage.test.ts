import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storageManager, type GitHubConfig, type StoredBookmark, type AppSettings } from './storage';

// Mock browser API
const mockBrowser = {
  storage: {
    sync: {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
    },
    local: {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
    },
  },
};

// @ts-ignore
global.browser = mockBrowser;

describe('StorageManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSettings', () => {
    it('should return empty object when no settings exist', async () => {
      mockBrowser.storage.sync.get.mockResolvedValue({});
      
      const settings = await storageManager.getSettings();
      
      expect(settings).toEqual({});
      expect(mockBrowser.storage.sync.get).toHaveBeenCalledWith('settings');
    });

    it('should return stored settings', async () => {
      const mockSettings: AppSettings = {
        github: {
          token: 'test-token',
          repoOwner: 'testuser',
          repoName: 'bookmarks'
        },
        syncInterval: 5000,
        autoSync: true
      };
      
      mockBrowser.storage.sync.get.mockResolvedValue({ settings: mockSettings });
      
      const settings = await storageManager.getSettings();
      
      expect(settings).toEqual(mockSettings);
    });
  });

  describe('saveSettings', () => {
    it('should save settings to sync storage', async () => {
      const settings: AppSettings = {
        autoSync: false,
        syncInterval: 10000
      };
      
      await storageManager.saveSettings(settings);
      
      expect(mockBrowser.storage.sync.set).toHaveBeenCalledWith({ settings });
    });
  });

  describe('getGitHubConfig', () => {
    it('should return null when no GitHub config exists', async () => {
      mockBrowser.storage.sync.get.mockResolvedValue({});
      
      const config = await storageManager.getGitHubConfig();
      
      expect(config).toBeNull();
    });

    it('should return GitHub config when it exists', async () => {
      const mockConfig: GitHubConfig = {
        token: 'test-token',
        repoOwner: 'testuser',
        repoName: 'bookmarks'
      };
      
      mockBrowser.storage.sync.get.mockResolvedValue({
        settings: { github: mockConfig }
      });
      
      const config = await storageManager.getGitHubConfig();
      
      expect(config).toEqual(mockConfig);
    });
  });

  describe('saveGitHubConfig', () => {
    it('should merge GitHub config with existing settings', async () => {
      const existingSettings: AppSettings = {
        autoSync: true,
        syncInterval: 5000
      };
      const newConfig: GitHubConfig = {
        token: 'new-token',
        repoOwner: 'newuser',
        repoName: 'new-bookmarks'
      };
      
      mockBrowser.storage.sync.get.mockResolvedValue({ settings: existingSettings });
      
      await storageManager.saveGitHubConfig(newConfig);
      
      expect(mockBrowser.storage.sync.set).toHaveBeenCalledWith({
        settings: { ...existingSettings, github: newConfig }
      });
    });
  });

  describe('getBookmarks', () => {
    it('should return empty array when no bookmarks exist', async () => {
      mockBrowser.storage.local.get.mockResolvedValue({});
      
      const bookmarks = await storageManager.getBookmarks();
      
      expect(bookmarks).toEqual([]);
      expect(mockBrowser.storage.local.get).toHaveBeenCalledWith('bookmarks');
    });

    it('should return stored bookmarks', async () => {
      const mockBookmarks: StoredBookmark[] = [
        {
          id: '1',
          title: 'Test Bookmark',
          url: 'https://example.com',
          dateAdded: 1234567890,
          dateModified: 1234567890
        }
      ];
      
      mockBrowser.storage.local.get.mockResolvedValue({ bookmarks: mockBookmarks });
      
      const bookmarks = await storageManager.getBookmarks();
      
      expect(bookmarks).toEqual(mockBookmarks);
    });
  });

  describe('saveBookmarks', () => {
    it('should save bookmarks to local storage', async () => {
      const bookmarks: StoredBookmark[] = [
        {
          id: '1',
          title: 'Test Bookmark',
          url: 'https://example.com',
          dateAdded: 1234567890,
          dateModified: 1234567890
        }
      ];
      
      await storageManager.saveBookmarks(bookmarks);
      
      expect(mockBrowser.storage.local.set).toHaveBeenCalledWith({ bookmarks });
    });
  });

  describe('addBookmark', () => {
    it('should add bookmark to existing bookmarks', async () => {
      const existingBookmarks: StoredBookmark[] = [
        {
          id: '1',
          title: 'Existing Bookmark',
          url: 'https://existing.com',
          dateAdded: 1234567890,
          dateModified: 1234567890
        }
      ];
      const newBookmark: StoredBookmark = {
        id: '2',
        title: 'New Bookmark',
        url: 'https://new.com',
        dateAdded: 1234567891,
        dateModified: 1234567891
      };
      
      mockBrowser.storage.local.get.mockResolvedValue({ bookmarks: existingBookmarks });
      
      await storageManager.addBookmark(newBookmark);
      
      expect(mockBrowser.storage.local.set).toHaveBeenCalledWith({
        bookmarks: expect.arrayContaining([
          existingBookmarks[0],
          newBookmark
        ])
      });
      expect(mockBrowser.storage.local.set).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateBookmark', () => {
    it('should update existing bookmark', async () => {
      const existingBookmarks: StoredBookmark[] = [
        {
          id: '1',
          title: 'Original Title',
          url: 'https://original.com',
          dateAdded: 1234567890,
          dateModified: 1234567890
        }
      ];
      
      mockBrowser.storage.local.get.mockResolvedValue({ bookmarks: existingBookmarks });
      
      const updates = { title: 'Updated Title' };
      await storageManager.updateBookmark('1', updates);
      
      expect(mockBrowser.storage.local.set).toHaveBeenCalledWith({
        bookmarks: [{
          ...existingBookmarks[0],
          ...updates,
          dateModified: expect.any(Number)
        }]
      });
    });

    it('should not update if bookmark not found', async () => {
      mockBrowser.storage.local.get.mockResolvedValue({ bookmarks: [] });
      
      await storageManager.updateBookmark('nonexistent', { title: 'New Title' });
      
      expect(mockBrowser.storage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('deleteBookmark', () => {
    it('should remove bookmark by id', async () => {
      const existingBookmarks: StoredBookmark[] = [
        {
          id: '1',
          title: 'Bookmark 1',
          url: 'https://example1.com',
          dateAdded: 1234567890,
          dateModified: 1234567890
        },
        {
          id: '2',
          title: 'Bookmark 2',
          url: 'https://example2.com',
          dateAdded: 1234567891,
          dateModified: 1234567891
        }
      ];
      
      mockBrowser.storage.local.get.mockResolvedValue({ bookmarks: existingBookmarks });
      
      await storageManager.deleteBookmark('1');
      
      expect(mockBrowser.storage.local.set).toHaveBeenCalledWith({
        bookmarks: [existingBookmarks[1]]
      });
    });
  });

  describe('getLastSyncTime', () => {
    it('should return 0 when no sync time exists', async () => {
      mockBrowser.storage.local.get.mockResolvedValue({});
      
      const syncTime = await storageManager.getLastSyncTime();
      
      expect(syncTime).toBe(0);
      expect(mockBrowser.storage.local.get).toHaveBeenCalledWith('lastSyncTime');
    });

    it('should return stored sync time', async () => {
      const timestamp = 1234567890;
      mockBrowser.storage.local.get.mockResolvedValue({ lastSyncTime: timestamp });
      
      const syncTime = await storageManager.getLastSyncTime();
      
      expect(syncTime).toBe(timestamp);
    });
  });

  describe('setLastSyncTime', () => {
    it('should save sync timestamp', async () => {
      const timestamp = Date.now();
      
      await storageManager.setLastSyncTime(timestamp);
      
      expect(mockBrowser.storage.local.set).toHaveBeenCalledWith({ lastSyncTime: timestamp });
    });
  });

  describe('clearAll', () => {
    it('should clear both local and sync storage', async () => {
      await storageManager.clearAll();
      
      expect(mockBrowser.storage.local.clear).toHaveBeenCalled();
      expect(mockBrowser.storage.sync.clear).toHaveBeenCalled();
    });
  });
});