import { useState, useEffect, useCallback } from 'react';
import { bookmarkManager } from '~/utils/bookmarks';
import type { NormalizedBookmark, SearchOptions } from '~/utils/bookmarks';

/**
 * Hook for managing bookmark operations
 * 
 * Provides state management for bookmark data, search, and CRUD operations
 */
export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<NormalizedBookmark[]>([]);
  const [filteredBookmarks, setFilteredBookmarks] = useState<NormalizedBookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('');

  /**
   * Load all bookmarks
   */
  const loadBookmarks = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('🔍 [POPUP] Loading bookmarks via bookmarkManager...');
      const allBookmarks = await bookmarkManager.getAllBookmarks();
      console.log('🔍 [POPUP] Loaded bookmarks:', allBookmarks.length, allBookmarks);
      setBookmarks(allBookmarks);
      setFilteredBookmarks(allBookmarks);
    } catch (err: any) {
      console.error('🔍 [POPUP] Failed to load bookmarks:', err);
      setError(err.message || 'Failed to load bookmarks');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Search bookmarks based on query and filters
   */
  const searchBookmarks = useCallback(async (options: SearchOptions) => {
    try {
      setError(null);
      
      const results = await bookmarkManager.searchBookmarks(options);
      setFilteredBookmarks(results);
      setSearchQuery(options.query);
      setSelectedFolder(options.folder || '');
    } catch (err: any) {
      setError(err.message || 'Search failed');
    }
  }, []);

  /**
   * Create a new bookmark
   */
  const createBookmark = useCallback(async (
    title: string,
    url: string,
    folderPath?: string,
    tags?: string[],
    notes?: string
  ): Promise<boolean> => {
    try {
      setError(null);
      
      const newBookmark = await bookmarkManager.createBookmark({
        title,
        url,
        folderPath: folderPath || '',
        tags: tags || [],
        notes: notes || ''
      });
      
      // Refresh bookmarks list
      await loadBookmarks();
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to create bookmark');
      return false;
    }
  }, [loadBookmarks]);

  /**
   * Update an existing bookmark
   */
  const updateBookmark = useCallback(async (
    id: string,
    updates: Partial<NormalizedBookmark>
  ): Promise<boolean> => {
    try {
      setError(null);
      
      await bookmarkManager.updateBookmark(id, updates);
      
      // Refresh bookmarks list
      await loadBookmarks();
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to update bookmark');
      return false;
    }
  }, [loadBookmarks]);

  /**
   * Delete a bookmark
   */
  const deleteBookmark = useCallback(async (id: string): Promise<boolean> => {
    try {
      setError(null);
      
      await bookmarkManager.deleteBookmark(id);
      
      // Refresh bookmarks list
      await loadBookmarks();
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to delete bookmark');
      return false;
    }
  }, [loadBookmarks]);

  /**
   * Clear search and show all bookmarks
   */
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSelectedFolder('');
    setFilteredBookmarks(bookmarks);
  }, [bookmarks]);

  /**
   * Get unique folder paths for filtering
   */
  const getFolderPaths = useCallback((): string[] => {
    const folders = new Set<string>();
    bookmarks.forEach(bookmark => {
      if (bookmark.folderPath) {
        // Add all parent paths
        const parts = bookmark.folderPath.split('/');
        for (let i = 1; i <= parts.length; i++) {
          folders.add(parts.slice(0, i).join('/'));
        }
      }
    });
    return Array.from(folders).sort();
  }, [bookmarks]);

  /**
   * Get unique tags for filtering
   */
  const getTags = useCallback((): string[] => {
    const tags = new Set<string>();
    bookmarks.forEach(bookmark => {
      bookmark.tags.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [bookmarks]);

  /**
   * Load bookmarks on mount
   */
  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  /**
   * Filter bookmarks when search query or folder changes
   */
  useEffect(() => {
    if (!searchQuery && !selectedFolder) {
      setFilteredBookmarks(bookmarks);
      return;
    }

    const options: SearchOptions = {
      query: searchQuery,
      searchIn: ['title', 'url', 'tags', 'notes'],
      folder: selectedFolder || undefined,
      limit: 100
    };

    searchBookmarks(options);
  }, [searchQuery, selectedFolder, bookmarks, searchBookmarks]);

  return {
    // State
    bookmarks: filteredBookmarks,
    allBookmarks: bookmarks,
    isLoading,
    error,
    searchQuery,
    selectedFolder,
    
    // Actions
    loadBookmarks,
    searchBookmarks,
    createBookmark,
    updateBookmark,
    deleteBookmark,
    clearSearch,
    setSearchQuery,
    setSelectedFolder,
    
    // Computed values
    folderPaths: getFolderPaths(),
    tags: getTags(),
    bookmarkCount: filteredBookmarks.length,
    totalBookmarks: bookmarks.length,
    hasBookmarks: bookmarks.length > 0,
    isFiltered: !!searchQuery || !!selectedFolder,
  };
}