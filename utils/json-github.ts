import { GitHubClient } from './github';
import { HubMarkData, HubMarkBookmark, schemaValidator, createEmptyData } from './json-schema';
import type { GitHubConfig } from './storage';

// Re-export base64 functions for consistency
export { encodeBase64 as browserSafeEncode, decodeBase64 as browserSafeDecode } from './base64';

/**
 * Conflict resolution strategies for sync operations
 */
export type ConflictStrategy = 'latest-wins' | 'local-wins' | 'github-wins' | 'manual';

/**
 * Conflict information
 */
export interface BookmarkConflict {
  id: string;
  local: HubMarkBookmark;
  remote: HubMarkBookmark;
  base?: HubMarkBookmark;
}

/**
 * Sync merge result
 */
export interface MergeResult {
  merged: HubMarkBookmark[];
  conflicts: BookmarkConflict[];
  stats: {
    added: number;
    modified: number;
    deleted: number;
  };
}

/**
 * GitHub client for JSON-first bookmark storage
 * 
 * Manages bookmarks as structured JSON data with generated markdown views
 */
export class JSONGitHubClient {
  private client: GitHubClient;
  private dataPath = 'bookmarks/data.json';
  private readmePath = 'bookmarks/README.md';

  constructor(config: GitHubConfig) {
    this.client = new GitHubClient(config);
  }

  /**
   * Authenticate with GitHub API
   */
  async authenticate(): Promise<void> {
    return this.client.authenticate();
  }

  /**
   * Read bookmark data from GitHub repository
   * 
   * @returns HubMark data structure or empty data if file doesn't exist
   */
  async readBookmarkData(): Promise<{ data: HubMarkData; sha?: string }> {
    try {
      const file = await this.client.getFileContent(this.dataPath);
      const jsonContent = browserSafeDecode(file.content);
      const data = JSON.parse(jsonContent) as unknown;
      
      // Validate against schema
      schemaValidator.validateOrThrow(data);
      
      return { data, sha: file.sha };
    } catch (error: any) {
      if (error.message.includes('not found')) {
        // Return empty data structure for new repositories
        return { data: createEmptyData() };
      }
      throw error;
    }
  }

  /**
   * Write bookmark data to GitHub repository with 409 retry logic
   * 
   * @param data - HubMark data to write
   * @param message - Commit message
   * @param sha - Current file SHA (for updates)
   * @param retries - Number of retry attempts on 409 conflicts
   * @returns Updated SHA
   */
  async writeBookmarkData(
    data: HubMarkData, 
    message: string, 
    sha?: string,
    retries = 3
  ): Promise<string> {
    // Validate data before writing
    schemaValidator.validateOrThrow(data);
    
    // Update metadata
    data.generatedAt = new Date().toISOString();
    data.meta = {
      ...data.meta,
      generator: 'HubMark',
      generatorVersion: '0.1.0',
      lastSync: Date.now()
    };

    const jsonContent = JSON.stringify(data, null, 2);
    const encodedContent = browserSafeEncode(jsonContent);

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (sha) {
          // Update existing file
          const result = await this.client.updateFile(
            this.dataPath,
            encodedContent,
            message,
            sha
          );
          return result.content.sha;
        } else {
          // Create new file
          const result = await this.client.createFile(
            this.dataPath,
            encodedContent,
            message
          );
          return result.content.sha;
        }
      } catch (error: any) {
        if (error.status === 409 && attempt < retries) {
          // Conflict detected - re-fetch and retry
          console.warn(`Write conflict detected, retrying (${attempt + 1}/${retries})...`);
          
          // Exponential backoff with jitter
          const delay = Math.min(250 * Math.pow(3, attempt) + Math.random() * 100, 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Re-fetch current state for next attempt
          try {
            const current = await this.readBookmarkData();
            sha = current.sha;
            
            // Note: In a full implementation, we would re-merge the data here
            // For now, we retry with the original data
          } catch (fetchError) {
            console.warn('Failed to re-fetch during retry:', fetchError);
          }
        } else {
          throw error;
        }
      }
    }

