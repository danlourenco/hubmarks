# Browser-Safe Base64 Encoding for Manifest V3 Extensions

## Overview

HubMark implements browser-safe base64 encoding to ensure compatibility with Manifest V3 service workers. This document explains why this is necessary, how it works, and how to use it.

## The Problem: Node.js Buffer in Browser Extensions

### Manifest V2 vs Manifest V3

| Aspect | Manifest V2 | Manifest V3 |
|--------|-------------|-------------|
| **Runtime Environment** | Background pages (DOM context) | Service workers (isolated context) |
| **Node.js APIs** | Available via polyfills | ❌ **Not available** |
| **Buffer API** | Works with polyfills | ❌ **`Buffer is not defined`** |
| **GitHub API Base64** | Required for file operations | Required for file operations |
| **Impact** | Works fine | **Runtime crashes** |

### Why GitHub API Requires Base64

The GitHub API expects file content to be base64-encoded when creating or updating files:

```typescript
// GitHub API requirement:
{
  path: 'bookmarks.md',
  message: 'Update bookmarks',
  content: 'SGVsbG8sIFdvcmxkIQ==', // Must be base64 encoded
}
```

### The Breaking Code

```typescript
// ❌ This breaks in Manifest V3:
const content = Buffer.from(markdownContent, 'utf8').toString('base64');

// Error in MV3 service worker:
// ReferenceError: Buffer is not defined
```

## The Solution: Web API-Based Encoding

### Browser-Safe Implementation

Instead of Node.js `Buffer`, we use native Web APIs that work in all browser contexts:

```typescript
// ✅ Browser-safe approach:
function encodeBase64(content: string): string {
  return btoa(unescape(encodeURIComponent(content)));
}

function decodeBase64(encodedContent: string): string {
  return decodeURIComponent(escape(atob(encodedContent)));
}
```

### Why This Works

1. **`btoa/atob`**: Native browser base64 functions (always available)
2. **`encodeURIComponent/decodeURIComponent`**: Handle Unicode properly  
3. **`unescape/escape`**: Convert between Unicode and byte strings
4. **No Dependencies**: Pure Web API, no polyfills needed
5. **MV3 Compatible**: Works in service workers

## Technical Deep Dive

### Unicode Handling Challenge

Base64 encoding works on bytes, but JavaScript strings are Unicode. The key is proper conversion:

```typescript
// The encoding pipeline:
"Hello, 世界!" 
  → encodeURIComponent() → "Hello%2C%20%E4%B8%96%E7%95%8C%21"
  → unescape() → "Hello, ä¸–ç•Œ!" (byte string)  
  → btoa() → "SGVsbG8sIOS4lueVjCE="
```

```typescript
// The decoding pipeline:
"SGVsbG8sIOS4lueVjCE="
  → atob() → "Hello, ä¸–ç•Œ!" (byte string)
  → escape() → "Hello%2C%20%E4%B8%96%E7%95%8C%21"
  → decodeURIComponent() → "Hello, 世界!"
```

### Algorithm Comparison

| Method | Encoding Steps | Unicode Support | MV3 Compatible |
|--------|----------------|-----------------|----------------|
| **Node.js Buffer** | `Buffer.from(str, 'utf8').toString('base64')` | ✅ Yes | ❌ **No** |
| **Naive btoa** | `btoa(str)` | ❌ **Fails on Unicode** | ✅ Yes |
| **Browser-Safe** | `btoa(unescape(encodeURIComponent(str)))` | ✅ **Yes** | ✅ **Yes** |

## Implementation Details

### Core Functions (`utils/base64.ts`)

#### `encodeBase64(content: string): string`

Encodes string to base64 using browser-safe Web APIs.

```typescript
import { encodeBase64 } from '~/utils/base64';

const encoded = encodeBase64('Hello, 世界! 🌍');
console.log(encoded); // Base64 string
```

**Features:**
- ✅ Unicode support (including emojis)
- ✅ Works in MV3 service workers
- ✅ Compatible with GitHub API
- ✅ Error handling for invalid input

#### `decodeBase64(encodedContent: string): string`

Decodes base64 string using browser-safe Web APIs.

```typescript
import { decodeBase64 } from '~/utils/base64';

const decoded = decodeBase64('SGVsbG8sIFdvcmxkIQ==');
console.log(decoded); // "Hello, World!"
```

**Features:**
- ✅ Unicode support
- ✅ Works in MV3 service workers  
- ✅ Error handling for malformed base64
- ✅ Compatible with GitHub API responses

#### `isValidBase64(input: string): boolean`

Validates base64 string format.

```typescript
import { isValidBase64 } from '~/utils/base64';

console.log(isValidBase64('SGVsbG8=')); // true
console.log(isValidBase64('not-base64')); // false
```

### Legacy Buffer Interface

