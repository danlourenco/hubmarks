/**
 * TEMPORARY: Bookmark cleanup utilities
 * 
 * Run these functions in the browser console to clean up duplicate bookmarks
 */

import { bookmarkManager } from './bookmarks';

/**
 * Clean up duplicate bookmarks from browser
 * Call this from the browser console: cleanupDuplicates()
 */
export async function cleanupDuplicates() {
  if (!bookmarkManager) {
    console.error('❌ BookmarkManager not available');
    return 0;
  }

  try {
    console.log('🧹 Starting bookmark cleanup...');
    const removedCount = await bookmarkManager.cleanupDuplicateBookmarks();
    console.log(`✅ Cleanup complete! Removed ${removedCount} duplicate bookmarks.`);
    
    if (removedCount > 0) {
      console.log('💡 You may want to reload the extension or refresh the page to see the changes.');
    }
    
    return removedCount;
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    return 0;
  }
}

// Make it available globally for console access
if (typeof window !== 'undefined') {
  (window as any).cleanupDuplicates = cleanupDuplicates;
  console.log('🔧 Cleanup utility loaded. Run cleanupDuplicates() in console to remove duplicate bookmarks.');
}