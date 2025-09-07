import { describe, it, expect } from 'vitest';
import { generateStableId } from './stable-id';

describe('Bookmark Stable ID Generation', () => {
  describe('Deterministic ID Generation', () => {
    it('should generate consistent IDs for same URL and title', async () => {
      const url = 'https://example.com/page';
      const title = 'Example Page';
      
      const id1 = await generateStableId(url, title);
      const id2 = await generateStableId(url, title);
      
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^hm_[a-z0-9]+$/);
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
      const id3 = await generateStableId('https://example.com/page?utm_source=test', title);
      
      expect(id1).toBe(id2);
      expect(id1).toBe(id3);
    });

    it('should ignore title variations that normalize to the same', async () => {
      const url = 'https://example.com/page';
      
      const id1 = await generateStableId(url, 'Test Page');
      const id2 = await generateStableId(url, '  Test   Page  ');
      
      expect(id1).toBe(id2);
    });

    it('should not include timestamps (no time-based variation)', async () => {
      const url = 'https://example.com/test';
      const title = 'Test Bookmark';
      
      // Generate IDs with a delay to ensure timestamps would differ
      const id1 = await generateStableId(url, title);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const id2 = await generateStableId(url, title);
      
      // IDs should be identical despite time difference
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^hm_[a-z0-9]+$/); // Should have format hm_hash (no additional separators)
    });

    it('should handle URLs with various tracking parameters', async () => {
      const title = 'Article Title';
      const baseUrl = 'https://example.com/article';
      
      const urls = [
        baseUrl,
        `${baseUrl}?utm_source=social`,
        `${baseUrl}?utm_medium=email&utm_campaign=newsletter`,
        `${baseUrl}?gclid=abc123&fbclid=def456`,
        `${baseUrl}?utm_source=test&normal=keep&ref=twitter`,
      ];
      
      const ids = await Promise.all(urls.map(url => generateStableId(url, title)));
      
      // First few should be identical (tracking params removed)
      expect(ids[0]).toBe(ids[1]);
      expect(ids[0]).toBe(ids[2]);
      expect(ids[0]).toBe(ids[3]);
      
      // Last one might differ due to 'normal=keep' parameter
      // But should still be consistent if called again
      const id5Again = await generateStableId(urls[4], title);
      expect(ids[4]).toBe(id5Again);
    });

    it('should handle malformed URLs gracefully', async () => {
      const title = 'Test Title';
      
      const malformedUrls = [
        'not-a-url',
        'http://',
        'ftp://example.com',
        'javascript:void(0)',
      ];
      
      for (const url of malformedUrls) {
        const id = await generateStableId(url, title);
        expect(typeof id).toBe('string');
        expect(id).toMatch(/^hm_[a-z0-9]+$/);
        
        // Should be consistent
        const id2 = await generateStableId(url, title);
        expect(id).toBe(id2);
      }
    });

    it('should produce different IDs than the old timestamp-based method', async () => {
      const url = 'https://example.com/test';
      const title = 'Test Page';
      
      // Get new stable ID
      const newId = await generateStableId(url, title);
      
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