import { describe, it, expect } from 'vitest';
import { BookmarkManager } from './bookmarks';

describe('Bookmark Stable ID Generation', () => {
  let manager: BookmarkManager;

  beforeEach(() => {
    manager = new BookmarkManager();
  });

  describe('Deterministic ID Generation', () => {
    it('should generate consistent IDs for same URL and title', () => {
      const url = 'https://example.com/page';
      const title = 'Example Page';
      
      // Access the private method for testing
      const generateId = (manager as any).generateStableId.bind(manager);
      
      const id1 = generateId(url, title);
      const id2 = generateId(url, title);
      
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^hm_[a-z0-9]+$/);
    });

    it('should generate different IDs for different URLs', () => {
      const title = 'Same Title';
      
      const generateId = (manager as any).generateStableId.bind(manager);
      
      const id1 = generateId('https://example.com/page1', title);
      const id2 = generateId('https://example.com/page2', title);
      
      expect(id1).not.toBe(id2);
    });

    it('should generate different IDs for different titles', () => {
      const url = 'https://example.com/page';
      
      const generateId = (manager as any).generateStableId.bind(manager);
      
      const id1 = generateId(url, 'Title One');
      const id2 = generateId(url, 'Title Two');
      
      expect(id1).not.toBe(id2);
    });

    it('should ignore URL variations that canonicalize to the same', () => {
      const title = 'Test Page';
      
      const generateId = (manager as any).generateStableId.bind(manager);
      
      const id1 = generateId('https://example.com/page', title);
      const id2 = generateId('https://www.example.com/page/', title);
      const id3 = generateId('https://example.com/page?utm_source=test', title);
      
      expect(id1).toBe(id2);
      expect(id1).toBe(id3);
    });

    it('should ignore title variations that normalize to the same', () => {
      const url = 'https://example.com/page';
      
      const generateId = (manager as any).generateStableId.bind(manager);
      
      const id1 = generateId(url, 'Test Page');
      const id2 = generateId(url, '  Test   Page  ');
      
      expect(id1).toBe(id2);
    });

    it('should not include timestamps (no time-based variation)', async () => {
      const url = 'https://example.com/test';
      const title = 'Test Bookmark';
      
      const generateId = (manager as any).generateStableId.bind(manager);
      
      // Generate IDs with a delay to ensure timestamps would differ
      const id1 = generateId(url, title);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const id2 = generateId(url, title);
      
      // IDs should be identical despite time difference
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^hm_[a-z0-9]+$/); // Should have format hm_hash (no additional separators)
    });

    it('should handle URLs with various tracking parameters', () => {
      const title = 'Article Title';
      const baseUrl = 'https://example.com/article';
      
      const generateId = (manager as any).generateStableId.bind(manager);
      
      const urls = [
        baseUrl,
        `${baseUrl}?utm_source=social`,
        `${baseUrl}?utm_medium=email&utm_campaign=newsletter`,
        `${baseUrl}?gclid=abc123&fbclid=def456`,
        `${baseUrl}?utm_source=test&normal=keep&ref=twitter`,
      ];
      
      const ids = urls.map(url => generateId(url, title));
      
      // First few should be identical (tracking params removed)
      expect(ids[0]).toBe(ids[1]);
      expect(ids[0]).toBe(ids[2]);
      expect(ids[0]).toBe(ids[3]);
      
      // Last one might differ due to 'normal=keep' parameter
      // But should still be consistent if called again
      const id5Again = generateId(urls[4], title);
      expect(ids[4]).toBe(id5Again);
    });

    it('should handle malformed URLs gracefully', () => {
      const title = 'Test Title';
      
      const generateId = (manager as any).generateStableId.bind(manager);
      
      const malformedUrls = [
        'not-a-url',
        'http://',
        'ftp://example.com',
        'javascript:void(0)',
      ];
      
      malformedUrls.forEach(url => {
        const id = generateId(url, title);
        expect(typeof id).toBe('string');
        expect(id).toMatch(/^hm_[a-z0-9]+$/);
        
        // Should be consistent
        const id2 = generateId(url, title);
        expect(id).toBe(id2);
      });
    });

    it('should produce different IDs than the old timestamp-based method', () => {
      const url = 'https://example.com/test';
      const title = 'Test Page';
      
      const generateId = (manager as any).generateStableId.bind(manager);
      
      // Get new stable ID
      const newId = generateId(url, title);
      
      // Simulate old algorithm (simplified)
      const combined = `${url}::${title}`;
      let hash = 0;
      for (let i = 0; i < combined.length; i++) {
        const char = combined.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      const oldStyleId = `hm_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
      
      expect(newId).not.toBe(oldStyleId);
      expect(newId).toMatch(/^hm_[a-z0-9]+$/); // New IDs have format hm_hash  
      expect(oldStyleId).toMatch(/^hm_[a-z0-9]+_[a-z0-9]+$/); // Old IDs have format hm_hash_timestamp
    });
  });
});