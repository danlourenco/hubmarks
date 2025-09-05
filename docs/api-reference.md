# API Reference - JSON Storage Architecture

## Overview

This document provides detailed API documentation for the JSON-first storage architecture components.

## Core Modules

### `utils/base64.ts`

#### Functions

##### `encodeBase64(content: string): string`

Browser-safe base64 encoding for MV3 compatibility:

```typescript
import { encodeBase64 } from '~/utils/base64';

const encoded = encodeBase64('Hello, 世界! 🌍');
// Returns: Base64 string compatible with GitHub API
```

**Parameters:**
- `content`: String content to encode (supports Unicode)

**Returns:** Base64 encoded string

**Features:**
- ✅ Works in MV3 service workers (no Node.js Buffer)
- ✅ Handles Unicode characters and emojis correctly
- ✅ Compatible with GitHub API requirements
- ✅ Error handling for invalid input

**Algorithm:**
1. `encodeURIComponent()` - Convert Unicode to percent-encoded UTF-8
2. `unescape()` - Convert percent encoding to byte string
3. `btoa()` - Encode byte string to base64

##### `decodeBase64(encodedContent: string): string`

Browser-safe base64 decoding for MV3 compatibility:

```typescript
import { decodeBase64 } from '~/utils/base64';

const decoded = decodeBase64('SGVsbG8sIFdvcmxkIQ==');
// Returns: "Hello, World!"
```

**Parameters:**
- `encodedContent`: Base64 encoded string to decode

**Returns:** Original string content (with Unicode support)

**Throws:** Error if decoding fails (invalid base64 input)

**Algorithm:**
1. `atob()` - Decode base64 to byte string
2. `escape()` - Convert byte string to percent encoding
3. `decodeURIComponent()` - Convert percent encoding to Unicode

##### `isValidBase64(input: string): boolean`

Validates base64 string format:

```typescript
import { isValidBase64 } from '~/utils/base64';

console.log(isValidBase64('SGVsbG8=')); // true
console.log(isValidBase64('not-base64')); // false
```

**Parameters:**
- `input`: String to validate

**Returns:** True if string appears to be valid base64

##### `BrowserBuffer`

Legacy Buffer-style interface for easier migration:

```typescript
import { BrowserBuffer } from '~/utils/base64';

// Drop-in replacement for Buffer.from().toString()
const encoded = BrowserBuffer.from(content, 'utf8').toString('base64');
```

**Note:** Provided for migration convenience. Use `encodeBase64()` directly for new code.

##### `Base64Performance`

Performance testing utilities:

```typescript
import { Base64Performance } from '~/utils/base64';

const results = Base64Performance.compare(testContent, 1000);
console.log(`Encoding: ${results.browserSafe.encode}ms`);
console.log(`Decoding: ${results.browserSafe.decode}ms`);
```

##### `encodeBase64Advanced(content: string, options?: Base64Options): Base64Result`

Advanced encoding with detailed results:

```typescript
import { encodeBase64Advanced } from '~/utils/base64';

const result = encodeBase64Advanced(content, { validate: true });
if (result.success) {
  console.log(`Encoded ${result.size.original} bytes to ${result.size.encoded} bytes`);
  console.log(`Compression ratio: ${result.size.ratio}`);
} else {
  console.error(`Encoding failed: ${result.error}`);
}
```

#### Interfaces

##### `Base64Options`

Configuration options for advanced base64 operations:

```typescript
interface Base64Options {
  validate?: boolean;     // Whether to validate input before encoding
  lineBreaks?: boolean;   // Whether to add line breaks (not recommended for API usage)
}
```

##### `Base64Result`

Detailed result from advanced base64 operations:

```typescript
interface Base64Result {
  content: string;        // The encoded/decoded content
  success: boolean;       // Whether the operation was successful
  error?: string;         // Error message if operation failed
  size: {                 // Size information
    original: number;     // Original content size in bytes
    encoded: number;      // Encoded content size in bytes
    ratio: number;        // Compression ratio (encoded/original)
  };
}
```

---

### `utils/json-schema.ts`

#### Interfaces

##### `HubMarkBookmark`

Complete bookmark data structure matching JSON schema:

```typescript
interface HubMarkBookmark {
  id: string;           // Stable ID (format: hm_[32-char-hash])
  title: string;        // Bookmark title (minimum 1 character)  
  url: string;          // Valid URL
  folder: string;       // Folder path (can be empty)
  tags: string[];       // Array of tag strings
  notes: string;        // Optional notes (can be empty)
  dateAdded: number;    // Unix timestamp (milliseconds)
  dateModified: number; // Unix timestamp (milliseconds)
  archived: boolean;    // Archive status
  favorite: boolean;    // Favorite status
}
```

