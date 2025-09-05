import { describe, it, expect } from 'vitest';
import { schemaValidator, createEmptyData, HubMarkData, HubMarkBookmark } from './json-schema';

describe('JSON Schema Validation', () => {
  const validBookmark: HubMarkBookmark = {
    id: 'hm_abcdef1234567890abcdef1234567890',
    title: 'Test Bookmark',
    url: 'https://example.com',
    folder: 'Test Folder',
    tags: ['tag1', 'tag2'],
    notes: 'Test notes',
    dateAdded: 1693929600000,
    dateModified: 1693929600000,
    archived: false,
    favorite: true
  };

  const validData: HubMarkData = {
    schemaVersion: 1,
    generatedAt: '2023-09-05T12:00:00.000Z',
    bookmarks: [validBookmark],
    meta: {
      generator: 'HubMark',
      generatorVersion: '0.1.0',
      lastSync: 1693929600000
    }
  };

  describe('Valid data', () => {
    it('should validate complete valid data', () => {
      const result = schemaValidator.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate minimal valid data', () => {
      const minimalData = {
        schemaVersion: 1,
        bookmarks: []
      };
      
      const result = schemaValidator.validate(minimalData);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate data with minimal bookmark', () => {
      const minimalBookmark = {
        id: 'hm_1234567890abcdef1234567890abcdef',
        title: 'Test',
        url: 'https://example.com',
        folder: '',
        tags: [],
        notes: '',
        dateAdded: 1693929600000,
        dateModified: 1693929600000,
        archived: false,
        favorite: false
      };

      const data = {
        schemaVersion: 1,
        bookmarks: [minimalBookmark]
      };

      const result = schemaValidator.validate(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Invalid data', () => {
    it('should reject data without schemaVersion', () => {
      const invalidData = {
        bookmarks: []
      };

      const result = schemaValidator.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('schemaVersion'))).toBe(true);
    });

    it('should reject data without bookmarks array', () => {
      const invalidData = {
        schemaVersion: 1
      };

      const result = schemaValidator.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('bookmarks'))).toBe(true);
    });

    it('should reject invalid schemaVersion', () => {
      const invalidData = {
        schemaVersion: 2,
        bookmarks: []
      };

      const result = schemaValidator.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('<= 1'))).toBe(true);
    });

    it('should reject bookmark without required fields', () => {
      const invalidBookmark = {
        id: 'hm_1234567890abcdef1234567890abcdef',
        title: 'Test'
        // Missing url, dateAdded, dateModified
      };

      const data = {
        schemaVersion: 1,
        bookmarks: [invalidBookmark]
      };

      const result = schemaValidator.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject bookmark with invalid ID format', () => {
      const invalidBookmark = {
        ...validBookmark,
        id: 'invalid-id'
      };

      const data = {
        schemaVersion: 1,
        bookmarks: [invalidBookmark]
      };

      const result = schemaValidator.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('pattern'))).toBe(true);
    });

    it('should reject bookmark with invalid URL', () => {
      const invalidBookmark = {
        ...validBookmark,
        url: 'not-a-url'
      };

      const data = {
        schemaVersion: 1,
        bookmarks: [invalidBookmark]
      };

      const result = schemaValidator.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('format'))).toBe(true);
    });

    it('should reject bookmark with empty title', () => {
      const invalidBookmark = {
        ...validBookmark,
        title: ''
      };

      const data = {
        schemaVersion: 1,
        bookmarks: [invalidBookmark]
      };

      const result = schemaValidator.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('minLength') || e.includes('must NOT have fewer than'))).toBe(true);
    });

    it('should reject bookmark with invalid date values', () => {
      const invalidBookmark = {
        ...validBookmark,
        dateAdded: -1
      };

      const data = {
        schemaVersion: 1,
        bookmarks: [invalidBookmark]
      };

      const result = schemaValidator.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('minimum') || e.includes('>= 0'))).toBe(true);
    });

    it('should reject additional properties in bookmark', () => {
      const invalidBookmark = {
        ...validBookmark,
        extraField: 'should not be allowed'
      };

      const data = {
        schemaVersion: 1,
        bookmarks: [invalidBookmark]
      };

      const result = schemaValidator.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('additionalProperties') || e.includes('must NOT have additional properties'))).toBe(true);
    });
  });

  describe('validateOrThrow', () => {
    it('should not throw for valid data', () => {
      expect(() => schemaValidator.validateOrThrow(validData)).not.toThrow();
    });

    it('should throw for invalid data', () => {
      const invalidData = { invalid: true };
      expect(() => schemaValidator.validateOrThrow(invalidData)).toThrow();
    });

    it('should provide detailed error message', () => {
      const invalidData = {
        schemaVersion: 'invalid',
        bookmarks: 'not an array'
      };

      try {
        schemaValidator.validateOrThrow(invalidData);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Schema validation failed');
        expect(error.message.length).toBeGreaterThan(50); // Should have detailed errors
      }
    });
  });

  describe('createEmptyData', () => {
    it('should create valid empty data structure', () => {
      const emptyData = createEmptyData();
      
      const result = schemaValidator.validate(emptyData);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct structure', () => {
      const emptyData = createEmptyData();
      
      expect(emptyData.schemaVersion).toBe(1);
      expect(emptyData.bookmarks).toEqual([]);
      expect(emptyData.meta?.generator).toBe('HubMark');
      expect(emptyData.meta?.generatorVersion).toBe('0.1.0');
      expect(emptyData.generatedAt).toBeDefined();
      expect(new Date(emptyData.generatedAt!)).toBeInstanceOf(Date);
    });
  });
});