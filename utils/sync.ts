import { storageManager } from './storage';
import { bookmarkManager } from './bookmarks';
import { GitHubClient, generateMarkdownContent, parseMarkdownContent } from './github';
import type { StoredBookmark, GitHubConfig } from './storage';
import type { NormalizedBookmark, BookmarkChanges } from './bookmarks';

/**
 * Sync operation direction
 */
export type SyncDirection = 'bidirectional' | 'to-github' | 'from-github';

/**
 * Sync conflict resolution strategies
 */
export type ConflictStrategy = 'latest-wins' | 'manual' | 'github-wins' | 'local-wins';

/**
 * Sync operation status
 */
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'conflicts';

/**
 * Sync operation configuration
 */
export interface SyncConfig {
  direction: SyncDirection;
  strategy: ConflictStrategy;
  batchSize: number;
  retryAttempts: number;
  retryDelay: number;
}

/**
 * Sync conflict information
 */
export interface SyncConflict {
  bookmarkId: string;
  localBookmark: StoredBookmark;
  remoteBookmark: StoredBookmark;
  conflictType: 'modified' | 'deleted-local' | 'deleted-remote';
}

/**
 * Sync operation result
 */
export interface SyncResult {
  success: boolean;
  status: SyncStatus;
  conflicts: SyncConflict[];
  changes: {
    added: number;
    modified: number;
    deleted: number;
  };
  errors: string[];
  duration: number;
}

/**
 * Queued sync operation
 */
interface QueuedOperation {
  id: string;
  type: 'sync' | 'retry';
  config: SyncConfig;
  timestamp: number;
  attempts: number;
}

/**
 * Sync manager that orchestrates bookmark synchronization between browser and GitHub
 * 
 * Responsibilities:
 * - Coordinate sync operations across all utilities
 * - Handle conflict resolution with multiple strategies  
 * - Manage sync queue and retry logic
 * - Provide progress tracking and error reporting
 * - Schedule periodic sync operations
 */
export class SyncManager {
  private githubClient: GitHubClient | null = null;
  private syncQueue: QueuedOperation[] = [];
  private isProcessingQueue = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private currentSyncPromise: Promise<SyncResult> | null = null;

  private readonly defaultConfig: SyncConfig = {
    direction: 'bidirectional',
    strategy: 'latest-wins',
    batchSize: 50,
    retryAttempts: 3,
    retryDelay: 1000,
  };

  /**
   * Initialize sync manager and set up GitHub client if configured
   */
  async initialize(): Promise<void> {
    try {
      const githubConfig = await storageManager.getGitHubConfig();
      if (githubConfig) {
        this.githubClient = new GitHubClient(githubConfig);
        // Validate GitHub connection
        await this.githubClient.authenticate();
      }
    } catch (error) {
      console.error('Failed to initialize sync manager:', error);
    }
  }

  /**
   * Update GitHub configuration and reinitialize client
   * 
   * @param config - New GitHub configuration
   */
  async updateGitHubConfig(config: GitHubConfig): Promise<void> {
    await storageManager.saveGitHubConfig(config);
    this.githubClient = new GitHubClient(config);
    await this.githubClient.authenticate();
  }

  /**
   * Perform synchronization between browser bookmarks and GitHub
   * 
   * @param config - Sync configuration options
   * @returns Promise that resolves to sync result
   */
  async performSync(config: Partial<SyncConfig> = {}): Promise<SyncResult> {
    const syncConfig = { ...this.defaultConfig, ...config };
    const startTime = Date.now();
    
    // Prevent concurrent syncs
    if (this.currentSyncPromise) {
      return this.currentSyncPromise;
    }

    this.currentSyncPromise = this.executeSync(syncConfig, startTime);
    
    try {
      return await this.currentSyncPromise;
    } finally {
      this.currentSyncPromise = null;
    }
  }

