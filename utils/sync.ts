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
export type ConflictStrategy = 'latest-wins' | 'manual' | 'github-wins' | 'browser-wins';

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
  private syncAlarmName = 'hubmark-sync-alarm';
  private currentSyncPromise: Promise<SyncResult> | null = null;
  private alarmListener: ((alarm: chrome.alarms.Alarm) => void) | null = null;

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
      console.log('🔍 [SyncManager.executeSync] Starting sync with config:', config);
      console.log('🔍 [SyncManager.executeSync] GitHub client exists:', !!this.githubClient);
      
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
      console.error('🚨 [SyncManager.executeSync] Sync failed with error:', error);
      console.error('🚨 [SyncManager.executeSync] Error type:', typeof error);
      console.error('🚨 [SyncManager.executeSync] Error message:', error?.message);
      console.error('🚨 [SyncManager.executeSync] Error stack:', error?.stack);
      
      const errorMessage = error?.message || error?.toString() || 'Unknown sync error';
      result.errors.push(errorMessage);
      result.status = 'error';
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
      
      // Deduplicate by HubMark ID (multiple browser bookmarks may have same HubMark ID)
      const deduplicatedMap = new Map<string, StoredBookmark>();
      storedBookmarks.forEach(bookmark => {
        const existing = deduplicatedMap.get(bookmark.id);
        if (!existing || bookmark.dateModified > existing.dateModified) {
          // Keep the most recently modified version
          deduplicatedMap.set(bookmark.id, bookmark);
        }
      });
      
      const deduplicatedBookmarks = Array.from(deduplicatedMap.values());
      console.log(`🔍 [SyncManager.getLocalBookmarks] Deduplicated ${storedBookmarks.length} → ${deduplicatedBookmarks.length} bookmarks`);
      
      // Update local cache
      await storageManager.saveBookmarks(deduplicatedBookmarks);
      
      return deduplicatedBookmarks;
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
      // Try to get main bookmarks JSON file (JSON-first architecture)
      const file = await this.githubClient.getFileContent('bookmarks.json');
      return JSON.parse(file.content);
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('Not Found')) {
        // No remote bookmarks yet - this is the first sync
        console.log('🔍 [SyncManager.getRemoteBookmarks] No remote bookmarks file found, returning empty array for first sync');
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

    // Get union of all IDs from both sides
    const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);

    for (const id of allIds) {
      const localBookmark = localMap.get(id);
      const remoteBookmark = remoteMap.get(id);
      
      if (localBookmark && !remoteBookmark) {
        // Only in local - add to GitHub (unless from-github only)
        if (direction !== 'from-github') {
          toGitHub.push(localBookmark);
        }
      } else if (!localBookmark && remoteBookmark) {
        // Only in remote - add to local (unless to-github only)
        if (direction !== 'to-github') {
          fromGitHub.push(remoteBookmark);
        }
      } else if (localBookmark && remoteBookmark) {
        // Exists in both - determine winner or create conflict
        if (this.bookmarksContentDiffers(localBookmark, remoteBookmark)) {
          // Content differs - apply conflict resolution strategy
          const localNewer = localBookmark.dateModified > remoteBookmark.dateModified;
          const remoteNewer = remoteBookmark.dateModified > localBookmark.dateModified;
          
          // Use latest-wins strategy (configurable in future)
          if (localNewer && direction !== 'from-github') {
            // Local is newer - push to GitHub
            toGitHub.push(localBookmark);
          } else if (remoteNewer && direction !== 'to-github') {
            // Remote is newer - pull from GitHub
            fromGitHub.push(remoteBookmark);
          } else if (!localNewer && !remoteNewer) {
            // Same timestamp but different content - use remote as tie-breaker
            if (direction !== 'to-github') {
              fromGitHub.push(remoteBookmark);
            }
          }
          // Note: For manual conflict resolution strategy, would add to conflicts array
        }
        // If content is identical, no action needed
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
          
        case 'browser-wins':
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
        let existingBookmarks: StoredBookmark[] = [];
        let existingSha: string | undefined;
        
        try {
          // Always read current remote JSON file to get full bookmark set
          const existing = await this.githubClient.getFileContent('bookmarks.json');
          existingBookmarks = JSON.parse(existing.content);
          existingSha = existing.sha;
        } catch (error: any) {
          if (!error.message.includes('not found') && !error.message.includes('Not Found')) {
            throw error;
          }
          // File doesn't exist yet - will create new
        }
        
        // Merge changes with existing bookmarks
        const bookmarkMap = new Map(existingBookmarks.map(b => [b.id, b]));
        
        // Add/update bookmarks from changes
        for (const bookmark of changes.toGitHub) {
          const existing = bookmarkMap.get(bookmark.id);
          if (existing) {
            modified++;
          } else {
            added++;
          }
          bookmarkMap.set(bookmark.id, bookmark);
        }
        
        // Apply deletions if any
        for (const deleteId of changes.toDelete || []) {
          if (bookmarkMap.delete(deleteId)) {
            deleted++;
          }
        }
        
        // Generate JSON from complete merged set
        const allBookmarks = Array.from(bookmarkMap.values());
        const jsonContent = JSON.stringify(allBookmarks, null, 2);
        
        if (existingSha) {
          // Update existing JSON file with complete set
          await this.githubClient.updateFile(
            'bookmarks.json',
            jsonContent,
            `chore: sync bookmarks (+${added} ~${modified} -${deleted})`,
            existingSha
          );
        } else {
          // Create new JSON file
          await this.githubClient.createFile(
            'bookmarks.json',
            jsonContent,
            'feat: initial bookmark sync to GitHub'
          );
        }
        
        // Generate Markdown from JSON for display purposes
        const markdown = generateMarkdownContent(allBookmarks, 'folder');
        
        try {
          // Try to get existing README.md to update it
          const existingReadme = await this.githubClient.getFileContent('README.md');
          await this.githubClient.updateFile(
            'README.md',
            markdown,
            'docs: update bookmark display from JSON',
            existingReadme.sha
          );
        } catch (error: any) {
          if (error.message.includes('not found') || error.message.includes('Not Found')) {
            // Create new README.md for display
            await this.githubClient.createFile(
              'README.md',
              markdown,
              'docs: generate bookmark display from JSON'
            );
          } else {
            // Non-404 error - log but don't fail the sync
            console.warn('Failed to update README.md:', error.message);
          }
        }
      }

      // Apply changes from GitHub to local
      if (changes.fromGitHub.length > 0 && bookmarkManager) {
        // Get current local bookmarks to check for existing content
        const currentLocal = await this.getLocalBookmarks();
        const localIdMap = new Map(currentLocal.map(b => [b.id, b]));
        const localContentMap = new Map(currentLocal.map(b => [`${b.url}|${b.title}`, b]));
        
        for (const bookmark of changes.fromGitHub) {
          try {
            const normalized = bookmarkManager.storedToNormalized([bookmark])[0];
            const existsByHubMarkId = localIdMap.has(bookmark.id);
            const existsByContent = localContentMap.has(`${bookmark.url}|${bookmark.title}`);
            
            if (existsByHubMarkId) {
              // Update existing bookmark (ID match)
              await bookmarkManager.updateBookmark(bookmark.id, normalized);
              modified++;
            } else if (existsByContent) {
              // Duplicate content - skip to prevent duplication
              console.log(`🔍 [SyncManager] Skipping duplicate bookmark: ${bookmark.title} (${bookmark.url})`);
              // Don't increment counters - this is a no-op
            } else {
              // Truly new bookmark - safe to create
              await bookmarkManager.createBookmark(normalized);
              added++;
            }
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
   * Schedule periodic sync operations using chrome.alarms API (MV3 compatible)
   * 
   * @param intervalMs - Sync interval in milliseconds
   */
  scheduleSync(intervalMs: number): void {
    // Check if Chrome APIs are available (browser environment)
    if (typeof chrome === 'undefined' || !chrome.alarms) {
      console.warn('Chrome alarms API not available - sync scheduling disabled');
      return;
    }

    // Clear existing alarm
    this.stopScheduledSync();

    // Set up alarm listener
    this.alarmListener = (alarm: chrome.alarms.Alarm) => {
      if (alarm.name === this.syncAlarmName) {
        this.performSync().catch(error => {
          console.error('Scheduled sync failed:', error);
        });
      }
    };

    // Add listener
    if (chrome.alarms.onAlarm.hasListener(this.alarmListener)) {
      chrome.alarms.onAlarm.removeListener(this.alarmListener);
    }
    chrome.alarms.onAlarm.addListener(this.alarmListener);

    // Create repeating alarm (convert milliseconds to minutes)
    const intervalMinutes = Math.max(1, Math.round(intervalMs / 60000));
    chrome.alarms.create(this.syncAlarmName, {
      delayInMinutes: intervalMinutes,
      periodInMinutes: intervalMinutes
    });
  }

  /**
   * Stop scheduled sync operations (MV3 compatible)
   */
  stopScheduledSync(): void {
    // Check if Chrome APIs are available (browser environment)
    if (typeof chrome === 'undefined' || !chrome.alarms) {
      return;
    }

    // Clear alarm
    chrome.alarms.clear(this.syncAlarmName);
    
    // Remove listener
    if (this.alarmListener) {
      if (chrome.alarms.onAlarm.hasListener(this.alarmListener)) {
        chrome.alarms.onAlarm.removeListener(this.alarmListener);
      }
      this.alarmListener = null;
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
            // Retry with exponential backoff using chrome.alarms (MV3 compatible)
            const delayMs = this.defaultConfig.retryDelay * Math.pow(2, operation.attempts - 1);
            
            if (typeof chrome === 'undefined' || !chrome.alarms) {
              // Fallback to setTimeout in test environment
              setTimeout(() => {
                this.syncQueue.unshift(operation);
              }, delayMs);
            } else {
              // Use chrome.alarms in browser environment
              const retryAlarmName = `hubmark-retry-${operation.id}`;
              const retryDelayMinutes = Math.max(0.1, delayMs / 60000); // Convert to minutes, minimum 0.1
              
              const retryListener = (alarm: chrome.alarms.Alarm) => {
                if (alarm.name === retryAlarmName) {
                  // Remove this specific listener
                  chrome.alarms.onAlarm.removeListener(retryListener);
                  // Add operation back to queue
                  this.syncQueue.unshift(operation);
                }
              };
              
              chrome.alarms.onAlarm.addListener(retryListener);
              chrome.alarms.create(retryAlarmName, {
                delayInMinutes: retryDelayMinutes
              });
            }
          } else {
            console.error(`Operation ${operation.id} failed after ${operation.attempts} attempts:`, error);
          }
        }
        
        // Small delay between operations to prevent rate limiting (MV3 compatible)
        await this.createMV3Delay(100);
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Create MV3-compatible delay using chrome.alarms API
   * 
   * @param delayMs - Delay in milliseconds
   * @returns Promise that resolves after the delay
   */
  private createMV3Delay(delayMs: number): Promise<void> {
    // Fallback to setTimeout in test environment
    if (typeof chrome === 'undefined' || !chrome.alarms) {
      return new Promise(resolve => setTimeout(resolve, delayMs));
    }

    return new Promise((resolve) => {
      const delayAlarmName = `hubmark-delay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const delayMinutes = Math.max(0.1, delayMs / 60000); // Convert to minutes, minimum 0.1
      
      const delayListener = (alarm: chrome.alarms.Alarm) => {
        if (alarm.name === delayAlarmName) {
          chrome.alarms.onAlarm.removeListener(delayListener);
          resolve();
        }
      };
      
      chrome.alarms.onAlarm.addListener(delayListener);
      chrome.alarms.create(delayAlarmName, {
        delayInMinutes: delayMinutes
      });
    });
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
    
    // Get live bookmark count from browser instead of cached storage
    let totalBookmarks = 0;
    try {
      const browserBookmarks = await this.getLocalBookmarks();
      totalBookmarks = browserBookmarks.length;
      console.log('🔍 [SyncManager.getStatus] Live browser bookmarks count:', totalBookmarks);
    } catch (error) {
      console.error('🔍 [SyncManager.getStatus] Failed to get live bookmarks, falling back to storage:', error);
      const cachedBookmarks = await storageManager.getBookmarks();
      totalBookmarks = cachedBookmarks.length;
    }
    
    return {
      status: this.currentSyncPromise ? 'syncing' : 'idle',
      lastSync,
      queueLength: this.syncQueue.length,
      isGitHubConfigured: !!this.githubClient,
      totalBookmarks,
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