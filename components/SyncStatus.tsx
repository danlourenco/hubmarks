import React from 'react';
import { useSync } from '~/hooks/useSync';

interface SyncStatusProps {
  showDetails?: boolean;
  className?: string;
}

/**
 * Component displaying current sync status with visual indicators
 * 
 * Shows sync state, last sync time, bookmark count, and error messages
 */
export function SyncStatus({ showDetails = true, className = '' }: SyncStatusProps) {
  const { 
    status, 
    isLoading, 
    error, 
    isConfigured, 
    hasConflicts, 
    isSyncing, 
    totalBookmarks, 
    lastSync 
  } = useSync();

  const getStatusColor = () => {
    if (error || !isConfigured) return 'text-red-500';
    if (hasConflicts) return 'text-orange-500';
    if (isSyncing) return 'text-blue-500';
    return 'text-green-500';
  };

  const getStatusIcon = () => {
    if (error || !isConfigured) return '⚠';
    if (hasConflicts) return '⚡';
    if (isSyncing) return '⟳';
    return '✓';
  };

  const getStatusText = () => {
    if (error) return 'Error';
    if (!isConfigured) return 'Not configured';
    if (hasConflicts) return 'Conflicts';
    if (isSyncing) return 'Syncing...';
    if (status?.status === 'idle') return 'Synced';
    return 'Unknown';
  };

  const formatLastSync = () => {
    if (!lastSync) return 'Never';
    
    const now = Date.now();
    const diff = now - lastSync;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(lastSync).toLocaleDateString();
  };

  return (
    <div className={`sync-status ${className}`}>
      <div className="flex items-center space-x-2">
        <span className={`text-lg ${getStatusColor()} ${isSyncing ? 'animate-spin' : ''}`}>
          {getStatusIcon()}
        </span>
        <span className={`font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </span>
      </div>
      
      {showDetails && (
        <div className="mt-2 text-sm text-gray-600 space-y-1">
          {isConfigured && (
            <>
              <div className="flex justify-between">
                <span>Bookmarks:</span>
                <span className="font-medium">{totalBookmarks.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Last sync:</span>
                <span className="font-medium">{formatLastSync()}</span>
              </div>
            </>
          )}
          
          {error && (
            <div className="text-red-600 text-xs mt-2 p-2 bg-red-50 rounded">
              {error}
            </div>
          )}
        </div>
      )}
      
      {hasConflicts && showDetails && (
        <div className="mt-2 text-sm text-orange-600 bg-orange-50 p-2 rounded">
          Conflicts detected. Manual resolution required.
        </div>
      )}
    </div>
  );
}