##### `HubMarkData`

Complete data structure for JSON file:

```typescript
interface HubMarkData {
  schemaVersion: 1;                    // Schema version (currently 1)
  generatedAt?: string;                // ISO 8601 timestamp
  bookmarks: HubMarkBookmark[];        // Array of bookmarks
  meta?: {                             // Optional metadata
    generator?: string;                // Generator name
    generatorVersion?: string;         // Generator version
    lastSync?: number;                 // Last sync timestamp
    [key: string]: any;               // Additional metadata
  };
}
```

##### `ValidationResult`

Schema validation result:

```typescript
interface ValidationResult {
  valid: boolean;     // Whether data is valid
  errors: string[];   // Array of error messages
}
```

#### Classes

##### `SchemaValidator`

JSON schema validator using Ajv:

**Constructor**
```typescript
new SchemaValidator()
```

**Methods**

###### `validate(data: unknown): ValidationResult`

Validates data against HubMark schema:

```typescript
const result = schemaValidator.validate(data);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

**Parameters:**
- `data`: Data to validate (any type)

**Returns:** `ValidationResult` with validation status and errors

###### `validateOrThrow(data: unknown): asserts data is HubMarkData`

Validates data and throws on error:

```typescript
try {
  schemaValidator.validateOrThrow(data);
  // data is now typed as HubMarkData
} catch (error) {
  console.error('Invalid data:', error.message);
}
```

**Parameters:**
- `data`: Data to validate

**Throws:** Error with detailed validation message if invalid

#### Functions

##### `createEmptyData(): HubMarkData`

Creates valid empty data structure:

```typescript
const emptyData = createEmptyData();
// Returns:
// {
//   schemaVersion: 1,
//   generatedAt: "2023-09-05T12:00:00.000Z", 
//   bookmarks: [],
//   meta: {
//     generator: "HubMark",
//     generatorVersion: "0.1.0",
//     lastSync: 0
//   }
// }
```

#### Constants

##### `schemaValidator: SchemaValidator`

Singleton validator instance ready for use:

```typescript
import { schemaValidator } from '~/utils/json-schema';

