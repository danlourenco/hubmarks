# Data Flow Architecture

This document explains how data flows through the HubMark extension during different operations, showing the interaction between utilities and external systems in our JSON-first architecture.

## Overall Data Flow

```mermaid
graph TB
    subgraph "Browser Environment"
        BM[Browser Bookmarks]
        UI[Extension UI]
    end
    
    subgraph "HubMark Extension"
        BMgr[Bookmark Manager]
        SM[Storage Manager] 
        GH[GitHub Client]
        Sync[Sync Manager]
    end
    
    subgraph "External Systems"
        GHRepo[GitHub Repository]
        GHApi[GitHub API]
    end
    
    BM <--> BMgr
    UI <--> BMgr
    UI <--> SM
    BMgr <--> SM
    SM <--> Sync
    Sync <--> GH
    GH <--> GHApi
    GHApi <--> GHRepo
```

## JSON-First Sync Operation Flows

### 1. Browser to GitHub Sync

When a user adds/modifies a bookmark in their browser:

```mermaid
sequenceDiagram
    participant Browser
    participant BookmarkMgr as Bookmark Manager
    participant Storage as Storage Manager
    participant SyncMgr as Sync Manager
    participant GitHub as GitHub Client
    participant GitHubAPI as GitHub API
    
    Browser->>BookmarkMgr: Bookmark change detected
    BookmarkMgr->>BookmarkMgr: Normalize bookmark format
    BookmarkMgr->>BookmarkMgr: Convert to StoredBookmark
    BookmarkMgr->>Storage: Cache StoredBookmarks
    Storage->>SyncMgr: Notify change
    SyncMgr->>BookmarkMgr: Get all bookmarks
    BookmarkMgr->>SyncMgr: Return StoredBookmarks[]
    SyncMgr->>GitHub: Write bookmarks.json
    GitHub->>GitHub: Generate JSON content
    GitHub->>GitHubAPI: Create/update bookmarks.json
    GitHubAPI-->>GitHub: File SHA + metadata
    GitHub->>GitHub: Generate README.md from JSON
    GitHub->>GitHubAPI: Create/update README.md
    GitHubAPI-->>GitHub: README SHA + metadata
    GitHub-->>SyncMgr: Success confirmation
    SyncMgr->>Storage: Update sync timestamp
```

### 2. GitHub to Browser Sync

When bookmarks are modified in the GitHub repository:

```mermaid
sequenceDiagram
    participant GitHubAPI as GitHub API
    participant GitHub as GitHub Client
    participant SyncMgr as Sync Manager
    participant Storage as Storage Manager
    participant BookmarkMgr as Bookmark Manager
    participant Browser
    
    SyncMgr->>GitHub: Check for remote changes
    GitHub->>GitHubAPI: Get bookmarks.json content
    GitHubAPI-->>GitHub: JSON content + SHA
    GitHub->>GitHub: Parse JSON to StoredBookmarks
    GitHub-->>SyncMgr: Parsed StoredBookmarks[]
    SyncMgr->>Storage: Get local bookmarks
    Storage-->>SyncMgr: Cached StoredBookmarks[]
    SyncMgr->>SyncMgr: 3-way merge & conflict resolution
    SyncMgr->>BookmarkMgr: Apply changes to browser
    BookmarkMgr->>Browser: Create/update/delete bookmarks
    BookmarkMgr->>Storage: Update local cache
    SyncMgr->>Storage: Update sync timestamp
```

## Data Format Transformations

### Browser Bookmark → StoredBookmark → GitHub JSON

