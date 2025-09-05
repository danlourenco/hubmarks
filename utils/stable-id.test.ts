import { describe, it, expect } from 'vitest';
import { 
  generateStableId, 
  canonicalUrl, 
  normalizeTitle, 
  isValidStableId,
  bookmarkContentDiffers,
  generateContentHash
} from './stable-id';

describe('Stable ID Generation', () => {
  describe('canonicalUrl', () => {
    it('should normalize hostnames to lowercase', () => {
      expect(canonicalUrl('https://EXAMPLE.com/path')).toBe('https://example.com/path');
    });

    it('should remove www prefix', () => {
      expect(canonicalUrl('https://www.example.com/path')).toBe('https://example.com/path');
    });

    it('should promote HTTP to HTTPS by default', () => {
      expect(canonicalUrl('http://example.com/path')).toBe('https://example.com/path');
    });

    it('should not promote HTTP to HTTPS when disabled', () => {
      expect(canonicalUrl('http://example.com/path', false)).toBe('http://example.com/path');
    });

    it('should remove hash fragments', () => {
      expect(canonicalUrl('https://example.com/path#section')).toBe('https://example.com/path');
    });

    it('should remove tracking parameters', () => {
      const urlWithTracking = 'https://example.com/path?utm_source=test&utm_medium=email&normal=keep';
      expect(canonicalUrl(urlWithTracking)).toBe('https://example.com/path?normal=keep');
    });

    it('should remove trailing slashes except root', () => {
      expect(canonicalUrl('https://example.com/path/')).toBe('https://example.com/path');
      expect(canonicalUrl('https://example.com/')).toBe('https://example.com/');
    });

    it('should handle invalid URLs gracefully', () => {
      const result = canonicalUrl('not-a-url');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('normalizeTitle', () => {
    it('should trim whitespace', () => {
      expect(normalizeTitle('  Title  ')).toBe('Title');
    });

    it('should collapse multiple spaces', () => {
      expect(normalizeTitle('Title   with    spaces')).toBe('Title with spaces');
    });

    it('should handle empty strings', () => {
      expect(normalizeTitle('')).toBe('');
      expect(normalizeTitle('   ')).toBe('');
    });
  });

  describe('generateStableId', () => {
    it('should generate consistent IDs for same input', async () => {
      const url = 'https://example.com/page';
      const title = 'Example Page';
      
      const id1 = await generateStableId(url, title);
      const id2 = await generateStableId(url, title);
      
      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different URLs', async () => {
      const title = 'Same Title';
      
      const id1 = await generateStableId('https://example.com/page1', title);
      const id2 = await generateStableId('https://example.com/page2', title);
      
      expect(id1).not.toBe(id2);
    });

    it('should generate different IDs for different titles', async () => {
      const url = 'https://example.com/page';
      
      const id1 = await generateStableId(url, 'Title One');
      const id2 = await generateStableId(url, 'Title Two');
      
      expect(id1).not.toBe(id2);
    });

    it('should ignore URL variations that canonicalize to the same', async () => {
      const title = 'Test Page';
      
      const id1 = await generateStableId('https://example.com/page', title);
      const id2 = await generateStableId('https://www.example.com/page/', title);
      const id3 = await generateStableId('http://example.com/page?utm_source=test', title);
      
      expect(id1).toBe(id2);
      expect(id1).toBe(id3);
    });

    it('should ignore title variations that normalize to the same', async () => {
      const url = 'https://example.com/page';
      
      const id1 = await generateStableId(url, 'Test Page');
      const id2 = await generateStableId(url, '  Test   Page  ');
      
      expect(id1).toBe(id2);
    });

    it('should generate valid ID format', async () => {
      const id = await generateStableId('https://example.com', 'Test');
      
      expect(isValidStableId(id)).toBe(true);
      expect(id).toMatch(/^hm_[a-z0-9]{32}$/);
    });
  });

  describe('isValidStableId', () => {
    it('should validate correct ID format', () => {
      expect(isValidStableId('hm_abcdef1234567890abcdef1234567890')).toBe(true);
    });

    it('should reject incorrect formats', () => {
      expect(isValidStableId('invalid')).toBe(false);
      expect(isValidStableId('hm_123')).toBe(false);
      expect(isValidStableId('HM_abcdef1234567890abcdef1234567890')).toBe(false);
      expect(isValidStableId('hm_ABCDEF1234567890ABCDEF1234567890')).toBe(false);
    });
  });

  describe('bookmarkContentDiffers', () => {
    const baseBookmark = {
      title: 'Test',
      url: 'https://example.com',
      folder: 'Folder',
      tags: ['tag1', 'tag2'],
      notes: 'Notes',
      archived: false,
      favorite: false
    };

    it('should return false for identical bookmarks', () => {
      const bookmark2 = { ...baseBookmark };
      expect(bookmarkContentDiffers(baseBookmark, bookmark2)).toBe(false);
    });

    it('should return true for different titles', () => {
      const bookmark2 = { ...baseBookmark, title: 'Different Title' };
      expect(bookmarkContentDiffers(baseBookmark, bookmark2)).toBe(true);
    });

    it('should return true for different URLs', () => {
      const bookmark2 = { ...baseBookmark, url: 'https://different.com' };
      expect(bookmarkContentDiffers(baseBookmark, bookmark2)).toBe(true);
    });

    it('should return true for different tags', () => {
      const bookmark2 = { ...baseBookmark, tags: ['tag1', 'tag3'] };
      expect(bookmarkContentDiffers(baseBookmark, bookmark2)).toBe(true);
    });

    it('should handle tags in different order as same', () => {
      const bookmark2 = { ...baseBookmark, tags: ['tag2', 'tag1'] };
      expect(bookmarkContentDiffers(baseBookmark, bookmark2)).toBe(false);
    });

    it('should return true for different archive status', () => {
      const bookmark2 = { ...baseBookmark, archived: true };
      expect(bookmarkContentDiffers(baseBookmark, bookmark2)).toBe(true);
    });

    it('should handle undefined/empty values correctly', () => {
      const bookmark1 = { ...baseBookmark, tags: undefined as any, notes: undefined as any };
      const bookmark2 = { ...baseBookmark, tags: [], notes: '' };
      expect(bookmarkContentDiffers(bookmark1, bookmark2)).toBe(false);
    });
  });

  describe('generateContentHash', () => {
    it('should generate consistent hashes for same content', async () => {
      const bookmark = {
        title: 'Test',
        url: 'https://example.com',
        folder: 'Folder',
        tags: ['tag1', 'tag2'],
        notes: 'Notes',
        archived: false,
        favorite: false
      };

      const hash1 = await generateContentHash(bookmark);
      const hash2 = await generateContentHash(bookmark);
      
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different content', async () => {
      const bookmark1 = {
        title: 'Test',
        url: 'https://example.com',
        folder: 'Folder',
        tags: ['tag1'],
        notes: '',
        archived: false,
        favorite: false
      };

      const bookmark2 = {
        ...bookmark1,
        title: 'Different Title'
      };

      const hash1 = await generateContentHash(bookmark1);
      const hash2 = await generateContentHash(bookmark2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should generate same hash for tags in different order', async () => {
      const bookmark1 = {
        title: 'Test',
        url: 'https://example.com',
        folder: '',
        tags: ['tag1', 'tag2'],
        notes: '',
        archived: false,
        favorite: false
      };

      const bookmark2 = {
        ...bookmark1,
        tags: ['tag2', 'tag1']
      };

      const hash1 = await generateContentHash(bookmark1);
      const hash2 = await generateContentHash(bookmark2);
      
      expect(hash1).toBe(hash2);
    });
  });
});