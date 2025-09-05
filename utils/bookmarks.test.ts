import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  BookmarkManager,
  generateBookmarkId,
  validateBookmarkData,
  extractDomain,
  type NormalizedBookmark,
  type BrowserBookmark,
  type SearchOptions,
  type BookmarkChanges
} from './bookmarks';

// Mock browser API
const mockBrowser = {
  bookmarks: {
    getTree: vi.fn(),
    get: vi.fn(),
    getChildren: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
};

// @ts-ignore
global.browser = mockBrowser;

// Mock navigator for browser detection
Object.defineProperty(global.navigator, 'userAgent', {
  value: 'Mozilla/5.0 Chrome/91.0.4472.124',
  configurable: true,
});

describe('BookmarkManager', () => {
  let manager: BookmarkManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBrowser.storage.local.get.mockResolvedValue({});
    manager = new BookmarkManager();
  });

  describe('getAllBookmarks', () => {
    it('should get and normalize all bookmarks from browser', async () => {
      const mockTree: BrowserBookmark[] = [{
        id: 'root',
        title: '',
        children: [
          {
            id: 'bookmarks_bar',
            title: 'Bookmarks Bar',
            children: [
              {
                id: 'folder1',
                title: 'Development',
                children: [
                  {
                    id: 'bm1',
                    title: 'React Docs #react #documentation',
                    url: 'https://reactjs.org',
                    dateAdded: 1234567890000,
                  },
                  {
                    id: 'bm2',
                    title: 'TypeScript (official site)',
                    url: 'https://typescriptlang.org',
                    dateAdded: 1234567891000,
                  }
                ]
              },
              {
                id: 'bm3',
                title: 'GitHub',
                url: 'https://github.com',
                dateAdded: 1234567892000,
              }
            ]
          }
        ]
      }];

      mockBrowser.bookmarks.getTree.mockResolvedValue(mockTree);

      const result = await manager.getAllBookmarks();

      expect(result).toHaveLength(3);
      
      // Check first bookmark with tags
      expect(result[0]).toMatchObject({
        title: 'React Docs',
        url: 'https://reactjs.org',
        folderPath: 'Bookmarks Bar/Development',
        tags: ['react', 'documentation'],
        dateAdded: 1234567890000,
      });

      // Check second bookmark with notes
      expect(result[1]).toMatchObject({
        title: 'TypeScript',
        url: 'https://typescriptlang.org',
        folderPath: 'Bookmarks Bar/Development',
        notes: 'official site',
        dateAdded: 1234567891000,
      });

      // Check third bookmark at root level
      expect(result[2]).toMatchObject({
        title: 'GitHub',
        url: 'https://github.com',
        folderPath: 'Bookmarks Bar',
        dateAdded: 1234567892000,
      });
    });

    it('should handle empty bookmark tree', async () => {
      const mockTree: BrowserBookmark[] = [{
        id: 'root',
        title: '',
        children: []
      }];

      mockBrowser.bookmarks.getTree.mockResolvedValue(mockTree);

      const result = await manager.getAllBookmarks();

      expect(result).toEqual([]);
    });
  });

  describe('searchBookmarks', () => {
    beforeEach(() => {
      const mockTree: BrowserBookmark[] = [{
        id: 'root',
        title: '',
        children: [
          {
            id: 'bookmarks_bar',
            title: 'Bookmarks Bar',
            children: [
              {
                id: 'bm1',
                title: 'React Documentation #react #javascript',
                url: 'https://reactjs.org',
                dateAdded: 1234567890000,
              },
              {
                id: 'bm2',
                title: 'Vue.js Guide #vue #javascript',
                url: 'https://vuejs.org',
                dateAdded: 1234567891000,
              },
              {
                id: 'bm3',
                title: 'GitHub',
                url: 'https://github.com',
                dateAdded: 1234567892000,
              }
            ]
          }
        ]
      }];

      mockBrowser.bookmarks.getTree.mockResolvedValue(mockTree);
    });

    it('should search bookmarks by title', async () => {
      const options: SearchOptions = {
        query: 'react',
        searchIn: ['title']
      };

      const result = await manager.searchBookmarks(options);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('React Documentation');
    });

    it('should search bookmarks by URL', async () => {
      const options: SearchOptions = {
        query: 'github',
        searchIn: ['url']
      };

      const result = await manager.searchBookmarks(options);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://github.com');
    });

    it('should search bookmarks by tags', async () => {
      const options: SearchOptions = {
        query: 'javascript',
        searchIn: ['tags']
      };

      const result = await manager.searchBookmarks(options);

      expect(result).toHaveLength(2);
      expect(result[0].tags).toContain('javascript');
      expect(result[1].tags).toContain('javascript');
    });

    it('should filter by specific tags', async () => {
      const options: SearchOptions = {
        query: '',
        tags: ['vue']
      };

      const result = await manager.searchBookmarks(options);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Vue.js Guide');
    });

    it('should limit search results', async () => {
      const options: SearchOptions = {
        query: '',
        limit: 2
      };

      const result = await manager.searchBookmarks(options);

      expect(result).toHaveLength(2);
    });
  });

  describe('createBookmark', () => {
    it('should create bookmark in browser and return normalized format', async () => {
      const newBookmark: Partial<NormalizedBookmark> = {
        title: 'New Bookmark',
        url: 'https://example.com',
        folderPath: 'Test',  // Changed: Just 'Test', not 'Bookmarks Bar/Test'
        tags: ['test', 'example'],
        notes: 'Test bookmark'
      };

      mockBrowser.bookmarks.getTree.mockResolvedValue([{
        id: 'root',
        title: '',
        children: [{
          id: 'bookmarks_bar',
          title: 'Bookmarks Bar',
          children: []
        }]
      }]);

      mockBrowser.bookmarks.getChildren
        .mockResolvedValueOnce([]); // No Test folder exists in bookmarks bar

      const now = Date.now();
      mockBrowser.bookmarks.create
        .mockResolvedValueOnce({ id: 'test_folder', title: 'Test' }) // Create folder
        .mockResolvedValueOnce({ // Create bookmark
          id: 'new_bm',
          title: 'New Bookmark #test #example (Test bookmark)',
          url: 'https://example.com',
          dateAdded: now,
          parentId: 'test_folder'
        });

      const result = await manager.createBookmark(newBookmark);

      expect(result).toMatchObject({
        title: 'New Bookmark',
        url: 'https://example.com',
        tags: ['test', 'example'],
        notes: 'Test bookmark'
      });

      expect(mockBrowser.bookmarks.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateBookmark', () => {
    it('should update existing bookmark', async () => {
      // Set up ID mapping
      mockBrowser.storage.local.get.mockResolvedValue({
        idMappings: [['browser_id_1', {
          browserId: 'browser_id_1',
          hubmarkId: 'hubmark_id_1',
          lastSynced: Date.now()
        }]]
      });

      // Reinitialize manager to load mappings
      manager = new BookmarkManager();
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait for async init

      const updates = {
        title: 'Updated Title',
        tags: ['updated'],
        notes: 'Updated notes'
      };

      mockBrowser.bookmarks.update.mockResolvedValue({});
      mockBrowser.bookmarks.get.mockResolvedValue([{
        id: 'browser_id_1',
        title: 'Updated Title #updated (Updated notes)',
        url: 'https://example.com',
        dateAdded: Date.now()
      }]);

      const result = await manager.updateBookmark('hubmark_id_1', updates);

      expect(result.title).toBe('Updated Title');
      expect(result.tags).toEqual(['updated']);
      expect(result.notes).toBe('Updated notes');

      expect(mockBrowser.bookmarks.update).toHaveBeenCalledWith(
        'browser_id_1',
        expect.objectContaining({
          title: 'Updated Title #updated (Updated notes)'
        })
      );
    });

    it('should throw error if bookmark not found in mappings', async () => {
      await expect(
        manager.updateBookmark('unknown_id', { title: 'Test' })
      ).rejects.toThrow('Bookmark unknown_id not found in mappings');
    });
  });

  describe('deleteBookmark', () => {
    it('should delete bookmark from browser', async () => {
      // Set up ID mapping
      mockBrowser.storage.local.get.mockResolvedValue({
        idMappings: [['browser_id_1', {
          browserId: 'browser_id_1',
          hubmarkId: 'hubmark_id_1',
          lastSynced: Date.now()
        }]]
      });

      // Reinitialize manager to load mappings
      manager = new BookmarkManager();
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait for async init

      mockBrowser.bookmarks.remove.mockResolvedValue();

      await manager.deleteBookmark('hubmark_id_1');

      expect(mockBrowser.bookmarks.remove).toHaveBeenCalledWith('browser_id_1');
      expect(mockBrowser.storage.local.set).toHaveBeenCalled();
    });

    it('should throw error if bookmark not found', async () => {
      await expect(
        manager.deleteBookmark('unknown_id')
      ).rejects.toThrow('Bookmark unknown_id not found in mappings');
    });
  });

  describe('detectChanges', () => {
    it('should detect added, modified, and deleted bookmarks', () => {
      const oldBookmarks: NormalizedBookmark[] = [
        {
          id: 'bm1',
          title: 'Bookmark 1',
          url: 'https://example1.com',
          folderPath: '',
          tags: [],
          notes: '',
          dateAdded: 1000,
          dateModified: 1000
        },
        {
          id: 'bm2',
          title: 'Bookmark 2',
          url: 'https://example2.com',
          folderPath: '',
          tags: [],
          notes: '',
          dateAdded: 2000,
          dateModified: 2000
        },
        {
          id: 'bm3',
          title: 'Bookmark 3',
          url: 'https://example3.com',
          folderPath: '',
          tags: [],
          notes: '',
          dateAdded: 3000,
          dateModified: 3000
        }
      ];

      const newBookmarks: NormalizedBookmark[] = [
        {
          id: 'bm1',
          title: 'Bookmark 1 Updated', // Modified
          url: 'https://example1.com',
          folderPath: '',
          tags: [],
          notes: '',
          dateAdded: 1000,
          dateModified: 4000
        },
        {
          id: 'bm3', // bm2 deleted
          title: 'Bookmark 3',
          url: 'https://example3.com',
          folderPath: '',
          tags: [],
          notes: '',
          dateAdded: 3000,
          dateModified: 3000
        },
        {
          id: 'bm4', // Added
          title: 'Bookmark 4',
          url: 'https://example4.com',
          folderPath: '',
          tags: [],
          notes: '',
          dateAdded: 5000,
          dateModified: 5000
        }
      ];

      const changes = manager.detectChanges(oldBookmarks, newBookmarks);

      expect(changes.added).toHaveLength(1);
      expect(changes.added[0].id).toBe('bm4');

      expect(changes.modified).toHaveLength(1);
      expect(changes.modified[0].id).toBe('bm1');

      expect(changes.deleted).toHaveLength(1);
      expect(changes.deleted[0]).toBe('bm2');
    });
  });

  describe('mergeBookmarks', () => {
    it('should merge bookmarks preferring newer versions', () => {
      const browserBookmarks: NormalizedBookmark[] = [
        {
          id: 'bm1',
          browserId: 'browser_1',
          title: 'Browser Version',
          url: 'https://example.com',
          folderPath: '',
          tags: [],
          notes: '',
          dateAdded: 1000,
          dateModified: 5000 // Newer
        }
      ];

      const githubBookmarks: NormalizedBookmark[] = [
        {
          id: 'bm1',
          title: 'GitHub Version',
          url: 'https://example.com',
          folderPath: '',
          tags: [],
          notes: '',
          dateAdded: 1000,
          dateModified: 3000 // Older
        },
        {
          id: 'bm2',
          title: 'Only in GitHub',
          url: 'https://github-only.com',
          folderPath: '',
          tags: [],
          notes: '',
          dateAdded: 2000,
          dateModified: 2000
        }
      ];

      const merged = manager.mergeBookmarks(browserBookmarks, githubBookmarks);

      expect(merged).toHaveLength(2);

      // Should keep browser version (newer)
      const bm1 = merged.find(b => b.id === 'bm1');
      expect(bm1?.title).toBe('Browser Version');
      expect(bm1?.browserId).toBe('browser_1');

      // Should add GitHub-only bookmark
      const bm2 = merged.find(b => b.id === 'bm2');
      expect(bm2?.title).toBe('Only in GitHub');
    });

    it('should prefer GitHub version when newer', () => {
      const browserBookmarks: NormalizedBookmark[] = [
        {
          id: 'bm1',
          browserId: 'browser_1',
          title: 'Old Browser Version',
          url: 'https://example.com',
          folderPath: '',
          tags: [],
          notes: '',
          dateAdded: 1000,
          dateModified: 2000 // Older
        }
      ];

      const githubBookmarks: NormalizedBookmark[] = [
        {
          id: 'bm1',
          title: 'New GitHub Version',
          url: 'https://example.com',
          folderPath: '',
          tags: ['updated'],
          notes: 'Updated from GitHub',
          dateAdded: 1000,
          dateModified: 5000 // Newer
        }
      ];

      const merged = manager.mergeBookmarks(browserBookmarks, githubBookmarks);

      expect(merged).toHaveLength(1);
      expect(merged[0].title).toBe('New GitHub Version');
      expect(merged[0].tags).toEqual(['updated']);
      expect(merged[0].browserId).toBe('browser_1'); // Preserve browser ID
    });
  });
});

describe('Helper Functions', () => {
  describe('generateBookmarkId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateBookmarkId();
      const id2 = generateBookmarkId();

      expect(id1).toMatch(/^hm_[a-z0-9]+_[a-z0-9]+$/);
      expect(id2).toMatch(/^hm_[a-z0-9]+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('validateBookmarkData', () => {
    it('should validate correct bookmark data', () => {
      const bookmark: Partial<NormalizedBookmark> = {
        title: 'Valid Bookmark',
        url: 'https://example.com',
        tags: ['test']
      };

      expect(validateBookmarkData(bookmark)).toBe(true);
    });

    it('should throw error for missing title', () => {
      const bookmark: Partial<NormalizedBookmark> = {
        url: 'https://example.com'
      };

      expect(() => validateBookmarkData(bookmark)).toThrow('Bookmark title is required');
    });

    it('should throw error for empty title', () => {
      const bookmark: Partial<NormalizedBookmark> = {
        title: '   ',
        url: 'https://example.com'
      };

      expect(() => validateBookmarkData(bookmark)).toThrow('Bookmark title is required');
    });

    it('should throw error for missing URL', () => {
      const bookmark: Partial<NormalizedBookmark> = {
        title: 'Test Bookmark'
      };

      expect(() => validateBookmarkData(bookmark)).toThrow('Bookmark URL is required');
    });

    it('should throw error for invalid URL', () => {
      const bookmark: Partial<NormalizedBookmark> = {
        title: 'Test Bookmark',
        url: 'not-a-valid-url'
      };

      expect(() => validateBookmarkData(bookmark)).toThrow('Invalid bookmark URL');
    });

    it('should throw error for non-array tags', () => {
      const bookmark: any = {
        title: 'Test Bookmark',
        url: 'https://example.com',
        tags: 'not-an-array'
      };

      expect(() => validateBookmarkData(bookmark)).toThrow('Tags must be an array');
    });
  });

  describe('extractDomain', () => {
    it('should extract domain from URL', () => {
      expect(extractDomain('https://www.example.com/path')).toBe('example.com');
      expect(extractDomain('https://subdomain.example.com')).toBe('subdomain.example.com');
      expect(extractDomain('http://example.com:8080')).toBe('example.com');
    });

    it('should handle invalid URLs', () => {
      expect(extractDomain('not-a-url')).toBe('unknown');
      expect(extractDomain('')).toBe('unknown');
    });
  });
});