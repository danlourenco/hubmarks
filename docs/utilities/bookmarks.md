# Bookmark Manager Architecture

The Bookmark Manager (`utils/bookmarks.ts`) provides a cross-browser translation layer that abstracts differences between browser bookmark APIs and maintains stable identity across browsers.

## Cross-Browser Translation Layer

```
┌─────────────────────────────────────────────────────────┐
│                Browser APIs (Input)                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │
│  │   Chrome    │ │  Firefox    │ │   Safari/Edge       │ │
│  │ chrome.     │ │  browser.   │ │   browser.          │ │
│  │ bookmarks   │ │  bookmarks  │ │   bookmarks         │ │
│  └─────────────┘ └─────────────┘ └─────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│            Bookmark Manager Translation Layer           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │            Normalized Format                        │ │
│  │  • Stable IDs (content-based hashing)              │ │
│  │  • Unified folder path representation              │ │
│  │  • Metadata extraction (tags, notes)               │ │
│  │  • Browser ID mapping for sync-back                │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                Output Formats                           │
│  ┌─────────────────┐  ┌─────────────────────────────────┐ │
│  │ StoredBookmark  │  │      GitHub Markdown           │ │
│  │ (Extension)     │  │      (Repository)              │ │
│  └─────────────────┘  └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Core Problem Solved

### Browser API Differences

**Chrome (Legacy)**:
```javascript
chrome.bookmarks.getTree((tree) => {
  // Callback-based API
});
```

**Modern Browsers (WebExtensions)**:
```javascript
const tree = await browser.bookmarks.getTree();
// Promise-based API
```

### ID Instability Problem

```javascript
// Browser IDs are ephemeral and browser-specific
Chrome:   { id: "1", title: "React Docs", url: "https://reactjs.org" }
Firefox:  { id: "abc123", title: "React Docs", url: "https://reactjs.org" }

// HubMark IDs are stable and content-based
HubMark: { id: "hm_a1b2c3_xyz789", ... }  // Same across all browsers
```

## Normalized Bookmark Format

```typescript
export interface NormalizedBookmark {
  id: string;           // Stable HubMark ID (content hash)
  browserId?: string;   // Browser-specific ID for sync-back
  title: string;        // Clean title (no metadata)
  url: string;          // Target URL
  folderPath: string;   // Full path: "Development/JavaScript/React"
  tags: string[];       // Extracted from title or separate
  notes: string;        // Additional metadata
  dateAdded: number;    // Creation timestamp
  dateModified: number; // Last modification
  faviconUrl?: string;  // Site favicon
}
```

## Metadata Extraction System

### Title Parsing Strategy

The system extracts metadata from bookmark titles using conventions:

```javascript
// Input: "React Documentation #react #javascript (Official guide)"
// Output:
{
  title: "React Documentation",           // Clean title
  tags: ["react", "javascript"],         // Extracted hashtags
  notes: "Official guide"                 // Parenthetical content
}
```

### Implementation Details

```typescript
private extractMetadata(title: string): { tags: string[]; notes: string } {
  const tags: string[] = [];
  let notes = '';
  
  // Extract hashtags: #react #javascript
  const tagMatches = title.match(/#\w+/g);
  if (tagMatches) {
    tags.push(...tagMatches.map(tag => tag.substring(1).toLowerCase()));
  }
  
  // Extract notes: (content in parentheses)
  const notesMatch = title.match(/\(([^)]+)\)/);
  if (notesMatch) {
    notes = notesMatch[1];
  }
  
  return { tags, notes };
}

