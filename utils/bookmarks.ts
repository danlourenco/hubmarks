import type { StoredBookmark } from './storage';
import { generateStableId } from './stable-id';

/**
 * Browser-specific bookmark format (Chrome/Firefox/Edge WebExtensions API)
 */
export interface BrowserBookmark {
  id: string;
  title: string;
  url?: string;
  parentId?: string;
  index?: number;
  dateAdded?: number;
  dateGroupModified?: number;
  children?: BrowserBookmark[];
  unmodifiable?: 'managed';
}

/**
 * Normalized bookmark format that works across all browsers
 * This is our internal representation that bridges browser differences
 */
export interface NormalizedBookmark {
  id: string;           // Stable HubMark ID (hash of URL + title)
  browserId?: string;   // Browser-specific ID for syncing back
  title: string;
  url: string;
  folderPath: string;   // Full path like "Development/JavaScript/React"
  tags: string[];
  notes: string;
  dateAdded: number;
  dateModified: number;
  faviconUrl?: string;
}

/**
 * Mapping between browser IDs and stable HubMark IDs
 */
export interface IdMapping {
  browserId: string;
  hubmarkId: string;
  lastSynced: number;
}

/**
 * Change detection result for sync operations
 */
export interface BookmarkChanges {
  added: NormalizedBookmark[];
  modified: NormalizedBookmark[];
  deleted: string[]; // HubMark IDs
}

/**
 * Options for searching bookmarks
 */
export interface SearchOptions {
  query: string;
  searchIn?: ('title' | 'url' | 'tags' | 'notes')[];
  folder?: string;
  tags?: string[];
  limit?: number;
}

/**
 * Cross-browser bookmark manager with translation layer
 * 
 * Handles the complexity of different browser bookmark APIs and provides
 * a unified interface for bookmark operations across Chrome, Firefox, Edge, and Safari
 */
export class BookmarkManager {
  private idMappings: Map<string, IdMapping> = new Map();
  private browserType: 'chrome' | 'firefox' | 'safari' | 'edge';

  constructor() {
    this.browserType = this.detectBrowser();
    this.loadIdMappings();
  }

  /**
   * Detect which browser we're running in
   * 
   * @returns Browser type identifier
   */
  private detectBrowser(): 'chrome' | 'firefox' | 'safari' | 'edge' {
    // WXT provides browser detection utilities
    if (typeof browser !== 'undefined') {
      const userAgent = navigator.userAgent.toLowerCase();
      if (userAgent.includes('firefox')) return 'firefox';
      if (userAgent.includes('safari') && !userAgent.includes('chrome')) return 'safari';
      if (userAgent.includes('edg')) return 'edge';
      return 'chrome';
    }
    return 'chrome'; // Default fallback
  }

  /**
   * Load ID mappings from storage
   */
  private async loadIdMappings(): Promise<void> {
    try {
      const stored = await browser.storage.local.get('idMappings');
      if (stored.idMappings) {
        this.idMappings = new Map(stored.idMappings);
      }
    } catch (error) {
      console.error('Failed to load ID mappings:', error);
    }
  }

  /**
   * Save ID mappings to storage
   */
  private async saveIdMappings(): Promise<void> {
    try {
      await browser.storage.local.set({
        idMappings: Array.from(this.idMappings.entries())
      });
    } catch (error) {
      console.error('Failed to save ID mappings:', error);
    }
  }

  /**
   * Get all bookmarks from the browser and normalize them
   * 
   * @returns Promise that resolves to normalized bookmarks
   */
  async getAllBookmarks(): Promise<NormalizedBookmark[]> {
    try {
      console.log('📚 [BookmarkManager] Getting bookmark tree...');
      const tree = await browser.bookmarks.getTree();
      console.log('📚 [BookmarkManager] Raw bookmark tree:', JSON.stringify(tree, null, 2));
      
      const normalized: NormalizedBookmark[] = [];
      this.traverseBookmarkTree(tree[0], '', normalized);
      console.log('📚 [BookmarkManager] Normalized bookmarks:', normalized.length, normalized);
      return normalized;
    } catch (error: any) {
      console.error('📚 [BookmarkManager] Failed to get bookmarks:', error);
      throw new Error(`Failed to get bookmarks: ${error.message}`);
    }
  }

