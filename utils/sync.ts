import { storageManager } from './storage';
import { bookmarkManager } from './bookmarks';
import { JSONGitHubClient } from './json-github';
import type { StoredBookmark, GitHubConfig } from './storage';
import type { NormalizedBookmark } from './bookmarks';
import type { HubMarkBookmark, HubMarkData } from './json-schema';
import type { MergeResult } from './json-github';

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
 * Convert StoredBookmark to HubMarkBookmark format
 */
function storedToHubMark(bookmark: StoredBookmark): HubMarkBookmark {
  return {
    id: bookmark.id,
    title: bookmark.title,
    url: bookmark.url,
    folder: bookmark.folder || '',
    tags: bookmark.tags || [],
    notes: bookmark.notes || '',
    dateAdded: bookmark.dateAdded,
    dateModified: bookmark.dateModified,
    archived: bookmark.archived || false,
    favorite: bookmark.favorite || false
  };
}

/**
 * Convert HubMarkBookmark to StoredBookmark format
 */
function hubMarkToStored(bookmark: HubMarkBookmark): StoredBookmark {
  return {
    id: bookmark.id,
    title: bookmark.title,
    url: bookmark.url,
    folder: bookmark.folder,
    tags: bookmark.tags,
    notes: bookmark.notes,
    dateAdded: bookmark.dateAdded,
    dateModified: bookmark.dateModified,
    archived: bookmark.archived,
    favorite: bookmark.favorite
  };
}

/**
 * Sync manager that orchestrates bookmark synchronization between browser and GitHub
 * 
 * Uses JSONGitHubClient for all GitHub operations with:
 * - Schema validation on every read/write
 * - 3-way merge capability
 * - Automatic 409 conflict retry
 * - Consistent data paths (bookmarks/data.json)
 */
export class SyncManager {
  private jsonClient: JSONGitHubClient | null = null;
  private currentSyncPromise: Promise<SyncResult> | null = null;
  private lastSha: string | undefined;
  private baseBookmarks: HubMarkBookmark[] = [];

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
        this.jsonClient = new JSONGitHubClient(githubConfig);
        await this.jsonClient.authenticate();
        