const result = schemaValidator.validate(myData);
```

---

### `utils/stable-id.ts`

#### Functions

##### `generateStableId(url: string, title: string, promoteHttps?: boolean): Promise<string>`

Generates deterministic bookmark ID:

```typescript
const id = await generateStableId(
  'https://example.com/page',
  'Example Page'
);
// Returns: "hm_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
```

**Parameters:**
- `url`: Bookmark URL
- `title`: Bookmark title  
- `promoteHttps`: Whether to promote HTTP to HTTPS (default: `true`)

**Returns:** Promise resolving to stable ID string

**Algorithm:**
1. Canonicalize URL using `canonicalUrl()`
2. Normalize title using `normalizeTitle()`  
3. Create composite key: `"${canonicalUrl}\n${normalizedTitle}"`
4. Generate SHA-256 hash
5. Return `"hm_" + hash.substring(0, 32)`

##### `canonicalUrl(rawUrl: string, promoteHttps?: boolean): string`

Canonicalizes URL for consistent matching:

```typescript
const canonical = canonicalUrl('HTTP://www.Example.com/path/?utm_source=test#section');
// Returns: "https://example.com/path"
```

**Parameters:**
- `rawUrl`: Raw URL string
- `promoteHttps`: Whether to promote HTTP to HTTPS (default: `true`)

**Returns:** Canonical URL string

**Transformations:**
- Convert hostname to lowercase
- Remove `www.` prefix
- Promote HTTP to HTTPS (if enabled)
- Remove tracking parameters: `utm_*`, `gclid`, `fbclid`, `ref`, `referrer`, `source`, `_ga`, `_gl`, `mc_cid`, `mc_eid`
- Remove hash fragments  
- Remove trailing slashes (except root path)

##### `normalizeTitle(title: string): string`

Normalizes title for consistent matching:

```typescript
const normalized = normalizeTitle('  Multiple    Spaces   Here  ');
// Returns: "Multiple Spaces Here"
```

**Parameters:**  
- `title`: Raw bookmark title

**Returns:** Normalized title string

**Transformations:**
- Trim leading/trailing whitespace
- Collapse multiple consecutive spaces to single spaces

##### `isValidStableId(id: string): boolean`

Validates stable ID format:

```typescript
const isValid = isValidStableId('hm_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6');
// Returns: true
```

**Parameters:**
- `id`: ID string to validate

**Returns:** `true` if ID matches format `/^hm_[a-z0-9]{32}$/`

##### `bookmarkContentDiffers(a: BookmarkForComparison, b: BookmarkForComparison): boolean`

Compares bookmark content for differences:

```typescript
const differs = bookmarkContentDiffers(bookmark1, bookmark2);
```

**Parameters:**
- `a`: First bookmark for comparison
- `b`: Second bookmark for comparison  

**Returns:** `true` if content differs (ignoring `dateAdded` and `dateModified`)

**Comparison Logic:**
- Compares: `title`, `url`, `folder`, `notes`, `archived`, `favorite`
- Tags compared order-independently
- Normalizes undefined values to defaults

**Interface:**
```typescript
interface BookmarkForComparison {
  title: string;
  url: string;
  folder?: string;
  tags?: string[];
  notes?: string;
  archived?: boolean;
  favorite?: boolean;
}
```

##### `generateContentHash(bookmark: BookmarkForComparison): Promise<string>`

Generates content hash for quick comparison:

```typescript
const hash = await generateContentHash(bookmark);
// Returns: "a1b2c3d4e5f6g7h8" (16-character hash)
```

**Parameters:**
- `bookmark`: Bookmark to hash

**Returns:** Promise resolving to 16-character hex hash string

**Features:**
- Order-independent tag hashing
- Excludes date fields
- Consistent output for identical content

---

### `utils/json-github.ts`

#### Functions

##### `browserSafeEncode(content: string): string`

Browser-safe base64 encoding for MV3:

```typescript
const encoded = browserSafeEncode('Hello, World!');
// Equivalent to btoa(unescape(encodeURIComponent(content)))
```

**Parameters:**
- `content`: String content to encode

**Returns:** Base64 encoded string safe for GitHub API

##### `browserSafeDecode(content: string): string`

Browser-safe base64 decoding for MV3:

```typescript
const decoded = browserSafeDecode(encoded);
// Returns: "Hello, World!"
```

**Parameters:**  
- `content`: Base64 encoded string from GitHub API

**Returns:** Decoded string content

#### Interfaces

##### `BookmarkConflict`

Conflict information for manual resolution:

```typescript
interface BookmarkConflict {
  id: string;                    // Bookmark ID
  local: HubMarkBookmark;        // Local version
  remote: HubMarkBookmark;       // Remote version
  base?: HubMarkBookmark;        // Last known common version
}
```

##### `MergeResult`

Result of 3-way merge operation:

```typescript  
interface MergeResult {
  merged: HubMarkBookmark[];     // Merged bookmark array
  conflicts: BookmarkConflict[]; // Unresolved conflicts
  stats: {                       // Change statistics
    added: number;
    modified: number;
    deleted: number;
  };
}
```

#### Types

##### `ConflictStrategy`

Conflict resolution strategies:

```typescript
type ConflictStrategy = 'latest-wins' | 'local-wins' | 'github-wins' | 'manual';
```

- **`latest-wins`**: Use bookmark with latest `dateModified`
- **`local-wins`**: Always prefer local changes
- **`github-wins`**: Always prefer remote changes  
- **`manual`**: Surface conflicts for user resolution

#### Classes

##### `JSONGitHubClient`

Main client for JSON-first GitHub operations:

**Constructor**
```typescript
const client = new JSONGitHubClient(githubConfig);
```

**Parameters:**
- `githubConfig`: GitHub configuration object

**Methods**

###### `authenticate(): Promise<void>`

Authenticates with GitHub API:

```typescript
await client.authenticate();
```

**Throws:** Error if authentication fails

###### `readBookmarkData(): Promise<{data: HubMarkData, sha?: string}>`

Reads bookmark data from repository:

```typescript
const { data, sha } = await client.readBookmarkData();
```

**Returns:** Object with:
- `data`: HubMark data structure (empty if file doesn't exist)
- `sha`: File SHA for updates (undefined for new files)

**Features:**
- Handles 404 gracefully (returns empty data)
- Validates JSON schema
- Browser-safe base64 decoding

###### `writeBookmarkData(data: HubMarkData, message: string, sha?: string, retries?: number): Promise<string>`

Writes bookmark data with conflict retry:

```typescript
const newSha = await client.writeBookmarkData(
  data,
  'Update bookmarks',
  currentSha,
  3
);
```

**Parameters:**
- `data`: HubMark data to write
- `message`: Commit message
- `sha`: Current file SHA (for updates, omit for creation)
- `retries`: Number of 409 retry attempts (default: 3)

**Returns:** Promise resolving to new file SHA

**Features:**
- Schema validation before writing
- 409 conflict retry with exponential backoff
- Automatic metadata updates (`generatedAt`, `lastSync`)
- Browser-safe base64 encoding

###### `mergeBookmarks(base: HubMarkBookmark[], local: HubMarkBookmark[], remote: HubMarkBookmark[], deletions?: string[], strategy?: ConflictStrategy): Promise<MergeResult>`

Performs 3-way merge with conflict resolution:

```typescript
const result = await client.mergeBookmarks(
  baseBookmarks,
  localChanges, 
  remoteBookmarks,
  ['id1', 'id2'], // IDs to delete
  'latest-wins'
);
```

**Parameters:**
- `base`: Base bookmark state (last known sync)
- `local`: Local bookmark changes
- `remote`: Remote bookmark state  
- `deletions`: Array of bookmark IDs to delete (default: `[]`)
- `strategy`: Conflict resolution strategy (default: `'latest-wins'`)

**Returns:** Promise resolving to `MergeResult`

**Merge Algorithm:**
1. Create maps by bookmark ID for efficient lookup
2. Start with remote state as base
3. Apply deletions
4. Process local changes:
   - New bookmarks: add directly
   - Modified bookmarks: check for conflicts
   - Conflicts: apply resolution strategy
5. Return merged state with conflict information

###### `generateReadme(data: HubMarkData): string`

Generates README.md content from bookmark data:

```typescript
const markdown = client.generateReadme(data);
```

**Parameters:**
- `data`: HubMark data structure

**Returns:** Markdown string for README.md

**Features:**
- Folder-based organization
- Favorite marking (⭐)
- Inline tag display with backticks
- Archived bookmarks in collapsible section
- Generation timestamp and statistics
- Auto-generation notice

###### `updateReadmeIfChanged(data: HubMarkData): Promise<boolean>`

Updates README.md only if content changed:

```typescript
const wasUpdated = await client.updateReadmeIfChanged(data);
```

**Parameters:**
- `data`: HubMark data structure

**Returns:** Promise resolving to `true` if README was updated, `false` if no changes

**Optimization:**
- Compares generated content with existing file
- Only makes API call if content differs
- Creates new file if README doesn't exist

## Usage Examples

### Browser-Safe Base64 Operations

```typescript
import { encodeBase64, decodeBase64, isValidBase64 } from '~/utils/base64';