    throw new Error(`Failed to write after ${retries} retry attempts due to conflicts`);
  }

  /**
   * Perform 3-way merge between base, local, and remote bookmark sets
   * 
   * @param base - Base bookmark state (last known sync)
   * @param local - Local bookmark changes  
   * @param remote - Remote bookmark state
   * @param deletions - IDs of bookmarks to delete
   * @param strategy - Conflict resolution strategy
   * @returns Merge result
   */
  async mergeBookmarks(
    base: HubMarkBookmark[],
    local: HubMarkBookmark[],
    remote: HubMarkBookmark[],
    deletions: string[] = [],
    strategy: ConflictStrategy = 'latest-wins'
  ): Promise<MergeResult> {
    const baseMap = new Map(base.map(b => [b.id, b]));
    const localMap = new Map(local.map(b => [b.id, b]));
    const remoteMap = new Map(remote.map(b => [b.id, b]));
    
    const mergedMap = new Map(remoteMap);
    const conflicts: BookmarkConflict[] = [];
    let added = 0;
    let modified = 0;
    let deleted = 0;

    // Apply deletions first
    for (const deleteId of deletions) {
      if (mergedMap.delete(deleteId)) {
        deleted++;
      }
    }

    // Process local changes
    for (const [id, localBookmark] of localMap) {
      const remoteBookmark = remoteMap.get(id);
      const baseBookmark = baseMap.get(id);

      if (!remoteBookmark) {
        // New bookmark - add to merged set
        mergedMap.set(id, localBookmark);
        added++;
      } else {
        // Check for conflicts
        const localChanged = !baseBookmark || this.bookmarksdiffer(baseBookmark, localBookmark);
        const remoteChanged = !baseBookmark || this.bookmarksdiffer(baseBookmark, remoteBookmark);
        
        if (localChanged && remoteChanged && this.bookmarksdiffer(localBookmark, remoteBookmark)) {
          // Three-way conflict
          const resolved = this.resolveConflict(localBookmark, remoteBookmark, strategy);
          if (resolved) {
            mergedMap.set(id, resolved);
            modified++;
          } else {
            // Manual resolution required
            conflicts.push({
              id,
              local: localBookmark,
              remote: remoteBookmark,
              base: baseBookmark
            });
          }
        } else if (localChanged) {
          // Only local changed - use local version
          mergedMap.set(id, localBookmark);
          modified++;
        }
        // If only remote changed or no changes, keep remote (already in mergedMap)
      }
    }

    return {
      merged: Array.from(mergedMap.values()),
      conflicts,
      stats: { added, modified, deleted }
    };
  }

  /**
   * Resolve bookmark conflict using specified strategy
   * 
   * @param local - Local bookmark
   * @param remote - Remote bookmark  
   * @param strategy - Resolution strategy
   * @returns Resolved bookmark or null if manual resolution needed
   */
  private resolveConflict(
    local: HubMarkBookmark,
    remote: HubMarkBookmark,
    strategy: ConflictStrategy
  ): HubMarkBookmark | null {
    switch (strategy) {
      case 'latest-wins':
        return local.dateModified > remote.dateModified ? local : remote;
      
      case 'local-wins':
        return local;
      
      case 'github-wins':
        return remote;
      
      case 'manual':
        return null;
      
      default:
        return local; // Fallback to local-wins
    }
  }

  /**
   * Compare two bookmarks for content differences
   * 
   * @param a - First bookmark
   * @param b - Second bookmark
   * @returns True if bookmarks differ in content
   */
  private bookmarksdiffer(a: HubMarkBookmark, b: HubMarkBookmark): boolean {
    // Compare all fields except dates
    if (a.title !== b.title ||
        a.url !== b.url ||
        a.folder !== b.folder ||
        a.notes !== b.notes ||
        a.archived !== b.archived ||
        a.favorite !== b.favorite) {
      return true;
    }

    // Compare tags (order-insensitive)
    const tagsA = [...a.tags].sort();
    const tagsB = [...b.tags].sort();
    
    if (tagsA.length !== tagsB.length) {
      return true;
    }

    return tagsA.some((tag, index) => tag !== tagsB[index]);
  }

  /**
   * Generate README.md from bookmark data
   * 
   * @param data - HubMark bookmark data
   * @returns Markdown content for README
   */
  generateReadme(data: HubMarkData): string {
    const { bookmarks } = data;
    const lastUpdate = data.generatedAt ? new Date(data.generatedAt).toLocaleDateString() : 'Unknown';
    
    let markdown = `# My Bookmarks\n\n`;
    markdown += `*Generated by HubMark on ${lastUpdate}*\n\n`;
    markdown += `Total bookmarks: ${bookmarks.length}\n\n`;

    if (bookmarks.length === 0) {
      markdown += `No bookmarks yet. Start adding some to see them here!\n`;
      return markdown;
    }

    // Group by folder
    const folderGroups = new Map<string, HubMarkBookmark[]>();
    
    for (const bookmark of bookmarks) {
      if (bookmark.archived) continue; // Skip archived bookmarks in README
      
      const folder = bookmark.folder || 'Uncategorized';
      if (!folderGroups.has(folder)) {
        folderGroups.set(folder, []);
      }
      folderGroups.get(folder)!.push(bookmark);
    }

    // Sort folders and bookmarks
    const sortedFolders = Array.from(folderGroups.entries())
      .sort(([a], [b]) => a.localeCompare(b));

    for (const [folder, folderBookmarks] of sortedFolders) {
      markdown += `## ${folder}\n\n`;
      
      const sortedBookmarks = folderBookmarks.sort((a, b) => a.title.localeCompare(b.title));
      
      for (const bookmark of sortedBookmarks) {
        const tags = bookmark.tags.length > 0 ? ` \`${bookmark.tags.join('` `')}\`` : '';
        const favorite = bookmark.favorite ? ' ⭐' : '';
        const notes = bookmark.notes ? `\n  > ${bookmark.notes}` : '';
        
        markdown += `- [${bookmark.title}](${bookmark.url})${favorite}${tags}${notes}\n`;
      }
      
      markdown += `\n`;
    }

    // Add archived section if there are archived bookmarks  
    const archivedBookmarks = bookmarks.filter(b => b.archived);
    if (archivedBookmarks.length > 0) {
      markdown += `## Archived (${archivedBookmarks.length})\n\n`;
      markdown += `<details>\n<summary>Show archived bookmarks</summary>\n\n`;
      
      for (const bookmark of archivedBookmarks) {
        markdown += `- [${bookmark.title}](${bookmark.url})\n`;
      }
      
      markdown += `\n</details>\n\n`;
    }

    markdown += `---\n\n`;
    markdown += `*This file is automatically generated from [data.json](./data.json). Do not edit directly.*\n`;

    return markdown;
  }

  /**
   * Write README.md file if content has changed
   * 
   * @param data - HubMark bookmark data
   * @returns True if README was updated, false if no changes
   */
  async updateReadmeIfChanged(data: HubMarkData): Promise<boolean> {
    const newContent = this.generateReadme(data);
    const encodedContent = browserSafeEncode(newContent);

    try {
      // Check if README exists and compare content
      const existing = await this.client.getFileContent(this.readmePath);
      const existingContent = browserSafeDecode(existing.content);
      
      if (existingContent === newContent) {
        // No changes needed
        return false;
      }

      // Update existing README
      await this.client.updateFile(
        this.readmePath,
        encodedContent,
        'docs: update README from bookmark data',
        existing.sha
      );
      
      return true;
    } catch (error: any) {
      if (error.message.includes('not found')) {
        // Create new README
        await this.client.createFile(
          this.readmePath,
          encodedContent,
          'docs: create README from bookmark data'
        );
        return true;
      }
      throw error;
    }
  }
}