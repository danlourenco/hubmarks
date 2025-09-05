/**
 * Stable ID generation for bookmarks
 * 
 * Creates deterministic IDs based on canonical URL and normalized title
 * to ensure consistent identification across sync operations
 */

/**
 * Browser-safe crypto utilities for MV3 compatibility
 * 
 * Uses the Web Crypto API to generate SHA-256 hashes without requiring Node.js Buffer
 * 
 * @param data - String data to hash
 * @returns Promise resolving to hexadecimal representation of SHA-256 hash
 * @internal
 */
async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Normalize title for consistent ID generation
 * 
 * Performs the following normalizations:
 * - Trims leading and trailing whitespace
 * - Collapses multiple consecutive spaces into single spaces
 * 
 * @param title - Raw bookmark title
 * @returns Normalized title string
 * @example
 * ```typescript
 * normalizeTitle("  Hello    World  ") // Returns "Hello World"
 * ```
 */
export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ');
}

/**
 * Canonicalize URL for stable ID generation
 * 
 * Rules:
 * - Convert to lowercase hostname
 * - Remove www. prefix
 * - Promote HTTP to HTTPS (configurable)
 * - Remove tracking parameters
 * - Remove trailing slashes (except root)
 * - Remove hash fragments
 * 
 * @param rawUrl - Raw URL string
 * @param promoteHttps - Whether to promote http:// to https:// (default: true)
 * @returns Canonical URL string
 */
export function canonicalUrl(rawUrl: string, promoteHttps = true): string {
  try {
    const url = new URL(rawUrl);
    
    // Promote HTTP to HTTPS if enabled
    if (promoteHttps && url.protocol === 'http:') {
      url.protocol = 'https:';
    }
    
    // Normalize hostname: lowercase and remove www
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    
    // Remove hash fragment
    url.hash = '';
    
    // Remove common tracking parameters
    const trackingParams = new Set([
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'gclid', 'fbclid', 'ref', 'referrer', 'source',
      '_ga', '_gl', 'mc_cid', 'mc_eid'
    ]);
    
    for (const param of Array.from(url.searchParams.keys())) {
      if (trackingParams.has(param)) {
        url.searchParams.delete(param);
      }
    }
    
    // Remove trailing slash (except for root path)
    if (url.pathname !== '/' && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    
    return url.toString();
  } catch (error) {
    // If URL parsing fails, return the original with basic cleanup
    return rawUrl.trim().toLowerCase();
  }
}

/**
 * Generate stable bookmark ID from URL and title
 * 
 * Uses SHA-256 hash of canonical URL + normalized title to create
 * deterministic IDs that remain consistent across sync operations
 * 
 * @param url - Bookmark URL
 * @param title - Bookmark title
 * @param promoteHttps - Whether to promote http to https in canonicalization
 * @returns Promise resolving to stable ID (format: hm_<hash>)
 */
export async function generateStableId(
  url: string, 
  title: string, 
  promoteHttps = true
): Promise<string> {
  const canonical = canonicalUrl(url, promoteHttps);
  const normalized = normalizeTitle(title);
  
  // Create composite key
  const key = `${canonical}\n${normalized}`;
  
  // Generate SHA-256 hash
  const hash = await sha256Hex(key);
  
  // Take first 32 characters for readability while maintaining uniqueness
  const truncatedHash = hash.substring(0, 32);
  
  return `hm_${truncatedHash}`;
}

/**
 * Validate stable ID format
 * 
 * @param id - ID to validate
 * @returns True if ID matches expected format
 */
export function isValidStableId(id: string): boolean {
  return /^hm_[a-z0-9]{32}$/.test(id);
}

/**
 * Compare two bookmarks for content differences
 * 
 * Compares all fields except dateAdded and dateModified to determine
 * if the bookmark content has actually changed
 * 
 * @param a - First bookmark
 * @param b - Second bookmark
 * @returns True if content differs
 */
export function bookmarkContentDiffers(a: BookmarkForComparison, b: BookmarkForComparison): boolean {
  // Normalize optional fields for comparison
  const folderA = a.folder || '';
  const folderB = b.folder || '';
  const notesA = a.notes || '';
  const notesB = b.notes || '';
  const archivedA = a.archived || false;
  const archivedB = b.archived || false;
  const favoriteA = a.favorite || false;
  const favoriteB = b.favorite || false;

  // Compare basic fields
  if (a.title !== b.title || 
      a.url !== b.url || 
      folderA !== folderB || 
      notesA !== notesB ||
      archivedA !== archivedB ||
      favoriteA !== favoriteB) {
    return true;
  }
  
  // Compare tags (order-insensitive)
  const tagsA = [...(a.tags || [])].sort();
  const tagsB = [...(b.tags || [])].sort();
  
  if (tagsA.length !== tagsB.length) {
    return true;
  }
  
  return tagsA.some((tag, index) => tag !== tagsB[index]);
}

/**
 * Interface for bookmark comparison (subset of fields)
 */
interface BookmarkForComparison {
  title: string;
  url: string;
  folder?: string;
  tags?: string[];
  notes?: string;
  archived?: boolean;
  favorite?: boolean;
}

/**
 * Generate content hash for quick bookmark comparison
 * 
 * Creates a hash of bookmark content (excluding dates) for efficient
 * change detection during sync operations
 * 
 * @param bookmark - Bookmark to hash
 * @returns Promise resolving to content hash
 */
export async function generateContentHash(bookmark: BookmarkForComparison): Promise<string> {
  const content = {
    title: bookmark.title,
    url: bookmark.url,
    folder: bookmark.folder || '',
    tags: [...(bookmark.tags || [])].sort(), // Order-independent
    notes: bookmark.notes || '',
    archived: bookmark.archived || false,
    favorite: bookmark.favorite || false
  };
  
  const contentString = JSON.stringify(content);
  const hash = await sha256Hex(contentString);
  
  // Return shortened hash for efficiency
  return hash.substring(0, 16);
}