  /**
   * Traverse browser bookmark tree and convert to normalized format
   * 
   * @param node - Current bookmark node
   * @param parentPath - Parent folder path
   * @param result - Array to collect normalized bookmarks
   */
  private traverseBookmarkTree(
    node: BrowserBookmark,
    parentPath: string,
    result: NormalizedBookmark[]
  ): void {
    // Skip root node and empty folders
    if (!node.title && !node.url) {
      if (node.children) {
        node.children.forEach(child => this.traverseBookmarkTree(child, '', result));
      }
      return;
    }

    const currentPath = parentPath ? `${parentPath}/${node.title}` : node.title;

    if (node.url) {
      // It's a bookmark
      const normalized = this.browserToNormalized(node, parentPath);
      result.push(normalized);
      
      // Update ID mapping
      this.idMappings.set(node.id, {
        browserId: node.id,
        hubmarkId: normalized.id,
        lastSynced: Date.now()
      });
    } else if (node.children) {
      // It's a folder - traverse children
      node.children.forEach(child => this.traverseBookmarkTree(child, currentPath, result));
    }
  }

  /**
   * Convert browser bookmark to normalized format
   * 
   * @param browserBookmark - Browser-specific bookmark
   * @param folderPath - Folder path for this bookmark
   * @returns Normalized bookmark
   */
  private browserToNormalized(
    browserBookmark: BrowserBookmark,
    folderPath: string
  ): NormalizedBookmark {
    const { tags, notes } = this.extractMetadata(browserBookmark.title);
    const cleanTitle = this.cleanTitle(browserBookmark.title);
    
    return {
      id: this.generateStableId(browserBookmark.url!, cleanTitle),
      browserId: browserBookmark.id,
      title: cleanTitle,
      url: browserBookmark.url!,
      folderPath,
      tags,
      notes,
      dateAdded: browserBookmark.dateAdded || Date.now(),
      dateModified: browserBookmark.dateGroupModified || browserBookmark.dateAdded || Date.now(),
      faviconUrl: this.getFaviconUrl(browserBookmark.url!)
    };
  }

  /**
   * Generate a stable ID for a bookmark based on URL and title
   * 
   * Uses a simplified version of the stable ID algorithm for synchronous operation.
   * This removes the timestamp dependency while maintaining deterministic IDs.
   * 
   * Note: For full canonical URL processing, use the async generateStableId from utils/stable-id
   * 
   * @param url - Bookmark URL
   * @param title - Bookmark title  
   * @returns Stable ID string (deterministic, no timestamps)
   */
  private generateStableId(url: string, title: string): string {
    // Simple URL normalization (basic version of canonicalUrl)
    let normalizedUrl = url.toLowerCase().trim();
    
    // Remove common tracking parameters
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'ref'];
    try {
      const urlObj = new URL(normalizedUrl);
      trackingParams.forEach(param => urlObj.searchParams.delete(param));
      
      // Remove www prefix
      urlObj.hostname = urlObj.hostname.replace(/^www\./, '');
      
      // Remove trailing slash (except root)
      if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/')) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
      
      normalizedUrl = urlObj.toString();
    } catch (error) {
      // If URL parsing fails, use the original with basic cleanup
      normalizedUrl = url.trim().toLowerCase();
    }
    
    // Normalize title
    const normalizedTitle = title.trim().replace(/\s+/g, ' ');
    
    // Create composite key
    const combined = `${normalizedUrl}::${normalizedTitle}`;
    