        // Load initial state from GitHub
        try {
          const { data, sha } = await this.jsonClient.readBookmarkData();
          this.baseBookmarks = data.bookmarks;
          this.lastSha = sha;
        } catch (error) {
          console.log('No existing GitHub data, starting fresh');
        }
      }
    } catch (error) {
      console.error('Failed to initialize sync manager:', error);
    }
  }

  /**
   * Update GitHub configuration and reinitialize client
   */
  async updateGitHubConfig(config: GitHubConfig): Promise<void> {
    await storageManager.saveGitHubConfig(config);
    this.jsonClient = new JSONGitHubClient(config);
    await this.jsonClient.authenticate();
  }

  /**
   * Perform a sync operation
   */
  async performSync(config: Partial<SyncConfig> = {}): Promise<SyncResult> {
    const syncConfig = { ...this.defaultConfig, ...config };
    
    // Prevent concurrent syncs
    if (this.currentSyncPromise) {
      return this.currentSyncPromise;
    }

    const startTime = Date.now();
    this.currentSyncPromise = this.executeSync(syncConfig, startTime);
    
    try {
      return await this.currentSyncPromise;
    } finally {
      this.currentSyncPromise = null;
    }
  }

  /**
   * Execute the actual sync operation using JSONGitHubClient
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
      if (!this.jsonClient) {
        throw new Error('GitHub not configured');
      }

      // Step 1: Get current state from all sources
      const localBookmarks = await this.getLocalBookmarks();
      const { data: remoteData, sha } = await this.jsonClient.readBookmarkData();
      const remoteBookmarks = remoteData.bookmarks;

      // Convert local bookmarks to HubMark format
      const localHubMark = localBookmarks.map(storedToHubMark);

      // Step 2: Determine deletions
      const localIds = new Set(localHubMark.map(b => b.id));
      const remoteIds = new Set(remoteBookmarks.map(b => b.id));
      const localDeletions: string[] = [];
      const remoteDeletions: string[] = [];
      
      // Local deletions: bookmarks that existed in base but not in local
      if (config.direction !== 'from-github') {
        for (const baseBookmark of this.baseBookmarks) {
          if (!localIds.has(baseBookmark.id)) {
            localDeletions.push(baseBookmark.id);
          }
        }
      }
      
      // Remote deletions: bookmarks that existed in base but not in remote
      if (config.direction === 'from-github' || config.direction === 'bidirectional') {
        for (const baseBookmark of this.baseBookmarks) {
          if (!remoteIds.has(baseBookmark.id)) {
            remoteDeletions.push(baseBookmark.id);
          }
        }
      }

      // Step 3: Normalize strategy naming (browser-wins -> local-wins)
      const normalizeStrategy = (strategy: string): string => {
        if (strategy === 'browser-wins') return 'local-wins';
        return strategy;
      };

      // Step 4: Use JSONGitHubClient's merge function
      let mergeResult: MergeResult;
      
      if (config.direction === 'to-github') {
        // One-way sync to GitHub: local wins all
        mergeResult = await this.jsonClient.mergeBookmarks(
          this.baseBookmarks,
          localHubMark,
          [], // Ignore remote
          localDeletions,
          'local-wins' // Explicit: browser data wins
        );
      } else if (config.direction === 'from-github') {
        // One-way sync from GitHub: remote wins all
        mergeResult = await this.jsonClient.mergeBookmarks(
          this.baseBookmarks,
          [], // Ignore local
          remoteBookmarks,
          [], // No deletions from GitHub
          'github-wins'
        );
      } else {
        // Bidirectional sync: use configured strategy with normalization
        mergeResult = await this.jsonClient.mergeBookmarks(
          this.baseBookmarks,
          localHubMark,
          remoteBookmarks,
          localDeletions,
          normalizeStrategy(config.strategy)
        );
      }

      // Step 5: Handle conflicts
      if (mergeResult.conflicts.length > 0 && config.strategy === 'manual') {
        result.conflicts = mergeResult.conflicts.map(c => ({
          bookmarkId: c.id,
          localBookmark: hubMarkToStored(c.local),
          remoteBookmark: hubMarkToStored(c.remote),
          conflictType: 'modified'
        }));
        result.status = 'conflicts';
        return result;
      }

      // Step 6: Write merged data back
      const newData: HubMarkData = {
        schemaVersion: 1,
        bookmarks: mergeResult.merged,
        generatedAt: new Date().toISOString()
      };

      const newSha = await this.jsonClient.writeBookmarkData(
        newData,
        `sync: +${mergeResult.stats.added} ~${mergeResult.stats.modified} -${mergeResult.stats.deleted}`,
        sha || this.lastSha
      );

      // Step 7: Update README
      await this.jsonClient.updateReadmeIfChanged(newData);

      // Step 8: Apply changes to browser if needed
      if (config.direction !== 'to-github') {
        const mergedStored = mergeResult.merged.map(hubMarkToStored);
        await this.applyToLocalBookmarks(mergedStored, remoteDeletions);
      }

      // Step 9: Update base state for next sync
      this.baseBookmarks = mergeResult.merged;
      this.lastSha = newSha;

      // Update result
      result.success = true;
      result.status = 'idle';
      result.changes = mergeResult.stats;
      
      // Save last sync time
      await storageManager.setLastSyncTime(Date.now());

    } catch (error: any) {
      console.error('Sync failed:', error);
      result.errors.push(error.message);
      result.status = 'error';
    } finally {
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Get local bookmarks from browser
   */
  private async getLocalBookmarks(): Promise<StoredBookmark[]> {
    if (!bookmarkManager) {
      return await storageManager.getBookmarks();
    }

    try {
      const normalized = await bookmarkManager.getAllBookmarks();
      const stored = bookmarkManager.normalizedToStored(normalized);
      await storageManager.saveBookmarks(stored);
      return stored;
    } catch (error) {
      console.warn('Failed to get browser bookmarks, using cache:', error);
      return await storageManager.getBookmarks();
    }
  }

  /**
   * Apply merged bookmarks to local browser
   * @param bookmarks - The merged bookmarks to apply
   * @param remoteDeletions - IDs of bookmarks deleted on remote to remove locally
   */
  private async applyToLocalBookmarks(bookmarks: StoredBookmark[], remoteDeletions: string[] = []): Promise<void> {
    // Save to storage first
    await storageManager.saveBookmarks(bookmarks);
    
    // If we have bookmark manager, apply changes to actual browser bookmarks
    if (bookmarkManager) {
      try {
        // Get current browser bookmarks
        const currentNormalized = await bookmarkManager.getAllBookmarks();
        if (!currentNormalized || !Array.isArray(currentNormalized)) {
          console.warn('Unable to get current browser bookmarks');
          return;
        }
        const currentById = new Map(currentNormalized.map(b => [b.id, b]));
        
        // Convert merged bookmarks to normalized format  
        const mergedNormalized = bookmarkManager.storedToNormalized(bookmarks);
        if (!mergedNormalized || !Array.isArray(mergedNormalized)) {
          console.warn('Unable to convert stored bookmarks to normalized format');
          return;
        }
        const mergedById = new Map(mergedNormalized.map(b => [b.id, b]));
        
        // Find changes to apply
        for (const merged of mergedNormalized) {
          const current = currentById.get(merged.id);
          
          if (!current) {
            // New bookmark - create in browser
            await bookmarkManager.createBookmark(merged);
            console.log(`Created browser bookmark: ${merged.title}`);
          } else if (this.bookmarksDiffer(current, merged)) {
            // Modified bookmark - update in browser
            await bookmarkManager.updateBookmark(merged.id, merged);
            console.log(`Updated browser bookmark: ${merged.title}`);
          }
        }
        
        // Find bookmarks to delete (in current but not in merged, or explicitly deleted remotely)
        const toDelete = new Set<string>();
        
        // Add bookmarks that are in current but not in merged
        for (const current of currentNormalized) {
          if (!mergedById.has(current.id)) {
            toDelete.add(current.id);
          }
        }
        
        // Add explicit remote deletions
        for (const deletedId of remoteDeletions) {
          toDelete.add(deletedId);
        }
        
        // Delete bookmarks
        for (const deleteId of toDelete) {
          const current = currentById.get(deleteId);
          if (current) {
            await bookmarkManager.deleteBookmark(deleteId);
            console.log(`Deleted browser bookmark: ${current.title}`);
          }
        }
        
        console.log(`Applied ${bookmarks.length} bookmarks to browser`);
      } catch (error) {
        console.error('Failed to apply bookmarks to browser:', error);
        // Don't throw - the storage update was successful
      }
    } else {
      console.log('No bookmark manager available, saved to cache only');
    }
  }

  /**
   * Compare two normalized bookmarks for differences
   */
  private bookmarksDiffer(a: NormalizedBookmark, b: NormalizedBookmark): boolean {
    return a.title !== b.title ||
           a.url !== b.url ||
           a.folderPath !== b.folderPath ||
           a.notes !== b.notes ||
           JSON.stringify(a.tags.sort()) !== JSON.stringify(b.tags.sort());
  }

  /**
   * Get sync status
   */
  async getStatus(): Promise<{
    status: SyncStatus;
    lastSync: number;
    isGitHubConfigured: boolean;
    totalBookmarks: number;
  }> {
    const lastSync = await storageManager.getLastSyncTime();
    const bookmarks = await storageManager.getBookmarks();
    
    return {
      status: this.currentSyncPromise ? 'syncing' : 'idle',
      lastSync,
      isGitHubConfigured: !!this.jsonClient,
      totalBookmarks: bookmarks.length
    };
  }

  /**
   * Schedule periodic sync operations using chrome.alarms API (MV3 compatible)
   */
  scheduleSync(intervalMs: number): void {
    if (typeof chrome === 'undefined' || !chrome.alarms) {
      console.warn('Chrome alarms API not available - sync scheduling disabled');
      return;
    }

    const alarmName = 'hubmark-periodic-sync';
    const intervalMinutes = Math.max(1, intervalMs / 60000); // Convert to minutes, minimum 1

    // Clear existing alarm
    chrome.alarms.clear(alarmName);

    // Create new alarm
    chrome.alarms.create(alarmName, {
      periodInMinutes: intervalMinutes
    });

    console.log(`Periodic sync scheduled every ${intervalMinutes} minutes`);
  }

  /**
   * Stop scheduled sync operations
   */
  stopScheduledSync(): void {
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.clear('hubmark-periodic-sync');
      console.log('Periodic sync stopped');
    }
  }

  /**
   * Validate sync state
   */
  async validateSyncState(): Promise<{
    valid: boolean;
    issues: string[];
    fixes: string[];
  }> {
    const issues: string[] = [];
    const fixes: string[] = [];

    try {
      if (!this.jsonClient) {
        issues.push('GitHub not configured');
      } else {
        try {
          await this.jsonClient.authenticate();
        } catch {
          issues.push('GitHub authentication failed');
        }
      }

      // Validate bookmark consistency
      if (bookmarkManager) {
        try {
          const normalized = await bookmarkManager.getAllBookmarks();
          const stored = await storageManager.getBookmarks();
          
          if (normalized.length !== stored.length) {
            issues.push('Browser and cache bookmark count mismatch');
            const newStored = bookmarkManager.normalizedToStored(normalized);
            await storageManager.saveBookmarks(newStored);
            fixes.push('Updated bookmark cache from browser');
          }
        } catch {
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

// Factory functions for singleton pattern
let syncManagerInstance: SyncManager | undefined;

export async function createSyncManager(): Promise<SyncManager> {
  const manager = new SyncManager();
  await manager.initialize();
  return manager;
}

export async function getSyncManager(): Promise<SyncManager> {
  if (!syncManagerInstance) {
    syncManagerInstance = await createSyncManager();
  }
  return syncManagerInstance;
}