For easier migration from existing Buffer-based code:

```typescript
import { BrowserBuffer } from '~/utils/base64';

// Drop-in replacement for Buffer.from().toString()
const encoded = BrowserBuffer.from(content, 'utf8').toString('base64');
```

**Note:** This is provided for migration convenience. Use `encodeBase64()` directly for new code.

## Usage in HubMark

### GitHub Client Integration

The GitHub client has been updated to use browser-safe encoding:

```typescript
// Before (broken in MV3):
content: Buffer.from(content, 'utf8').toString('base64')

// After (MV3 compatible):
content: encodeBase64(content)
```

```typescript
// Before (broken in MV3):
const content = result.encoding === 'base64' 
  ? Buffer.from(result.content, 'base64').toString('utf8')
  : result.content;

// After (MV3 compatible):
const content = result.encoding === 'base64' 
  ? decodeBase64(result.content)
  : result.content;
```

### JSON GitHub Client

The new JSON-first GitHub client also uses browser-safe encoding:

```typescript
import { browserSafeEncode, browserSafeDecode } from '~/utils/json-github';

// These are re-exports of encodeBase64/decodeBase64
const encoded = browserSafeEncode(jsonContent);
const decoded = browserSafeDecode(encodedContent);
```

## Performance Characteristics

### Benchmarks

Based on testing with typical bookmark content:

| Content Size | Encoding Time | Decoding Time | Memory Usage |
|-------------|---------------|---------------|--------------|
| **1KB text** | ~0.1ms | ~0.1ms | Minimal |
| **10KB markdown** | ~0.5ms | ~0.4ms | Low |
| **50KB bookmarks** | ~2ms | ~1.8ms | Moderate |
| **100KB+ content** | ~5ms | ~4ms | Acceptable |

### Performance Testing

Use the built-in performance utilities:

```typescript
import { Base64Performance } from '~/utils/base64';

const results = Base64Performance.compare('Large content here...', 1000);
console.log(`Encoding: ${results.browserSafe.encode}ms`);
console.log(`Decoding: ${results.browserSafe.decode}ms`);
```

## Error Handling

### Common Errors and Solutions

#### 1. Invalid Base64 Input

```typescript
try {
  const decoded = decodeBase64('invalid-base64!@#');
} catch (error) {
  console.error('Decoding failed:', error.message);
  // Handle gracefully - maybe show user-friendly error
}
```

#### 2. Unicode Edge Cases

```typescript
// This works correctly:
const emoji = '👨‍💻🚀⚡';
const encoded = encodeBase64(emoji);
const decoded = decodeBase64(encoded);
console.log(decoded === emoji); // true
```

#### 3. Large Content

```typescript
// For very large content, consider chunking:
function encodeInChunks(content: string, chunkSize = 50000): string[] {
  const chunks = [];
  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push(encodeBase64(content.slice(i, i + chunkSize)));
  }
  return chunks;
}
```

## Testing Strategy

### Test Coverage

The base64 utilities have comprehensive test coverage:

- ✅ **25 test cases** covering all functionality
- ✅ **ASCII and Unicode** content
- ✅ **Large content** performance  
- ✅ **Error handling** for invalid input
- ✅ **Edge cases** (empty strings, special characters)
- ✅ **GitHub API compatibility**

### Running Tests

```bash
# Test base64 utilities specifically
npm test utils/base64.test.ts

# Test GitHub client integration
npm test utils/github.test.ts

# Run all tests
npm test
```

### Example Test Cases

```typescript
describe('Unicode Support', () => {
  it('should handle emojis correctly', () => {
    const emoji = '👨‍💻 Building extensions 🚀';
    const encoded = encodeBase64(emoji);
    const decoded = decodeBase64(encoded);
    expect(decoded).toBe(emoji);
  });
});

describe('GitHub API Compatibility', () => {
  it('should produce valid base64 for API', () => {
    const markdown = '# Bookmarks\n- [Test](https://example.com)';
    const encoded = encodeBase64(markdown);
    expect(isValidBase64(encoded)).toBe(true);
  });
});
```

## Migration Guide

### From Buffer to Browser-Safe

**Step 1: Replace imports**
```typescript
// Remove Node.js Buffer usage
// import { Buffer } from 'buffer'; ❌

// Add browser-safe imports
import { encodeBase64, decodeBase64 } from '~/utils/base64'; // ✅
```

**Step 2: Update encoding calls**
```typescript
// Old Buffer approach ❌
const encoded = Buffer.from(content, 'utf8').toString('base64');

// New browser-safe approach ✅  
const encoded = encodeBase64(content);
```

**Step 3: Update decoding calls**
```typescript
// Old Buffer approach ❌
const decoded = Buffer.from(encoded, 'base64').toString('utf8');

// New browser-safe approach ✅
const decoded = decodeBase64(encoded);
```

