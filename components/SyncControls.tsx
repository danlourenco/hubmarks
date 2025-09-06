import React, { useState } from 'react';
import { useSync } from '~/hooks/useSync';
import { useGitHubConfig } from '~/hooks/useGitHubConfig';
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
    isSyncing 
  } = useSync();

  // Use direct storage access for config state (more reliable than background messaging)
  const { isConfigured } = useGitHubConfig();

  const [syncDirection, setSyncDirection] = useState<SyncConfig['direction']>('bidirectional');
  const [showConflictResolution, setShowConflictResolution] = useState(false);

  /**
   * Handle manual sync trigger
   */
  const handleSync = async () => {
    console.log('🔘 [SyncControls] Sync button clicked, direction:', syncDirection);
    const result = await triggerSync(syncDirection);
    console.log('🔘 [SyncControls] Sync result:', result);
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
        <div className="alert alert-warning">
          <span>GitHub not configured</span>
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
            className="select select-bordered select-sm w-full"
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
          className="btn btn-primary flex-1"
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
            className="btn btn-warning"
            title="Resolve conflicts"
          >
            ⚡
          </button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="alert alert-error mt-3">
          <span>{error}</span>
        </div>
      )}

      {/* Conflict Resolution Panel */}
      {showConflictResolution && hasConflicts && (
        <div className="card bg-warning/10 border-warning mt-4">
          <div className="card-body">
          <h4 className="card-title text-warning">Resolve Conflicts</h4>
          <p className="text-sm mb-4">
            Conflicts were detected during sync. Choose how to resolve them:
          </p>
          
          <div className="space-y-2">
            <button
              onClick={() => handleResolveConflicts('latest-wins')}
              disabled={isLoading}
              className="btn btn-outline btn-warning w-full text-left justify-start p-3 h-auto"
            >
              <div>
                <div className="font-medium">Keep Latest Changes</div>
                <div className="text-sm opacity-70">
                  Prefer the most recently modified bookmarks
                </div>
              </div>
            </button>
            
            <button
              onClick={() => handleResolveConflicts('browser-wins')}
              disabled={isLoading}
              className="btn btn-outline btn-warning w-full text-left justify-start p-3 h-auto"
            >
              <div>
                <div className="font-medium">Keep Browser Version</div>
                <div className="text-sm opacity-70">
                  Prefer bookmarks from this browser
                </div>
              </div>
            </button>
            
            <button
              onClick={() => handleResolveConflicts('github-wins')}
              disabled={isLoading}
              className="btn btn-outline btn-warning w-full text-left justify-start p-3 h-auto"
            >
              <div>
                <div className="font-medium">Keep GitHub Version</div>
                <div className="text-sm opacity-70">
                  Prefer bookmarks from GitHub repository
                </div>
              </div>
            </button>
          </div>
          
            <div className="card-actions justify-end">
              <button
                onClick={() => setShowConflictResolution(false)}
                className="btn btn-sm btn-ghost"
              >
                Cancel
              </button>
            </div>
          </div>
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