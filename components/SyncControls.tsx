import React, { useState } from 'react';
import { useSync } from '~/hooks/useSync';
import type { SyncConfig } from '~/utils/sync';

interface SyncControlsProps {
  className?: string;
  showDirectionOptions?: boolean;
}

/**
 * Component providing sync operation controls
 * 
 * Handles manual sync triggers, conflict resolution, and sync direction options
 */
export function SyncControls({ 
  className = '', 
  showDirectionOptions = false 
}: SyncControlsProps) {
  const { 
    triggerSync, 
    resolveConflicts, 
    isLoading, 
    error, 
    hasConflicts, 
    isSyncing, 
    isConfigured 
  } = useSync();

  const [syncDirection, setSyncDirection] = useState<SyncConfig['direction']>('bidirectional');
  const [showConflictResolution, setShowConflictResolution] = useState(false);

  /**
   * Handle manual sync trigger
   */
  const handleSync = async () => {
    const result = await triggerSync(syncDirection);
    if (result?.conflicts?.length > 0) {
      setShowConflictResolution(true);
    }
  };

  /**
   * Handle conflict resolution
   */
  const handleResolveConflicts = async (strategy: string) => {
    const result = await resolveConflicts(strategy);
    if (result?.success) {
      setShowConflictResolution(false);
    }
  };

  if (!isConfigured) {
    return (
      <div className={`sync-controls ${className}`}>
        <div className="text-center py-4 text-gray-500">
          GitHub not configured
        </div>
      </div>
    );
  }

  return (
    <div className={`sync-controls ${className}`}>
      {/* Sync Direction Options */}
      {showDirectionOptions && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Sync Direction
          </label>
          <select
            value={syncDirection}
            onChange={(e) => setSyncDirection(e.target.value as SyncConfig['direction'])}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isSyncing}
          >
            <option value="bidirectional">⟷ Two-way sync</option>
            <option value="to-github">→ Browser to GitHub</option>
            <option value="from-github">← GitHub to Browser</option>
          </select>
        </div>
      )}

      {/* Main Sync Button */}
      <div className="flex space-x-2">
        <button
          onClick={handleSync}
          disabled={isSyncing || isLoading}
          className="flex-1 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {isSyncing ? (
            <>
              <span className="animate-spin mr-2">⟳</span>
              Syncing...
            </>
          ) : (
            <>
              <span className="mr-2">🔄</span>
              Sync Now
            </>
          )}
        </button>

        {hasConflicts && (
          <button
            onClick={() => setShowConflictResolution(!showConflictResolution)}
            className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
            title="Resolve conflicts"
          >
            ⚡
          </button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mt-3 text-red-600 text-sm bg-red-50 p-3 rounded">
          {error}
        </div>
      )}

      {/* Conflict Resolution Panel */}
      {showConflictResolution && hasConflicts && (
        <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded">
          <h4 className="font-medium text-orange-800 mb-3">Resolve Conflicts</h4>
          <p className="text-sm text-orange-700 mb-4">
            Conflicts were detected during sync. Choose how to resolve them:
          </p>
          
          <div className="space-y-2">
            <button
              onClick={() => handleResolveConflicts('latest-wins')}
              disabled={isLoading}
              className="w-full text-left p-3 bg-white border border-orange-200 rounded hover:bg-orange-50 disabled:opacity-50"
            >
              <div className="font-medium">Keep Latest Changes</div>
              <div className="text-sm text-gray-600">
                Prefer the most recently modified bookmarks
              </div>
            </button>
            
            <button
              onClick={() => handleResolveConflicts('browser-wins')}
              disabled={isLoading}
              className="w-full text-left p-3 bg-white border border-orange-200 rounded hover:bg-orange-50 disabled:opacity-50"
            >
              <div className="font-medium">Keep Browser Version</div>
              <div className="text-sm text-gray-600">
                Prefer bookmarks from this browser
              </div>
            </button>
            
            <button
              onClick={() => handleResolveConflicts('github-wins')}
              disabled={isLoading}
              className="w-full text-left p-3 bg-white border border-orange-200 rounded hover:bg-orange-50 disabled:opacity-50"
            >
              <div className="font-medium">Keep GitHub Version</div>
              <div className="text-sm text-gray-600">
                Prefer bookmarks from GitHub repository
              </div>
            </button>
          </div>
          
          <button
            onClick={() => setShowConflictResolution(false)}
            className="mt-3 text-sm text-orange-600 hover:text-orange-800"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Sync Direction Explanation */}
      {showDirectionOptions && (
        <div className="mt-3 text-xs text-gray-500">
          <div className="space-y-1">
            <div><strong>Two-way:</strong> Merge changes from both sources</div>
            <div><strong>To GitHub:</strong> Upload browser bookmarks to repository</div>
            <div><strong>From GitHub:</strong> Download repository bookmarks to browser</div>
          </div>
        </div>
      )}
    </div>
  );
}