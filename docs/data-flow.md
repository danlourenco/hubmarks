# Data Flow Architecture

This document explains how data flows through the HubMark extension during different operations, showing the interaction between utilities and external systems.

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

## Sync Operation Flows

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
    BookmarkMgr->>Storage: Cache normalized bookmark
    Storage->>SyncMgr: Notify change
    SyncMgr->>BookmarkMgr: Get all bookmarks
    BookmarkMgr->>SyncMgr: Return normalized bookmarks
    SyncMgr->>GitHub: Convert to Markdown
    GitHub->>GitHub: Generate Markdown content
    GitHub->>GitHubAPI: Create/update file
    GitHubAPI-->>GitHub: File SHA + metadata
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
    GitHub->>GitHubAPI: Get file content
    GitHubAPI-->>GitHub: Markdown content
    GitHub->>GitHub: Parse Markdown to bookmarks
    GitHub-->>SyncMgr: Parsed bookmarks
    SyncMgr->>Storage: Get local bookmarks
    Storage-->>SyncMgr: Cached bookmarks
    SyncMgr->>SyncMgr: Detect changes & resolve conflicts
    SyncMgr->>BookmarkMgr: Apply changes to browser
    BookmarkMgr->>Browser: Create/update/delete bookmarks
    BookmarkMgr->>Storage: Update local cache
    SyncMgr->>Storage: Update sync timestamp
```

## Data Format Transformations

### Browser Bookmark → Normalized → GitHub

```mermaid
graph LR
    subgraph "Browser Format"
        A["<b>BrowserBookmark</b><br/>
        id: 'browser123'<br/>
        title: 'React Docs #react (tutorial)'<br/>
        url: 'https://reactjs.org'<br/>
        parentId: 'folder456'"]
    end
    
    subgraph "Normalized Format"
        B["<b>NormalizedBookmark</b><br/>
        id: 'hm_abc123_xyz789'<br/>
        title: 'React Docs'<br/>
        url: 'https://reactjs.org'<br/>
        tags: ['react']<br/>
        notes: 'tutorial'<br/>
        folderPath: 'Development'"]
    end
    
    subgraph "GitHub Format"
        C["<b>Markdown</b><br/>
        ## Development<br/><br/>
        - [React Docs](https://reactjs.org)<br/>
        *Tags: react*<br/>
        *Notes: tutorial*"]
    end
    
    A -->|"Bookmark Manager<br/>extractMetadata()"| B
    B -->|"GitHub Client<br/>generateMarkdown()"| C
    C -->|"GitHub Client<br/>parseMarkdown()"| B
    B -->|"Bookmark Manager<br/>addMetadataToTitle()"| A
```

## ID Management Flow

### Stable ID Generation and Mapping

```mermaid
graph TB
    subgraph "ID Generation Process"
        A[URL + Title] --> B[Content Hash]
        B --> C[Timestamp Suffix]
        C --> D["Stable HubMark ID<br/>hm_a1b2c3_xyz789"]
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
        A["Bookmark<br/>Browser ID: 'chrome_123'<br/>HubMark ID: 'hm_abc123'"]
    end
    
    subgraph "Firefox"  
        B["Bookmark<br/>Browser ID: 'ff_xyz789'<br/>HubMark ID: 'hm_abc123'"]
    end
    
    subgraph "GitHub Repository"
        C["Same bookmark content<br/>Identified by HubMark ID"]
    end
    
    A -->|Sync| C
    B -->|Sync| C
    C -->|Sync| A
    C -->|Sync| B
```

## Conflict Resolution Flow

### Timestamp-Based Resolution

```mermaid
graph TB
    A[Local Bookmark<br/>Modified: 1000] --> C{Compare Timestamps}
    B[Remote Bookmark<br/>Modified: 2000] --> C
    
    C -->|Remote Newer| D[Use Remote Version]
    C -->|Local Newer| E[Use Local Version]
    C -->|Same Time| F[Use Remote Version<br/>Last Writer Wins]
    
    D --> G[Update Local Browser]
    E --> H[Update Remote GitHub]
    F --> G
```

### Conflict Detection Process

```mermaid
sequenceDiagram
    participant SM as Sync Manager
    participant Local as Local Storage
    participant Remote as GitHub Client
    participant BM as Bookmark Manager
    
    SM->>Local: Get cached bookmarks
    Local-->>SM: Local bookmark set
    SM->>Remote: Get remote bookmarks
    Remote-->>SM: Remote bookmark set
    SM->>SM: Compare by HubMark ID
    
    alt Bookmark exists in both
        SM->>SM: Compare dateModified
        alt Remote newer
            SM->>BM: Update browser bookmark
            SM->>Local: Update cache
        else Local newer
            SM->>Remote: Push to GitHub
        end
    else Bookmark only local
        SM->>Remote: Create on GitHub
    else Bookmark only remote  
        SM->>BM: Create in browser
        SM->>Local: Add to cache
    end
```

## Sync Scheduling and Queuing

### Automatic Sync Triggers

```mermaid
graph TB
    A[Browser Bookmark Change] --> F[Queue Sync Operation]
    B[Scheduled Interval] --> F
    C[Manual Sync Request] --> F
    D[Extension Startup] --> F
    
    F --> G{Network Available?}
    G -->|Yes| H[Execute Sync]
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
    A[API Operation] --> B{Success?}
    B -->|Yes| C[Complete Operation]
    B -->|No| D[Determine Error Type]
    
    D --> E{Error Type}
    E -->|Network| F[Queue for Retry]
    E -->|Auth| G[Prompt Re-auth]
    E -->|Rate Limit| H[Wait & Retry]
    E -->|Validation| I[Log Error & Skip]
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
        A[GitHub Config<br/>~1KB]
        B[User Settings<br/>~500B]
        C[Sync Metadata<br/>~200B]
    end
    
    subgraph "browser.storage.local"
        D[Bookmark Cache<br/>~1-5MB]
        E[ID Mappings<br/>~100KB]
        F[Sync Queue<br/>~50KB]
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
    B -->|Bookmarks/Cache| D[Local Storage]
    
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
    
    Queue->>GitHub: Batch: 3 bookmarks → 1 Markdown file
    GitHub-->>Queue: Single commit created
    Queue-->>BM: All operations completed
```

### Caching Strategy

```mermaid
graph TB
    A[Request Data] --> B{Cache Hit?}
    B -->|Yes| C[Return Cached Data]
    B -->|No| D[Fetch from Source]
    
    D --> E[Store in Cache]
    E --> F[Set TTL]
    F --> C
    
    G[Cache Invalidation] --> H{Event Type}
    H -->|User Change| I[Invalidate Immediately]
    H -->|Remote Change| J[Refresh on Next Access]
    H -->|TTL Expired| K[Background Refresh]
```

This data flow documentation provides a comprehensive view of how data moves through the HubMark system, enabling developers to understand the synchronization process, conflict resolution, and performance optimizations.