```mermaid
graph LR
    subgraph "Browser Format"
        A["BrowserBookmark
        id: 'browser123'
        title: 'React Docs'
        url: 'https://reactjs.org'
        parentId: 'folder456'"]
    end
    
    subgraph "Normalized Format"
        B["StoredBookmark
        id: 'hm_abc123_xyz789'
        title: 'React Docs'
        url: 'https://reactjs.org'
        tags: []
        notes: ''
        folder: 'Development'
        archived: false
        favorite: false"]
    end
    
    subgraph "GitHub JSON"
        C["bookmarks.json
        {
          'bookmarks': [
            {
              'id': 'hm_abc123_xyz789',
              'title': 'React Docs',
              'url': 'https://reactjs.org',
              'tags': [],
              'notes': '',
              'folder': 'Development',
              'archived': false,
              'favorite': false
            }
          ]
        }"]
    end
    
    subgraph "Generated Display"
        D["README.md
        # My Bookmarks
        
        ## Development
        - [React Docs](https://reactjs.org)"]
    end
    
    A -->|"normalizedToStored()"| B
    B -->|"JSON.stringify()"| C
    C -->|"generateMarkdownContent()"| D
    C -->|"JSON.parse()"| B
    B -->|"storedToNormalized()"| A
```

## ID Management Flow

### Stable ID Generation and Mapping

```mermaid
graph TB
    subgraph "ID Generation Process"
        A[URL + Title] --> B[Content Hash]
        B --> C[Stable HubMark ID]
        C --> D["hm_a1b2c3_xyz789"]
    end
    
    subgraph "ID Mapping Storage"
        E[Browser ID: 'chrome_123']
        F[HubMark ID: 'hm_a1b2c3_xyz789']
        G[Last Synced: timestamp]
        
        E --- H[ID Mapping]
        F --- H
        G --- H
    end
    
    D --> H
    H --> I[Extension Storage]
```

### Cross-Browser ID Stability

```mermaid
graph LR
    subgraph "Chrome"
        A["Bookmark
        Browser ID: 'chrome_123'
        HubMark ID: 'hm_abc123'"]
    end
    
    subgraph "Firefox"  
        B["Bookmark
        Browser ID: 'ff_xyz789'
        HubMark ID: 'hm_abc123'"]
    end
    
    subgraph "GitHub Repository"
        C["bookmarks.json
        Same bookmark content
        Identified by HubMark ID"]
    end
    
    A -->|Sync| C
    B -->|Sync| C
    C -->|Sync| A
    C -->|Sync| B
```

## Conflict Resolution Flow

### 3-Way Merge Process

```mermaid
graph TB
    A[Local StoredBookmark
    Modified: 1000] --> C{3-Way Merge}
    B[Remote StoredBookmark
    Modified: 2000] --> C
    D[Base StoredBookmark
    Modified: 500] --> C
    
    C -->|Remote Newer| E[Use Remote Version]
    C -->|Local Newer| F[Use Local Version]
    C -->|Same Content| G[No Changes Needed]
    
    E --> H[Update Local Browser & Cache]
    F --> I[Update Remote GitHub JSON]
    G --> J[Mark as Synced]
```

### Conflict Detection Process

```mermaid
sequenceDiagram
    participant SM as Sync Manager
    participant Local as Local Storage
    participant Remote as GitHub Client
    participant BM as Bookmark Manager
    
    SM->>Local: Get cached StoredBookmarks
    Local-->>SM: Local bookmark set
    SM->>Remote: Get bookmarks.json
    Remote-->>SM: Remote StoredBookmarks set
    SM->>SM: Compare by HubMark ID & dateModified
    
    alt Bookmark exists in both
        SM->>SM: Compare dateModified
        alt Remote newer
            SM->>BM: Update browser bookmark
            SM->>Local: Update cache
        else Local newer
            SM->>Remote: Update bookmarks.json
        end
    else Bookmark only local
        SM->>Remote: Add to bookmarks.json
    else Bookmark only remote  
        SM->>BM: Create in browser
        SM->>Local: Add to cache
    end
```

## JSON-First Sync Scheduling

### Automatic Sync Triggers

```mermaid
graph TB
    A[Browser Bookmark Change] --> F[Queue Sync Operation]
    B[Scheduled Interval] --> F
    C[Manual Sync Request] --> F
    D[Extension Startup] --> F
    
    F --> G{Network Available?}
    G -->|Yes| H[Execute JSON-First Sync]
    G -->|No| I[Queue for Later]
    
    H --> J{Sync Success?}
    J -->|Yes| K[Update Last Sync Time]
    J -->|No| L[Retry with Backoff]
    
    I --> M[Network Change Listener]
    M -->|Connected| G
    
    L --> N{Max Retries?}
    N -->|No| O[Wait & Retry]
    N -->|Yes| P[Mark as Failed]
```

