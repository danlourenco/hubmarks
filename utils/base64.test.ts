import { describe, it, expect } from 'vitest';
import { 
  encodeBase64, 
  decodeBase64, 
  isValidBase64,
  BrowserBuffer,
  Base64Performance,
  encodeBase64Advanced 
} from './base64';

describe('Browser-Safe Base64 Encoding', () => {
  describe('Basic Functionality', () => {
    it('should encode simple ASCII strings correctly', () => {
      const input = 'Hello, World!';
      const expected = 'SGVsbG8sIFdvcmxkIQ==';
      
      const result = encodeBase64(input);
      expect(result).toBe(expected);
    });

    it('should decode simple ASCII strings correctly', () => {
      const input = 'SGVsbG8sIFdvcmxkIQ==';
      const expected = 'Hello, World!';
      
      const result = decodeBase64(input);
      expect(result).toBe(expected);
    });

    it('should handle round-trip encoding/decoding', () => {
      const original = 'This is a test message with various characters: !@#$%^&*()';
      
      const encoded = encodeBase64(original);
      const decoded = decodeBase64(encoded);
      
      expect(decoded).toBe(original);
    });

    it('should encode empty string', () => {
      const result = encodeBase64('');
      expect(result).toBe('');
      
      const decoded = decodeBase64('');
      expect(decoded).toBe('');
    });
  });

  describe('Unicode Support', () => {
    it('should handle Unicode characters correctly', () => {
      const unicodeStrings = [
        'Hello, 世界!',
        'Café ☕',
        '🌍 🌎 🌏',
        'Здравствуй мир',
        'مرحبا بالعالم',
        'こんにちは世界',
        '你好世界',
      ];

      unicodeStrings.forEach(str => {
        const encoded = encodeBase64(str);
        const decoded = decodeBase64(encoded);
        expect(decoded).toBe(str);
      });
    });

    it('should handle emojis and special Unicode characters', () => {
      const emojiString = '👨‍💻 Building extensions with 🚀 and ⚡';
      
      const encoded = encodeBase64(emojiString);
      const decoded = decodeBase64(encoded);
      
      expect(decoded).toBe(emojiString);
      expect(encoded).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    });

    it('should handle mixed ASCII and Unicode', () => {
      const mixed = 'ASCII text with Unicode: 日本語 and emojis: 🎉';
      
      const encoded = encodeBase64(mixed);
      const decoded = decodeBase64(encoded);
      
      expect(decoded).toBe(mixed);
    });
  });

  describe('Large Content', () => {
    it('should handle large strings efficiently', () => {
      // Create a large string (10KB)
      const largeString = 'A'.repeat(10000) + '世界'.repeat(1000);
      
      const start = performance.now();
      const encoded = encodeBase64(largeString);
      const decoded = decodeBase64(encoded);
      const duration = performance.now() - start;
      
      expect(decoded).toBe(largeString);
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should handle markdown content', () => {
      const markdown = `# My Bookmarks

## Development
- [React](https://react.dev) - JavaScript library
- [TypeScript](https://typescriptlang.org) - Typed JavaScript

## Unicode Test
- 日本語のサイト
- Café ☕ Reviews
- 🚀 Space stuff

### Code Examples
\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}! 🌍\`;
}
\`\`\`
`;

      const encoded = encodeBase64(markdown);
      const decoded = decodeBase64(encoded);
      
      expect(decoded).toBe(markdown);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid base64 input', () => {
      const invalidBase64 = 'this-is-not-base64!@#$';
      
      expect(() => decodeBase64(invalidBase64)).toThrow('Failed to decode base64');
    });

    it('should handle malformed base64 gracefully', () => {
      const malformed = 'SGVsbG8'; // Missing padding
      
      // Some browsers are lenient with padding, others strict
      try {
        const result = decodeBase64(malformed + '=');
        expect(typeof result).toBe('string');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Base64 Validation', () => {
    it('should validate correct base64 strings', () => {
      const validBase64Strings = [
        'SGVsbG8=',
        'SGVsbG8sIFdvcmxkIQ==',
        'QQ==',
        '',
      ];

      validBase64Strings.forEach(str => {
        expect(isValidBase64(str)).toBe(true);
      });
    });

    it('should reject invalid base64 strings', () => {
      const invalidBase64Strings = [
        'not-base64',
        'SGVsbG8!',
        'SGVsbG8===', // Too much padding
        'SGVs bG8=', // Space in middle
      ];

      invalidBase64Strings.forEach(str => {
        expect(isValidBase64(str)).toBe(false);
      });
    });
  });

  describe('Legacy Buffer Interface', () => {
    it('should provide Buffer-like interface', () => {
      const content = 'Hello, World!';
      const expected = 'SGVsbG8sIFdvcmxkIQ==';
      
      const result = BrowserBuffer.from(content, 'utf8').toString('base64');
      expect(result).toBe(expected);
    });

    it('should handle Unicode with Buffer interface', () => {
      const content = 'Hello, 世界! 🌍';
      
      const encoded = BrowserBuffer.from(content, 'utf8').toString('base64');
      const decoded = decodeBase64(encoded);
      
      expect(decoded).toBe(content);
    });

    it('should throw error for unsupported encodings', () => {
      expect(() => {
        BrowserBuffer.from('test', 'binary' as any);
      }).toThrow('Only utf8 encoding is supported');

      expect(() => {
        BrowserBuffer.from('test').toString('hex' as any);
      }).toThrow('Only base64 output encoding is supported');
    });
  });

  describe('Advanced Features', () => {
    it('should provide detailed encoding results', () => {
      const content = 'Hello, World!';
      
      const result = encodeBase64Advanced(content);
      
      expect(result.success).toBe(true);
      expect(result.content).toBe('SGVsbG8sIFdvcmxkIQ==');
      expect(result.size.original).toBeGreaterThan(0);
      expect(result.size.encoded).toBeGreaterThan(0);
      expect(result.size.ratio).toBeGreaterThan(1); // Base64 increases size
      expect(result.error).toBeUndefined();
    });

    it('should handle validation options', () => {
      const result = encodeBase64Advanced('', { validate: true });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Content cannot be empty');
    });
  });

  describe('Performance Testing', () => {
    it('should measure performance characteristics', () => {
      const testContent = 'Hello, World! 🌍'.repeat(100);
      
      const results = Base64Performance.compare(testContent, 100);
      
      expect(results.error).toBeNull();
      expect(results.browserSafe.encode).toBeGreaterThan(0);
      expect(results.browserSafe.decode).toBeGreaterThan(0);
      
      // Should complete reasonably quickly (under 50ms for 100 iterations)
      expect(results.browserSafe.encode).toBeLessThan(50);
      expect(results.browserSafe.decode).toBeLessThan(50);
    });
  });

  describe('GitHub API Compatibility', () => {
    it('should produce base64 compatible with GitHub API requirements', () => {
      const markdownContent = `# My Bookmarks

- [Example](https://example.com) - Test bookmark
- [Unicode Site](https://example.com/日本語) - Unicode test
`;

      const encoded = encodeBase64(markdownContent);
      
      // Should be valid base64
      expect(isValidBase64(encoded)).toBe(true);
      
      // Should decode back to original
      const decoded = decodeBase64(encoded);
      expect(decoded).toBe(markdownContent);
      
      // Should not contain newlines (GitHub API requirement)
      expect(encoded).not.toContain('\n');
      expect(encoded).not.toContain('\r');
    });

    it('should handle typical GitHub file sizes', () => {
      // Simulate a large bookmarks file (50KB)
      const bookmarks = Array.from({ length: 1000 }, (_, i) => 
        `- [Bookmark ${i}](https://example${i}.com) - Description with Unicode: 📚\n`
      ).join('');
      
      const start = performance.now();
      const encoded = encodeBase64(bookmarks);
      const decoded = decodeBase64(encoded);
      const duration = performance.now() - start;
      
      expect(decoded).toBe(bookmarks);
      expect(duration).toBeLessThan(500); // Should handle large files efficiently
    });
  });

  describe('Edge Cases', () => {
    it('should handle strings with only whitespace', () => {
      const whitespaceStrings = [
        ' ',
        '\t',
        '\n',
        '\r\n',
        '   \t\n  ',
      ];

      whitespaceStrings.forEach(str => {
        const encoded = encodeBase64(str);
        const decoded = decodeBase64(encoded);
        expect(decoded).toBe(str);
      });
    });

    it('should handle special characters that might break URL encoding', () => {
      const specialChars = '!@#$%^&*()[]{}|;:,.<>?`~';
      
      const encoded = encodeBase64(specialChars);
      const decoded = decodeBase64(encoded);
      
      expect(decoded).toBe(specialChars);
    });

    it('should handle strings with null bytes (if possible)', () => {
      const withNull = 'Hello\x00World';
      
      const encoded = encodeBase64(withNull);
      const decoded = decodeBase64(encoded);
      
      expect(decoded).toBe(withNull);
    });
  });

  describe('Comparison with Expected Results', () => {
    it('should match expected base64 output for known inputs', () => {
      const testCases = [
        { input: 'A', expected: 'QQ==' },
        { input: 'BC', expected: 'QkM=' },
        { input: 'ABC', expected: 'QUJD' },
        { input: 'Hello', expected: 'SGVsbG8=' },
        { input: 'Hello, World!', expected: 'SGVsbG8sIFdvcmxkIQ==' },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = encodeBase64(input);
        expect(result).toBe(expected);
      });
    });
  });
});