// Encoding bookmark content for GitHub API
const markdownContent = `# My Bookmarks
- [Example](https://example.com) - Test site with Unicode: 世界 🌍
`;

const encoded = encodeBase64(markdownContent);
console.log('Encoded for GitHub API:', encoded);

// Validate before sending to API
if (isValidBase64(encoded)) {
  // Send to GitHub API...
  console.log('Ready for GitHub API upload');
}

// Decoding content from GitHub API
const decoded = decodeBase64(encoded);
console.log('Decoded content:', decoded);

// Performance testing for large content
import { Base64Performance } from '~/utils/base64';

const largeContent = 'Large bookmark file content...'.repeat(1000);
const results = Base64Performance.compare(largeContent, 100);
console.log(`Encoding 100 iterations: ${results.browserSafe.encode}ms`);
console.log(`Decoding 100 iterations: ${results.browserSafe.decode}ms`);
```

### Complete Sync Operation

```typescript
import { JSONGitHubClient } from '~/utils/json-github';
import { schemaValidator } from '~/utils/json-schema';
import { encodeBase64, decodeBase64 } from '~/utils/base64';

// Initialize client
const client = new JSONGitHubClient(githubConfig);
await client.authenticate();

// Read current state
const { data: remoteData, sha } = await client.readBookmarkData();

// Prepare local changes
const localBookmarks = await getLocalBookmarks();
const baseBookmarks = await getLastSyncState();
const deletions = ['bookmark-id-to-delete'];

// Perform merge
const mergeResult = await client.mergeBookmarks(
  baseBookmarks,
  localBookmarks,
  remoteData.bookmarks,
  deletions,
  'latest-wins'
);

// Handle conflicts
if (mergeResult.conflicts.length > 0) {
  console.log('Conflicts found:', mergeResult.conflicts);
  // Handle manually or with different strategy
  return;
}

// Update data structure
const updatedData = {
  ...remoteData,
  bookmarks: mergeResult.merged
};

// Validate before writing
schemaValidator.validateOrThrow(updatedData);