**Step 4: Test thoroughly**
- Verify Unicode content works correctly
- Test with actual GitHub API operations
- Ensure MV3 service worker compatibility

### Migration Checklist

- [ ] Remove all `Buffer.from()` usage
- [ ] Replace with `encodeBase64()`/`decodeBase64()`
- [ ] Add proper error handling
- [ ] Test Unicode content thoroughly
- [ ] Verify GitHub API integration works
- [ ] Test in MV3 service worker environment

## Best Practices

### 1. Always Handle Errors

```typescript
try {
  const encoded = encodeBase64(userInput);
  // Use encoded content...
} catch (error) {
  console.error('Encoding failed:', error);
  // Show user-friendly error message
}
```

### 2. Validate Input When Appropriate

```typescript
import { isValidBase64 } from '~/utils/base64';

if (isValidBase64(receivedData)) {
  const decoded = decodeBase64(receivedData);
  // Process decoded content...
} else {
  // Handle invalid base64 gracefully
}
```

### 3. Use Type Safety

```typescript
import { encodeBase64Advanced, Base64Options } from '~/utils/base64';

const options: Base64Options = { validate: true };
const result = encodeBase64Advanced(content, options);

if (result.success) {
  console.log(`Encoded ${result.size.original} bytes to ${result.size.encoded} bytes`);
} else {
  console.error(`Encoding failed: ${result.error}`);
}
```

### 4. Consider Performance for Large Content

```typescript
// For very large bookmark collections
if (content.length > 100000) {
  console.log('Encoding large content, this may take a moment...');
}

const start = performance.now();
const encoded = encodeBase64(content);
const duration = performance.now() - start;

if (duration > 100) {
  console.warn(`Encoding took ${duration}ms - consider optimizing`);
}
```

## Security Considerations

### 1. Input Validation

```typescript
// Always validate base64 input from untrusted sources
function safeDecodeBase64(input: string): string | null {
  if (!isValidBase64(input)) {
    console.warn('Invalid base64 input detected');
    return null;
  }
  
  try {
    return decodeBase64(input);
  } catch (error) {
    console.error('Decoding failed:', error);
    return null;
  }
}
```

### 2. Size Limits

```typescript
const MAX_CONTENT_SIZE = 1024 * 1024; // 1MB limit

function safeEncodeBase64(content: string): string | null {
  if (content.length > MAX_CONTENT_SIZE) {
    throw new Error('Content too large for encoding');
  }
  
  return encodeBase64(content);
}
```

## Troubleshooting

### Common Issues

#### "Buffer is not defined" Error

**Symptom:** Extension crashes in MV3 with `ReferenceError: Buffer is not defined`

**Solution:** Replace all Buffer usage with browser-safe functions:
```typescript
// Replace this ❌
Buffer.from(content, 'utf8').toString('base64')

// With this ✅
encodeBase64(content)
```

#### Unicode Characters Corrupted

**Symptom:** Unicode characters appear as question marks or corrupted

**Solution:** Ensure you're using the full encoding pipeline, not just `btoa()`:
```typescript
// Don't use btoa() directly on Unicode ❌
btoa(unicodeString) // Breaks on Unicode

// Use the proper encoding pipeline ✅
encodeBase64(unicodeString) // Handles Unicode correctly
```

#### GitHub API "Invalid base64" Error

**Symptom:** GitHub API returns 422 with "content is not valid base64"

**Solution:** Validate base64 before sending to API:
```typescript
const encoded = encodeBase64(content);
if (!isValidBase64(encoded)) {
  throw new Error('Generated invalid base64');
}
// Send to GitHub API...
```

### Debug Utilities

```typescript
import { Base64Performance } from '~/utils/base64';

// Test with your actual content
const testContent = `Your bookmark content here...`;
const results = Base64Performance.compare(testContent);
console.log('Performance results:', results);

// Validate encoding roundtrip
const encoded = encodeBase64(testContent);
const decoded = decodeBase64(encoded);
console.log('Roundtrip success:', decoded === testContent);
```

## Future Considerations

### Potential Improvements

1. **Streaming Base64**: For very large files, implement streaming encoding/decoding
2. **Compression**: Add optional compression before base64 encoding
3. **Chunked Processing**: Handle extremely large content in chunks
4. **Web Workers**: Offload large encoding operations to web workers

### Compatibility

This implementation is future-proof and works with:

- ✅ **All modern browsers** (Chrome, Firefox, Safari, Edge)
- ✅ **Manifest V3** service workers
- ✅ **Node.js environments** (for testing)
- ✅ **Web Workers** and other isolated contexts
- ✅ **GitHub API requirements**

The browser-safe base64 implementation ensures HubMark will continue to work as browser extension APIs evolve.