private cleanTitle(title: string): string {
  return title
    .replace(/#\w+/g, '')        // Remove hashtags
    .replace(/\([^)]+\)/g, '')   // Remove parentheses
    .trim();
}
```

## Stable ID Generation

### Content-Based Hashing

```typescript
private generateStableId(url: string, title: string): string {
  const combined = `${url}::${title}`;
  let hash = 0;
  
  // Simple hash function for consistent IDs
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return `hm_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
}
```

### ID Mapping System

```typescript
export interface IdMapping {
  browserId: string;    // Browser-specific ID
  hubmarkId: string;    // Stable HubMark ID  
  lastSynced: number;   // Sync timestamp
}
```

The mapping enables:
- **Browser Updates**: Find bookmarks to modify
- **Conflict Resolution**: Track last sync times
- **Migration**: Move between browsers seamlessly

## Folder Path Normalization

### Hierarchical Path Representation

```javascript
// Browser tree structure:
Bookmarks Bar/
  ├── Development/
  │   ├── JavaScript/
  │   │   └── React Docs
  │   └── Python/
  └── Personal/

// Normalized paths:
"Development/JavaScript"  // For React Docs
"Development"            // For Python folder items
"Personal"              // For Personal folder items
""                      // For Bookmarks Bar root items
```

### Folder Creation Logic

```typescript
private async ensureFolderPath(folderPath: string): Promise<string> {
  if (!folderPath) {
    // Return bookmarks bar ID
    const tree = await browser.bookmarks.getTree();
    return tree[0].children![0].id;
  }
  
  const folders = folderPath.split('/').filter(f => f);
  let parentId = /* bookmarks bar ID */;
  
  for (const folderName of folders) {
    // Check if folder exists
    const children = await browser.bookmarks.getChildren(parentId);
    const existing = children.find(child => 
      !child.url && child.title === folderName
    );
    
    if (existing) {
      parentId = existing.id;
    } else {
      // Create folder
      const created = await browser.bookmarks.create({
        parentId,
        title: folderName
      });
      parentId = created.id;
    }
  }
  
  return parentId;
}
```

## Search and Query Operations

### Advanced Search Capabilities

```typescript
export interface SearchOptions {
  query: string;                                    // Text search
  searchIn?: ('title' | 'url' | 'tags' | 'notes')[];  // Search fields
  folder?: string;                                  // Folder filter
  tags?: string[];                                  // Tag filter
  limit?: number;                                   // Result limit
}

async searchBookmarks(options: SearchOptions): Promise<NormalizedBookmark[]> {
  const allBookmarks = await this.getAllBookmarks();
  
  return allBookmarks.filter(bookmark => {
    // Text search across selected fields
    const textMatch = options.searchIn?.some(field => {
      const value = bookmark[field];
      if (typeof value === 'string') {
        return value.toLowerCase().includes(options.query.toLowerCase());
      }
      if (Array.isArray(value)) {
        return value.some(item => 
          item.toLowerCase().includes(options.query.toLowerCase())
        );
      }
      return false;
    });
    
    // Folder filter
    if (options.folder && !bookmark.folderPath.startsWith(options.folder)) {
      return false;
    }
    
    // Tag filter (must have ALL specified tags)
    if (options.tags && options.tags.length > 0) {
      const hasAllTags = options.tags.every(tag => 
        bookmark.tags.includes(tag.toLowerCase())
      );
      if (!hasAllTags) return false;
    }
    
    return textMatch;
  }).slice(0, options.limit);
}
```

## Change Detection and Merging

### Conflict Resolution Strategy

```typescript
mergeBookmarks(
  browserBookmarks: NormalizedBookmark[],
  githubBookmarks: NormalizedBookmark[]
): NormalizedBookmark[] {
  const merged = new Map<string, NormalizedBookmark>();
  
  // Add all browser bookmarks
  browserBookmarks.forEach(bookmark => {
    merged.set(bookmark.id, bookmark);
  });
  
  // Merge GitHub bookmarks with timestamp-based resolution
  githubBookmarks.forEach(githubBookmark => {
    const existing = merged.get(githubBookmark.id);
    
    if (!existing) {
      // New bookmark from GitHub
      merged.set(githubBookmark.id, githubBookmark);
    } else if (githubBookmark.dateModified > existing.dateModified) {
      // GitHub version is newer - prefer it
      merged.set(githubBookmark.id, {
        ...githubBookmark,
        browserId: existing.browserId  // Preserve browser ID
      });
    }
    // Otherwise keep browser version (it's newer)
  });
  
  return Array.from(merged.values());
}
```

### Change Detection

```typescript
detectChanges(
  oldBookmarks: NormalizedBookmark[],
  newBookmarks: NormalizedBookmark[]
): BookmarkChanges {
  const oldMap = new Map(oldBookmarks.map(b => [b.id, b]));
  const newMap = new Map(newBookmarks.map(b => [b.id, b]));
  
  const added: NormalizedBookmark[] = [];
  const modified: NormalizedBookmark[] = [];
  const deleted: string[] = [];
  
  // Find added and modified
  newMap.forEach((bookmark, id) => {
    const old = oldMap.get(id);
    if (!old) {
      added.push(bookmark);
    } else if (this.hasChanged(old, bookmark)) {
      modified.push(bookmark);
    }
  });
  
  // Find deleted
  oldMap.forEach((bookmark, id) => {
    if (!newMap.has(id)) {
      deleted.push(id);
    }
  });
  
  return { added, modified, deleted };
}
```

## Format Conversions

### To StoredBookmark (for GitHub sync)

```typescript
normalizedToStored(normalized: NormalizedBookmark[]): StoredBookmark[] {
  return normalized.map(bookmark => ({
    id: bookmark.id,
    title: bookmark.title,
    url: bookmark.url,
    tags: bookmark.tags.length > 0 ? bookmark.tags : undefined,
    notes: bookmark.notes || undefined,
    folder: bookmark.folderPath || undefined,
    dateAdded: bookmark.dateAdded,
    dateModified: bookmark.dateModified
  }));
}
```

### From StoredBookmark (from GitHub)

```typescript
storedToNormalized(stored: StoredBookmark[]): NormalizedBookmark[] {
  return stored.map(bookmark => ({
    id: bookmark.id,
    title: bookmark.title,
    url: bookmark.url,
    folderPath: bookmark.folder || '',
    tags: bookmark.tags || [],
    notes: bookmark.notes || '',
    dateAdded: bookmark.dateAdded,
    dateModified: bookmark.dateModified
  }));
}
```

## Browser Detection

```typescript
private detectBrowser(): 'chrome' | 'firefox' | 'safari' | 'edge' {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('firefox')) return 'firefox';
  if (userAgent.includes('safari') && !userAgent.includes('chrome')) return 'safari';
  if (userAgent.includes('edg')) return 'edge';
  return 'chrome';
}
```

## Testing Strategy

The Bookmark Manager has 24 comprehensive tests covering:

1. **Browser Tree Parsing**: Complex folder structures
2. **Metadata Extraction**: Tags, notes, clean titles  
3. **Search Operations**: Multi-field, filtering, limits
4. **CRUD Operations**: Create, update, delete bookmarks
5. **Change Detection**: Add/modify/delete scenarios
6. **Conflict Resolution**: Timestamp-based merging
7. **ID Mapping**: Browser-to-HubMark associations
8. **Format Conversion**: Normalized ↔ StoredBookmark
9. **Error Handling**: Missing bookmarks, invalid data

### Mock Browser API

```typescript
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
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn(),
    },
  },
};
```

## Performance Considerations

- **Tree Traversal**: Single pass through bookmark tree
- **ID Mapping**: In-memory Map for O(1) lookups
- **Search**: Efficient filtering with early termination
- **Batch Operations**: Minimize browser API calls
- **Memory Usage**: Lazy loading for large bookmark collections