  /**
   * Execute the actual sync operation
   * 
   * @param config - Sync configuration
   * @param startTime - Start timestamp
   * @returns Sync result
   */
  private async executeSync(config: SyncConfig, startTime: number): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      status: 'syncing',
      conflicts: [],
      changes: { added: 0, modified: 0, deleted: 0 },
      errors: [],
      duration: 0,
    };

    try {
      // Ensure GitHub client is available
      if (!this.githubClient) {
        throw new Error('GitHub not configured');
      }

      // Get current state from both sides
      const [localBookmarks, remoteBookmarks] = await Promise.all([
        this.getLocalBookmarks(),
        this.getRemoteBookmarks()
      ]);

      // Detect changes and conflicts
      const changeResults = this.detectChanges(localBookmarks, remoteBookmarks, config.direction);

      // Handle conflicts if any
      if (changeResults.conflicts.length > 0) {
        const resolvedConflicts = await this.resolveConflicts(
          changeResults.conflicts, 
          config.strategy
        );
        result.conflicts = resolvedConflicts.unresolved;
        
        if (result.conflicts.length > 0 && config.strategy === 'manual') {
          result.status = 'conflicts';
          result.success = false;
          return result;
        }
      }

      // Apply changes based on direction
      const changes = await this.applyChanges(changeResults, config);
      result.changes = changes;

      // Update sync timestamp
      await storageManager.setLastSyncTime(Date.now());

      result.success = true;
      result.status = 'idle';
    } catch (error: any) {
      result.errors.push(error.message);
      result.status = 'error';
      console.error('Sync failed:', error);
    } finally {
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Get local bookmarks from browser and storage
   * 
   * @returns Normalized local bookmarks
   */
  private async getLocalBookmarks(): Promise<StoredBookmark[]> {
    if (!bookmarkManager) {
      // Fallback to storage cache if bookmark manager unavailable
      return await storageManager.getBookmarks();
    }

    try {
      const browserBookmarks = await bookmarkManager.getAllBookmarks();
      const storedBookmarks = bookmarkManager.normalizedToStored(browserBookmarks);
      
      // Update local cache
      await storageManager.saveBookmarks(storedBookmarks);
      
      return storedBookmarks;
    } catch (error) {
      console.warn('Failed to get browser bookmarks, using cache:', error);
      return await storageManager.getBookmarks();
    }
  }

  /**
   * Get remote bookmarks from GitHub repository
   * 
   * @returns Remote bookmarks
   */
  private async getRemoteBookmarks(): Promise<StoredBookmark[]> {
    if (!this.githubClient) {
      return [];
    }

    try {
      // Try to get main bookmarks file
      const file = await this.githubClient.getFileContent('bookmarks.md');
      return parseMarkdownContent(file.content);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        // No remote bookmarks yet
        return [];
      }
      throw error;
    }
  }

  /**
   * Detect changes and conflicts between local and remote bookmarks
   * 
   * @param local - Local bookmarks
   * @param remote - Remote bookmarks  
   * @param direction - Sync direction
   * @returns Change detection results
   */
  private detectChanges(
    local: StoredBookmark[],
    remote: StoredBookmark[],
    direction: SyncDirection
  ) {
    const localMap = new Map(local.map(b => [b.id, b]));
    const remoteMap = new Map(remote.map(b => [b.id, b]));
    
    const conflicts: SyncConflict[] = [];
    const toGitHub: StoredBookmark[] = [];
    const fromGitHub: StoredBookmark[] = [];
    const toDelete: string[] = [];

    // Find conflicts and changes
    for (const [id, localBookmark] of localMap) {
      const remoteBookmark = remoteMap.get(id);
      
      if (!remoteBookmark) {
        // Only in local - add to GitHub (unless from-github only)
        if (direction !== 'from-github') {
          toGitHub.push(localBookmark);
        }
      } else if (this.hasConflict(localBookmark, remoteBookmark)) {
        // Exists in both but different - conflict
        conflicts.push({
          bookmarkId: id,
          localBookmark,
          remoteBookmark,
          conflictType: 'modified'
        });
      }
    }

    // Find remote-only bookmarks
    for (const [id, remoteBookmark] of remoteMap) {
      if (!localMap.has(id)) {
        // Only in remote - add to local (unless to-github only)
        if (direction !== 'to-github') {
          fromGitHub.push(remoteBookmark);
        }
      }
    }

    return {
      conflicts,
      toGitHub,
      fromGitHub,
      toDelete
    };
  }

  /**
   * Check if two bookmarks have conflicting changes
   * 
   * @param local - Local bookmark
   * @param remote - Remote bookmark
   * @returns True if conflict exists
   */
  private hasConflict(local: StoredBookmark, remote: StoredBookmark): boolean {
    // Compare modification times and content
    const timeDiff = Math.abs(local.dateModified - remote.dateModified);
    
    // If timestamps are very close (within 1 second), check content
    if (timeDiff < 1000) {
      return this.bookmarksContentDiffers(local, remote);
    }
    
    // If times differ significantly, it's a potential conflict
    return timeDiff > 60000 && this.bookmarksContentDiffers(local, remote);
  }

  /**
   * Compare bookmark content for differences
   * 
   * @param a - First bookmark
   * @param b - Second bookmark
   * @returns True if content differs
   */
  private bookmarksContentDiffers(a: StoredBookmark, b: StoredBookmark): boolean {
    return (
      a.title !== b.title ||
      a.url !== b.url ||
      a.folder !== b.folder ||
      a.notes !== b.notes ||
      JSON.stringify(a.tags) !== JSON.stringify(b.tags)
    );
  }

  /**
   * Resolve conflicts using the specified strategy
   * 
   * @param conflicts - Array of conflicts to resolve
   * @param strategy - Resolution strategy
   * @returns Resolution results
   */
  private async resolveConflicts(
    conflicts: SyncConflict[],
    strategy: ConflictStrategy
  ): Promise<{ resolved: StoredBookmark[]; unresolved: SyncConflict[] }> {
    const resolved: StoredBookmark[] = [];
    const unresolved: SyncConflict[] = [];

    for (const conflict of conflicts) {
      switch (strategy) {
        case 'latest-wins':
          if (conflict.localBookmark.dateModified > conflict.remoteBookmark.dateModified) {
            resolved.push(conflict.localBookmark);
          } else {
            resolved.push(conflict.remoteBookmark);
          }
          break;
          
        case 'local-wins':
          resolved.push(conflict.localBookmark);
          break;
          
        case 'github-wins':
          resolved.push(conflict.remoteBookmark);
          break;
          
        case 'manual':
          unresolved.push(conflict);
          break;
      }
    }

    return { resolved, unresolved };
  }

  /**
   * Apply changes to both local and remote storage
   * 
   * @param changes - Detected changes
   * @param config - Sync configuration
   * @returns Applied change counts
   */
  private async applyChanges(
    changes: any,
    config: SyncConfig
  ): Promise<{ added: number; modified: number; deleted: number }> {
    let added = 0;
    let modified = 0;
    let deleted = 0;

    try {
      // Apply changes to GitHub
      if (changes.toGitHub.length > 0 && this.githubClient) {
        const markdown = generateMarkdownContent(changes.toGitHub, 'folder');
        
        try {
          // Try to update existing file
          const existing = await this.githubClient.getFileContent('bookmarks.md');
          await this.githubClient.updateFile(
            'bookmarks.md',
            markdown,
            `chore: sync ${changes.toGitHub.length} bookmarks to GitHub`,
            existing.sha
          );
          modified += changes.toGitHub.length;
        } catch (error: any) {
          if (error.message.includes('not found')) {
            // Create new file
            await this.githubClient.createFile(
              'bookmarks.md',
              markdown,
              'feat: initial bookmark sync to GitHub'
            );
            added += changes.toGitHub.length;
          } else {
            throw error;
          }
        }
      }

      // Apply changes from GitHub to local
      if (changes.fromGitHub.length > 0 && bookmarkManager) {
        for (const bookmark of changes.fromGitHub) {
          try {
            const normalized = bookmarkManager.storedToNormalized([bookmark])[0];
            await bookmarkManager.createBookmark(normalized);
            added++;
          } catch (error) {
            console.warn(`Failed to create bookmark ${bookmark.title}:`, error);
          }
        }
        
        // Update local cache
        const allLocal = await this.getLocalBookmarks();
        await storageManager.saveBookmarks(allLocal);
      }

    } catch (error: any) {
      throw new Error(`Failed to apply changes: ${error.message}`);
    }

    return { added, modified, deleted };
  }

  /**
   * Schedule periodic sync operations
   * 
   * @param intervalMs - Sync interval in milliseconds
   */
  scheduleSync(intervalMs: number): void {
    // Clear existing interval
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Set up new interval
    this.syncInterval = setInterval(async () => {
      try {
        await this.performSync();
      } catch (error) {
        console.error('Scheduled sync failed:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop scheduled sync operations
   */
  stopScheduledSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Add operation to sync queue for batch processing
   * 
   * @param operation - Operation to queue
   */
  async queueOperation(operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'attempts'>): Promise<void> {
    const queuedOp: QueuedOperation = {
      ...operation,
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      attempts: 0,
    };

    this.syncQueue.push(queuedOp);
    
    // Process queue if not already processing
    if (!this.isProcessingQueue) {
      await this.processQueue();
    }
  }

  /**
   * Process queued operations with batching and retry logic
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.syncQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.syncQueue.length > 0) {
        const operation = this.syncQueue.shift()!;
        
        try {
          await this.performSync(operation.config);
        } catch (error: any) {
          operation.attempts++;
          
          if (operation.attempts < this.defaultConfig.retryAttempts) {
            // Retry with exponential backoff
            const delay = this.defaultConfig.retryDelay * Math.pow(2, operation.attempts - 1);
            setTimeout(() => {
              this.syncQueue.unshift(operation);
            }, delay);
          } else {
            console.error(`Operation ${operation.id} failed after ${operation.attempts} attempts:`, error);
          }
        }
        
        // Small delay between operations to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Get current sync status and statistics
   * 
   * @returns Current sync status information
   */
  async getStatus(): Promise<{
    status: SyncStatus;
    lastSync: number;
    queueLength: number;
    isGitHubConfigured: boolean;
    totalBookmarks: number;
  }> {
    const lastSync = await storageManager.getLastSyncTime();
    const bookmarks = await storageManager.getBookmarks();
    
    return {
      status: this.currentSyncPromise ? 'syncing' : 'idle',
      lastSync,
      queueLength: this.syncQueue.length,
      isGitHubConfigured: !!this.githubClient,
      totalBookmarks: bookmarks.length,
    };
  }

  /**
   * Validate sync state and fix inconsistencies
   * 
   * @returns Validation report
   */
  async validateSyncState(): Promise<{
    valid: boolean;
    issues: string[];
    fixes: string[];
  }> {
    const issues: string[] = [];
    const fixes: string[] = [];

    try {
      // Check GitHub configuration
      if (!this.githubClient) {
        issues.push('GitHub not configured');
      } else {
        try {
          await this.githubClient.authenticate();
        } catch (error) {
          issues.push('GitHub authentication failed');
        }
      }

      // Check bookmark consistency
      if (bookmarkManager) {
        try {
          const browserBookmarks = await bookmarkManager.getAllBookmarks();
          const cachedBookmarks = await storageManager.getBookmarks();
          
          if (browserBookmarks.length !== cachedBookmarks.length) {
            issues.push('Browser and cache bookmark count mismatch');
            
            // Fix by updating cache
            const normalized = bookmarkManager.normalizedToStored(browserBookmarks);
            await storageManager.saveBookmarks(normalized);
            fixes.push('Updated bookmark cache from browser');
          }
        } catch (error) {
          issues.push('Failed to validate bookmark consistency');
        }
      }

    } catch (error: any) {
      issues.push(`Validation error: ${error.message}`);
    }

    return {
      valid: issues.length === 0,
      issues,
      fixes
    };
  }
}

/**
 * Create and initialize a sync manager instance
 * 
 * @returns Initialized sync manager
 */
export async function createSyncManager(): Promise<SyncManager> {
  const manager = new SyncManager();
  await manager.initialize();
  return manager;
}

// Export singleton instance
let syncManagerInstance: SyncManager | undefined;

/**
 * Get singleton sync manager instance
 * 
 * @returns Promise that resolves to sync manager instance
 */
export async function getSyncManager(): Promise<SyncManager> {
  if (!syncManagerInstance) {
    syncManagerInstance = await createSyncManager();
  }
  return syncManagerInstance;
}