## Error Handling Flow

### Network and API Error Recovery

```mermaid
graph TB
    A[JSON API Operation] --> B{Success?}
    B -->|Yes| C[Complete Operation]
    B -->|No| D[Determine Error Type]
    
    D --> E{Error Type}
    E -->|Network| F[Queue for Retry]
    E -->|Auth| G[Prompt Re-auth]
    E -->|Rate Limit| H[Wait & Retry]
    E -->|JSON Schema Invalid| I[Log Error & Skip]
    E -->|Server Error| J[Exponential Backoff]
    
    F --> K[Retry Queue]
    G --> L[User Action Required]
    H --> M[Rate Limit Handler]
    J --> N[Backoff Timer]
    
    K --> A
    M --> A
    N --> A
```

## Storage Layer Interactions

### Extension Storage Usage

```mermaid
graph LR
    subgraph "browser.storage.sync"
        A[GitHub Config
        ~1KB]
        B[User Settings
        ~500B]
        C[Sync Metadata
        ~200B]
    end
    
    subgraph "browser.storage.local"
        D[StoredBookmark Cache
        ~1-5MB]
        E[ID Mappings
        ~100KB]
        F[Sync Queue
        ~50KB]
    end
    
    G[Storage Manager] --> A
    G --> B  
    G --> C
    G --> D
    G --> E
    G --> F
```

### Data Persistence Strategy

```mermaid
graph TB
    A[Extension Operation] --> B{Data Type}
    
    B -->|Settings/Config| C[Sync Storage]
    B -->|StoredBookmarks/Cache| D[Local Storage]
    
    C --> E[Cross-Device Sync]
    D --> F[Device-Specific Cache]
    
    E --> G[Available on All Devices]
    F --> H[Fast Local Access]
    
    I[Browser Sync] --> E
    J[Large Data Sets] --> F
```

## Performance Optimization Flows

### Batch Operations

```mermaid
sequenceDiagram
    participant User
    participant BM as Bookmark Manager
    participant Queue as Operation Queue
    participant GitHub as GitHub Client
    
    User->>BM: Add Bookmark 1
    BM->>Queue: Queue Operation 1
    User->>BM: Add Bookmark 2  
    BM->>Queue: Queue Operation 2
    User->>BM: Add Bookmark 3
    BM->>Queue: Queue Operation 3
    
    Note over Queue: Batch timeout (2s)
    
    Queue->>GitHub: Batch: All bookmarks → bookmarks.json
    GitHub->>GitHub: Generate README.md from JSON
    GitHub-->>Queue: Single commit with both files
    Queue-->>BM: All operations completed
```

### JSON-First Caching Strategy

```mermaid
graph TB
    A[Request Data] --> B{Cache Hit?}
    B -->|Yes| C[Return Cached StoredBookmarks]
    B -->|No| D[Fetch from GitHub JSON]
    
    D --> E[Parse JSON to StoredBookmarks]
    E --> F[Store in Cache]
    F --> G[Set TTL]
    G --> C
    
    H[Cache Invalidation] --> I{Event Type}
    I -->|User Change| J[Invalidate Immediately]
    I -->|Remote Change| K[Refresh on Next Access]
    I -->|TTL Expired| L[Background Refresh]
```

## Benefits of JSON-First Data Flow

### ✅ **Data Integrity**
- Schema validation at every step
- Structured data prevents parsing errors
- Atomic JSON operations

### ✅ **Performance**
- Efficient JSON parsing vs. fragile Markdown parsing
- Single source of truth reduces complexity
- Minimal API calls (write only when changed)

### ✅ **Extensibility**
- Easy to add new bookmark metadata fields
- Multiple output formats from same JSON
- Schema versioning for migrations

### ✅ **Reliability**
- Deterministic conflict resolution
- Complete dataset operations
- 3-way merge prevents data loss

This JSON-first data flow architecture provides a robust, scalable foundation for cross-browser bookmark synchronization while maintaining human-readable display through auto-generated Markdown.