    // Generate stable hash (improved algorithm, no timestamp)
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Create stable ID without timestamp
    const stableHash = Math.abs(hash).toString(36).padStart(8, '0');
    return `hm_${stableHash}`;
  }

  /**
   * Extract tags and notes from bookmark title
   * Tags are marked with # and notes are in parentheses
   * 
   * @param title - Bookmark title with potential metadata
   * @returns Extracted tags and notes
   */
  private extractMetadata(title: string): { tags: string[]; notes: string } {
    const tags: string[] = [];
    let notes = '';
    
    // Extract hashtags
    const tagMatches = title.match(/#\w+/g);
    if (tagMatches) {
      tags.push(...tagMatches.map(tag => tag.substring(1).toLowerCase()));
    }
    
    // Extract notes in parentheses
    const notesMatch = title.match(/\(([^)]+)\)/);
    if (notesMatch) {
      notes = notesMatch[1];
    }
    
    return { tags, notes };
  }

  /**
   * Clean title by removing metadata markers
   * 
   * @param title - Original title with metadata
   * @returns Clean title
   */
  private cleanTitle(title: string): string {
    return title
      .replace(/#\w+/g, '') // Remove hashtags
      .replace(/\([^)]+\)/g, '') // Remove parentheses content
      .trim();
  }

  /**
   * Get favicon URL for a bookmark
   * 
   * @param url - Bookmark URL
   * @returns Favicon URL
   */
  private getFaviconUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;
    } catch {
      return '';
    }
  }

  /**
   * Search bookmarks with various filters
   * 
   * @param options - Search options
   * @returns Matching bookmarks
   */
  async searchBookmarks(options: SearchOptions): Promise<NormalizedBookmark[]> {
    const allBookmarks = await this.getAllBookmarks();
    const query = options.query.toLowerCase();
    const searchIn = options.searchIn || ['title', 'url'];
    
    return allBookmarks.filter(bookmark => {
      // Text search
      const textMatch = searchIn.some(field => {
        const value = bookmark[field as keyof NormalizedBookmark];
        if (typeof value === 'string') {
          return value.toLowerCase().includes(query);
        }
        if (Array.isArray(value)) {
          return value.some(item => item.toLowerCase().includes(query));
        }
        return false;
      });
      
      if (!textMatch && options.query) return false;
      
      // Folder filter
      if (options.folder && !bookmark.folderPath.startsWith(options.folder)) {
        return false;
      }
      
      // Tags filter
      if (options.tags && options.tags.length > 0) {
        const hasAllTags = options.tags.every(tag => 
          bookmark.tags.includes(tag.toLowerCase())
        );
        if (!hasAllTags) return false;
      }
      
      return true;
    }).slice(0, options.limit);
  }

  /**
   * Create a new bookmark in the browser
   * 
   * @param bookmark - Normalized bookmark to create
   * @returns Created bookmark with browser ID
   */
  async createBookmark(bookmark: Partial<NormalizedBookmark>): Promise<NormalizedBookmark> {
    try {
      // Find or create parent folder
      const parentId = await this.ensureFolderPath(bookmark.folderPath || '');
      
      // Add metadata to title if needed
      const titleWithMetadata = this.addMetadataToTitle(
        bookmark.title!,
        bookmark.tags || [],
        bookmark.notes || ''
      );
      
      // Create browser bookmark
      const created = await browser.bookmarks.create({
        parentId,
        title: titleWithMetadata,
        url: bookmark.url
      });
      
      // Convert back to normalized format
      const normalized = this.browserToNormalized(created, bookmark.folderPath || '');
      
      // Save ID mapping
      this.idMappings.set(created.id, {
        browserId: created.id,
        hubmarkId: normalized.id,
        lastSynced: Date.now()
      });
      await this.saveIdMappings();
      
      return normalized;
    } catch (error: any) {
      throw new Error(`Failed to create bookmark: ${error.message}`);
    }
  }

  /**
   * Update an existing bookmark
   * 
   * @param hubmarkId - HubMark ID of bookmark to update
   * @param changes - Changes to apply
   * @returns Updated bookmark
   */
  async updateBookmark(
    hubmarkId: string,
    changes: Partial<NormalizedBookmark>
  ): Promise<NormalizedBookmark> {
    try {
      // Find browser ID from mapping
      const mapping = Array.from(this.idMappings.values())
        .find(m => m.hubmarkId === hubmarkId);
      
      if (!mapping) {
        throw new Error(`Bookmark ${hubmarkId} not found in mappings`);
      }
      
      // Get current bookmark to merge with changes
      const current = await browser.bookmarks.get(mapping.browserId);
      const currentNormalized = this.browserToNormalized(current[0], '');
      
      // Update browser bookmark
      const updates: any = {};
      if (changes.title !== undefined || changes.tags !== undefined || changes.notes !== undefined) {
        updates.title = this.addMetadataToTitle(
          changes.title ?? currentNormalized.title,
          changes.tags ?? currentNormalized.tags,
          changes.notes ?? currentNormalized.notes
        );
      }
      if (changes.url) {
        updates.url = changes.url;
      }
      
      await browser.bookmarks.update(mapping.browserId, updates);
      
      // Get updated bookmark
      const updated = await browser.bookmarks.get(mapping.browserId);
      return this.browserToNormalized(updated[0], changes.folderPath || currentNormalized.folderPath);
    } catch (error: any) {
      throw new Error(`Failed to update bookmark: ${error.message}`);
    }
  }

  /**
   * Delete a bookmark from the browser
   * 
   * @param hubmarkId - HubMark ID of bookmark to delete
   */
  async deleteBookmark(hubmarkId: string): Promise<void> {
    try {
      // Find browser ID from mapping
      const mapping = Array.from(this.idMappings.values())
        .find(m => m.hubmarkId === hubmarkId);
      
      if (!mapping) {
        throw new Error(`Bookmark ${hubmarkId} not found in mappings`);
      }
      
      // Delete browser bookmark
      await browser.bookmarks.remove(mapping.browserId);
      
      // Remove mapping
      this.idMappings.delete(mapping.browserId);
      await this.saveIdMappings();
    } catch (error: any) {
      throw new Error(`Failed to delete bookmark: ${error.message}`);
    }
  }

  /**
   * Ensure folder path exists, creating folders as needed
   * 
   * @param folderPath - Path like "Development/JavaScript"
   * @returns Browser ID of the final folder
   */
  private async ensureFolderPath(folderPath: string): Promise<string> {
    if (!folderPath) {
      // Return bookmarks bar or default folder
      const tree = await browser.bookmarks.getTree();
      return tree[0].children![0].id; // Usually bookmarks bar
    }
    
    const folders = folderPath.split('/').filter(f => f);
    let parentId = (await browser.bookmarks.getTree())[0].children![0].id;
    
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

  /**
   * Add metadata back to title for browser storage
   * 
   * @param title - Clean title
   * @param tags - Tags to add
   * @param notes - Notes to add
   * @returns Title with metadata
   */
  private addMetadataToTitle(title: string, tags: string[], notes: string): string {
    let result = title || '';
    
    if (tags && tags.length > 0) {
      result += ' ' + tags.map(tag => `#${tag}`).join(' ');
    }
    
    if (notes) {
      result += ` (${notes})`;
    }
    
    return result;
  }

  /**
   * Convert normalized bookmarks to StoredBookmark format for GitHub sync
   * 
   * @param normalized - Normalized bookmarks
   * @returns StoredBookmark array
   */
  normalizedToStored(normalized: NormalizedBookmark[]): StoredBookmark[] {
    return normalized.map(bookmark => ({
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      folder: bookmark.folderPath || '',
      tags: bookmark.tags || [],
      notes: bookmark.notes || '',
      dateAdded: bookmark.dateAdded,
      dateModified: bookmark.dateModified,
      archived: false,
      favorite: false
    }));
  }

  /**
   * Convert StoredBookmark from GitHub back to normalized format
   * 
   * @param stored - Stored bookmarks from GitHub
   * @returns Normalized bookmarks
   */
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

  /**
   * Detect changes between two bookmark sets for sync
   * 
   * @param oldBookmarks - Previous bookmark state
   * @param newBookmarks - Current bookmark state
   * @returns Changes detected
   */
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

  /**
   * Check if a bookmark has changed
   * 
   * @param old - Previous bookmark state
   * @param current - Current bookmark state
   * @returns True if changed
   */
  private hasChanged(old: NormalizedBookmark, current: NormalizedBookmark): boolean {
    return (
      old.title !== current.title ||
      old.url !== current.url ||
      old.folderPath !== current.folderPath ||
      JSON.stringify(old.tags) !== JSON.stringify(current.tags) ||
      old.notes !== current.notes
    );
  }

  /**
   * Merge bookmarks from GitHub with browser bookmarks
   * Implements conflict resolution based on timestamps
   * 
   * @param browserBookmarks - Current browser bookmarks
   * @param githubBookmarks - Bookmarks from GitHub
   * @returns Merged bookmarks with conflict resolution
   */
  mergeBookmarks(
    browserBookmarks: NormalizedBookmark[],
    githubBookmarks: NormalizedBookmark[]
  ): NormalizedBookmark[] {
    const merged = new Map<string, NormalizedBookmark>();
    
    // Add all browser bookmarks
    browserBookmarks.forEach(bookmark => {
      merged.set(bookmark.id, bookmark);
    });
    
    // Merge GitHub bookmarks
    githubBookmarks.forEach(githubBookmark => {
      const existing = merged.get(githubBookmark.id);
      
      if (!existing) {
        // New bookmark from GitHub
        merged.set(githubBookmark.id, githubBookmark);
      } else if (githubBookmark.dateModified > existing.dateModified) {
        // GitHub version is newer
        merged.set(githubBookmark.id, {
          ...githubBookmark,
          browserId: existing.browserId // Preserve browser ID
        });
      }
      // Otherwise keep browser version (it's newer)
    });
    
    return Array.from(merged.values());
  }
}

/**
 * Generate a unique bookmark ID
 * 
 * @returns Unique ID string
 */
export function generateBookmarkId(): string {
  return `hm_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate bookmark data structure
 * 
 * @param bookmark - Bookmark to validate
 * @returns True if valid
 * @throws Error with validation message if invalid
 */
export function validateBookmarkData(bookmark: Partial<NormalizedBookmark>): boolean {
  if (!bookmark.title || bookmark.title.trim().length === 0) {
    throw new Error('Bookmark title is required');
  }
  
  if (!bookmark.url || bookmark.url.trim().length === 0) {
    throw new Error('Bookmark URL is required');
  }
  
  try {
    new URL(bookmark.url);
  } catch {
    throw new Error('Invalid bookmark URL');
  }
  
  if (bookmark.tags && !Array.isArray(bookmark.tags)) {
    throw new Error('Tags must be an array');
  }
  
  return true;
}

/**
 * Extract domain from URL for grouping
 * 
 * @param url - Bookmark URL
 * @returns Domain name
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

// Export singleton instance only in browser environment
let bookmarkManager: BookmarkManager | undefined;

if (typeof browser !== 'undefined') {
  bookmarkManager = new BookmarkManager();
}

export { bookmarkManager };