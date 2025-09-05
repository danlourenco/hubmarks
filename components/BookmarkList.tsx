import React, { useState } from 'react';
import { useBookmarks } from '~/hooks/useBookmarks';
import type { NormalizedBookmark } from '~/utils/bookmarks';

interface BookmarkListProps {
  limit?: number;
  showSearch?: boolean;
  onBookmarkClick?: (bookmark: NormalizedBookmark) => void;
  className?: string;
}

/**
 * Component for displaying and managing bookmarks list
 * 
 * Features search, filtering, and basic bookmark operations
 */
export function BookmarkList({ 
  limit = 50, 
  showSearch = true, 
  onBookmarkClick,
  className = '' 
}: BookmarkListProps) {
  const { 
    bookmarks, 
    isLoading, 
    error, 
    searchQuery, 
    selectedFolder,
    folderPaths,
    bookmarkCount,
    totalBookmarks,
    isFiltered,
    setSearchQuery,
    setSelectedFolder,
    clearSearch,
    deleteBookmark 
  } = useBookmarks();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const displayedBookmarks = bookmarks.slice(0, limit);

  const handleDeleteClick = (e: React.MouseEvent, bookmarkId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(bookmarkId);
  };

  const confirmDelete = async (bookmarkId: string) => {
    const success = await deleteBookmark(bookmarkId);
    if (success) {
      setShowDeleteConfirm(null);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(null);
  };

  const getFaviconUrl = (url: string) => {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?sz=16&domain=${domain}`;
    } catch {
      return null;
    }
  };

  if (isLoading) {
    return (
      <div className={`bookmark-list ${className}`}>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin text-2xl">⟳</div>
          <span className="ml-2 text-gray-600">Loading bookmarks...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bookmark-list ${className}`}>
      {showSearch && (
        <div className="search-controls mb-4 space-y-2">
          <div className="flex space-x-2">
            <input
              type="text"
              placeholder="Search bookmarks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {isFiltered && (
              <button
                onClick={clearSearch}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          
          {folderPaths.length > 0 && (
            <select
              value={selectedFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All folders</option>
              {folderPaths.map(folder => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {error && (
        <div className="text-red-600 text-sm bg-red-50 p-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="bookmark-count text-sm text-gray-600 mb-3">
        {isFiltered ? (
          <>
            Showing {bookmarkCount} of {totalBookmarks} bookmarks
            {bookmarkCount > limit && ` (first ${limit})`}
          </>
        ) : (
          <>
            {totalBookmarks} bookmarks
            {totalBookmarks > limit && ` (showing first ${limit})`}
          </>
        )}
      </div>

      {displayedBookmarks.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {isFiltered ? 'No bookmarks match your search' : 'No bookmarks found'}
        </div>
      ) : (
        <div className="bookmark-items space-y-2">
          {displayedBookmarks.map(bookmark => (
            <div
              key={bookmark.id}
              className="bookmark-item border border-gray-200 rounded p-3 hover:bg-gray-50 cursor-pointer group"
              onClick={() => onBookmarkClick?.(bookmark)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    {getFaviconUrl(bookmark.url) && (
                      <img
                        src={getFaviconUrl(bookmark.url)!}
                        alt=""
                        className="w-4 h-4 flex-shrink-0"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    )}
                    <h4 className="font-medium text-gray-900 truncate">
                      {bookmark.title}
                    </h4>
                  </div>
                  
                  <div className="text-sm text-blue-600 truncate mb-1">
                    {bookmark.url}
                  </div>
                  
                  {bookmark.folderPath && (
                    <div className="text-xs text-gray-500 mb-1">
                      📁 {bookmark.folderPath}
                    </div>
                  )}
                  
                  {bookmark.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {bookmark.tags.map(tag => (
                        <span
                          key={tag}
                          className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  {bookmark.notes && (
                    <div className="text-sm text-gray-600 italic">
                      {bookmark.notes}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.open(bookmark.url, '_blank');
                    }}
                    className="p-1 text-gray-400 hover:text-blue-600"
                    title="Open bookmark"
                  >
                    🔗
                  </button>
                  <button
                    onClick={(e) => handleDeleteClick(e, bookmark.id)}
                    className="p-1 text-gray-400 hover:text-red-600"
                    title="Delete bookmark"
                  >
                    🗑
                  </button>
                </div>
              </div>
              
              {/* Delete confirmation */}
              {showDeleteConfirm === bookmark.id && (
                <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded">
                  <div className="text-sm text-red-800 mb-2">
                    Delete this bookmark?
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => confirmDelete(bookmark.id)}
                      className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                    >
                      Delete
                    </button>
                    <button
                      onClick={cancelDelete}
                      className="px-3 py-1 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}