// Write back to GitHub
const newSha = await client.writeBookmarkData(
  updatedData,
  `sync: +${mergeResult.stats.added} ~${mergeResult.stats.modified} -${mergeResult.stats.deleted}`,
  sha
);

// Update README
await client.updateReadmeIfChanged(updatedData);

console.log('Sync completed successfully');
```

### ID Generation and Validation

```typescript
import { generateStableId, isValidStableId, canonicalUrl } from '~/utils/stable-id';

// Generate ID for new bookmark
const url = 'https://example.com/article?utm_source=social';
const title = '  Amazing   Article  ';

const bookmarkId = await generateStableId(url, title);
console.log('Generated ID:', bookmarkId); // "hm_..."

// Validate ID format
if (!isValidStableId(bookmarkId)) {
  throw new Error('Invalid bookmark ID format');
}

// Check URL canonicalization
const canonical = canonicalUrl(url);
console.log('Canonical URL:', canonical); // "https://example.com/article"
```

### Schema Validation

```typescript
import { schemaValidator, createEmptyData } from '~/utils/json-schema';

// Create valid empty structure
const emptyData = createEmptyData();

// Validate existing data
const result = schemaValidator.validate(existingData);
if (!result.valid) {
  console.error('Schema validation failed:');
  result.errors.forEach(error => console.error('  -', error));
  return;
}

// Use type assertion after validation
schemaValidator.validateOrThrow(existingData);
// existingData is now typed as HubMarkData
```

## Error Handling

### Common Error Patterns

```typescript
import { encodeBase64, decodeBase64, isValidBase64 } from '~/utils/base64';

try {
  const { data } = await client.readBookmarkData();
  schemaValidator.validateOrThrow(data);
  // Process data...
} catch (error) {
  if (error.message.includes('not found')) {
    // Repository or file doesn't exist
    console.log('Creating new bookmark repository');
  } else if (error.message.includes('Schema validation failed')) {
    // Invalid data structure
    console.error('Data corruption detected:', error.message);
  } else if (error.message.includes('Failed to decode base64')) {
    // Base64 decoding error from GitHub API
    console.error('Invalid base64 content from GitHub:', error.message);
  } else if (error.status === 409) {
    // Write conflict (should be handled by retry logic)
    console.warn('Write conflict - retrying...');
  } else if (error.status === 429) {
    // Rate limit
    console.warn('Rate limit exceeded - backing off...');
  } else {
    // Other GitHub API error
    console.error('GitHub API error:', error.message);
  }
}
```

### Base64 Error Handling

```typescript
// Safe base64 encoding with error handling
function safeEncodeForGitHub(content: string): string | null {
  try {
    const encoded = encodeBase64(content);
    
    // Validate the result
    if (!isValidBase64(encoded)) {
      console.error('Generated invalid base64');
      return null;
    }
    
    return encoded;
  } catch (error) {
    console.error('Base64 encoding failed:', error.message);
    return null;
  }
}

// Safe base64 decoding with validation
function safeDecodeFromGitHub(encodedContent: string): string | null {
  // Validate input first
  if (!isValidBase64(encodedContent)) {
    console.error('Invalid base64 format from GitHub API');
    return null;
  }
  
  try {
    return decodeBase64(encodedContent);
  } catch (error) {
    console.error('Base64 decoding failed:', error.message);
    return null;
  }
}
```

### Validation Errors

Schema validation errors provide detailed path information:

```typescript
const result = schemaValidator.validate(invalidData);
// Example errors:
// [
//   "/bookmarks/0/id: must match pattern \"^hm_[a-z0-9]{32}$\"",
//   "/bookmarks/0/title: must NOT have fewer than 1 characters",
//   "/schemaVersion: must be <= 1"
// ]
```

## Performance Notes

### Optimization Guidelines

1. **Conditional Operations**: Always check if changes are needed before API calls
2. **Content Hashing**: Use `generateContentHash()` for quick bookmark comparison
3. **Batch Changes**: Combine multiple bookmark changes into single sync operation
4. **Cache SHA Values**: Store file SHAs in memory during sync operations

### Rate Limiting

GitHub API has rate limits. The client implements:
- **Exponential backoff**: 250ms, 750ms, 2250ms delays
- **Jitter**: Random component to prevent synchronized retries
- **Conditional writes**: Only update files when content changes

### Memory Usage

For large bookmark collections:
- Maps are used for O(1) bookmark lookup by ID
- Content hashing provides quick comparison without deep object comparison
- JSON parsing is more efficient than Markdown parsing