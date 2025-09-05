/**
 * Browser-safe Base64 encoding utilities for Manifest V3 extensions
 * 
 * Replaces Node.js Buffer with Web API-based encoding that works in service workers.
 * This is critical for MV3 compliance where Node.js globals are not available.
 * 
 * @example
 * ```typescript
 * import { encodeBase64, decodeBase64 } from '~/utils/base64';
 * 
 * const encoded = encodeBase64('Hello, 世界!');
 * const decoded = decodeBase64(encoded);
 * ```
 */

/**
 * Encode string to base64 using browser-safe Web APIs
 * 
 * This function handles Unicode strings properly by using the standard
 * Web API approach that works in all browser contexts, including MV3 service workers.
 * 
 * **Algorithm:**
 * 1. `encodeURIComponent()` - Convert Unicode to percent-encoded UTF-8
 * 2. `unescape()` - Convert percent encoding to byte string
 * 3. `btoa()` - Encode byte string to base64
 * 
 * **MV3 Compatibility:**
 * - ✅ Works in service workers (no Node.js Buffer dependency)
 * - ✅ Handles Unicode characters correctly
 * - ✅ Compatible with GitHub API requirements
 * - ✅ No external dependencies or polyfills needed
 * 
 * @param content - String content to encode (supports Unicode)
 * @returns Base64 encoded string
 * @throws {Error} If encoding fails (invalid input)
 * 
 * @example
 * ```typescript
 * const result = encodeBase64('Hello, World!');
 * console.log(result); // "SGVsbG8sIFdvcmxkIQ=="
 * 
 * // Unicode support
 * const unicode = encodeBase64('Hello, 世界! 🌍');
 * console.log(unicode); // Base64 string with proper Unicode encoding
 * ```
 */
export function encodeBase64(content: string): string {
  try {
    // Handle Unicode by converting to percent-encoded UTF-8, then to bytes, then to base64
    return btoa(unescape(encodeURIComponent(content)));
  } catch (error: any) {
    throw new Error(`Failed to encode base64: ${error.message}`);
  }
}

/**
 * Decode base64 string using browser-safe Web APIs
 * 
 * This function properly handles Unicode strings by using the standard
 * Web API approach that works in all browser contexts, including MV3 service workers.
 * 
 * **Algorithm:**
 * 1. `atob()` - Decode base64 to byte string
 * 2. `escape()` - Convert byte string to percent encoding
 * 3. `decodeURIComponent()` - Convert percent encoding to Unicode
 * 
 * **MV3 Compatibility:**
 * - ✅ Works in service workers (no Node.js Buffer dependency)
 * - ✅ Handles Unicode characters correctly
 * - ✅ Compatible with GitHub API responses
 * - ✅ No external dependencies or polyfills needed
 * 
 * @param encodedContent - Base64 encoded string to decode
 * @returns Original string content (with Unicode support)
 * @throws {Error} If decoding fails (invalid base64 input)
 * 
 * @example
 * ```typescript
 * const decoded = decodeBase64('SGVsbG8sIFdvcmxkIQ==');
 * console.log(decoded); // "Hello, World!"
 * 
 * // Unicode support
 * const unicodeDecoded = decodeBase64(someUnicodeBase64);
 * console.log(unicodeDecoded); // "Hello, 世界! 🌍"
 * ```
 */
export function decodeBase64(encodedContent: string): string {
  try {
    // Handle Unicode by converting from base64 to bytes, then to percent encoding, then to Unicode
    return decodeURIComponent(escape(atob(encodedContent)));
  } catch (error: any) {
    throw new Error(`Failed to decode base64: ${error.message}`);
  }
}

/**
 * Check if a string is valid base64 format
 * 
 * This is useful for validating base64 strings before attempting to decode them,
 * which can help prevent errors and provide better error messages.
 * 
 * @param input - String to validate
 * @returns True if string appears to be valid base64
 * 
 * @example
 * ```typescript
 * console.log(isValidBase64('SGVsbG8=')); // true
 * console.log(isValidBase64('not-base64')); // false
 * ```
 */
export function isValidBase64(input: string): boolean {
  try {
    // Check if string matches base64 pattern and can be decoded
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(input)) {
      return false;
    }
    
    // Test actual decoding
    atob(input);
    return true;
  } catch {
    return false;
  }
}

/**
 * Legacy Buffer-style interface for easier migration
 * 
 * Provides a Buffer-like API that works in browser contexts.
 * This makes it easier to migrate existing code that uses Buffer.
 * 
 * @deprecated Use encodeBase64/decodeBase64 directly for new code
 */
export const BrowserBuffer = {
  /**
   * Create base64 encoded string from UTF-8 content
   * 
   * @param content - String content to encode
   * @param encoding - Always 'utf8' (for compatibility)
   * @returns Object with toString method for base64 encoding
   */
  from(content: string, encoding: 'utf8' = 'utf8') {
    if (encoding !== 'utf8') {
      throw new Error('Only utf8 encoding is supported');
    }
    
    return {
      toString(outputEncoding: 'base64') {
        if (outputEncoding !== 'base64') {
          throw new Error('Only base64 output encoding is supported');
        }
        return encodeBase64(content);
      }
    };
  }
};

/**
 * Performance comparison utilities for development/testing
 */
export const Base64Performance = {
  /**
   * Compare performance of browser-safe vs Buffer approach
   * 
   * This is mainly for development purposes to validate that the
   * browser-safe approach has acceptable performance.
   * 
   * @param content - Test content to encode/decode
   * @param iterations - Number of test iterations
   * @returns Performance results
   */
  compare(content: string, iterations: number = 1000) {
    const results = {
      browserSafe: { encode: 0, decode: 0 },
      error: null as string | null
    };
    
    try {
      // Test browser-safe approach
      const encoded = encodeBase64(content);
      
      const start1 = performance.now();
      for (let i = 0; i < iterations; i++) {
        encodeBase64(content);
      }
      results.browserSafe.encode = performance.now() - start1;
      
      const start2 = performance.now();
      for (let i = 0; i < iterations; i++) {
        decodeBase64(encoded);
      }
      results.browserSafe.decode = performance.now() - start2;
      
    } catch (error: any) {
      results.error = error.message;
    }
    
    return results;
  }
};

/**
 * Type definitions for better TypeScript support
 */

/**
 * Base64 encoding options
 */
export interface Base64Options {
  /** Whether to validate input before encoding */
  validate?: boolean;
  /** Whether to add line breaks for readability (not recommended for API usage) */
  lineBreaks?: boolean;
}

/**
 * Base64 operation result
 */
export interface Base64Result {
  /** The encoded/decoded content */
  content: string;
  /** Whether the operation was successful */
  success: boolean;
  /** Error message if operation failed */
  error?: string;
  /** Size information */
  size: {
    /** Original content size in bytes */
    original: number;
    /** Encoded content size in bytes */
    encoded: number;
    /** Compression ratio (encoded/original) */
    ratio: number;
  };
}

/**
 * Advanced base64 encoding with additional options and error handling
 * 
 * @param content - Content to encode
 * @param options - Encoding options
 * @returns Detailed result object
 */
export function encodeBase64Advanced(content: string, options: Base64Options = {}): Base64Result {
  const originalSize = new TextEncoder().encode(content).length;
  
  try {
    if (options.validate && content.length === 0) {
      throw new Error('Content cannot be empty');
    }
    
    const encoded = encodeBase64(content);
    const encodedSize = encoded.length;
    
    return {
      content: encoded,
      success: true,
      size: {
        original: originalSize,
        encoded: encodedSize,
        ratio: encodedSize / originalSize
      }
    };
  } catch (error: any) {
    return {
      content: '',
      success: false,
      error: error.message,
      size: {
        original: originalSize,
        encoded: 0,
        ratio: 0
      }
    };
  }
}