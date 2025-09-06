import React from 'react';
import { useSync } from '~/hooks/useSync';
import { useGitHubConfig } from '~/hooks/useGitHubConfig';

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
    isLoading: isSyncLoading, 
    error: syncError, 
    hasConflicts, 
    isSyncing, 
    totalBookmarks, 
    lastSync 
  } = useSync();

  // Use direct storage access for config state (more reliable than background messaging)
  const { 
    isConfigured, 
    isLoading: isConfigLoading, 
    error: configError 
  } = useGitHubConfig();

  const isLoading = isSyncLoading || isConfigLoading;
  const error = syncError || configError;

  const getStatusColor = () => {
    if (error || !isConfigured) return 'text-error';
    if (hasConflicts) return 'text-warning';
    if (isSyncing) return 'text-info';
    return 'text-success';
  };

  const getStatusIcon = () => {
    if (error || !isConfigured) return '•';
    if (hasConflicts) return '•';
    if (isSyncing) return '•';
    return '•';
  };

  const getStatusText = () => {
    if (error) return 'Error';
    if (!isConfigured) return 'Not configured';
    if (hasConflicts) return 'Conflicts';
    if (isSyncing) return 'Syncing...';
    if (status?.status === 'idle' && lastSync) return 'Synced';
    if (status?.status === 'idle' && !lastSync) return 'Ready';
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
      <div className="flex items-center gap-2">
        <span className={`text-xs ${getStatusColor()}`}>
          {getStatusIcon()}
        </span>
        <span className={`text-sm ${getStatusColor()}`}>
          {getStatusText()}
        </span>
        {isConfigured && showDetails && (
          <span className="text-sm text-gray-500">
            • Last sync: {formatLastSync()}
          </span>
        )}
      </div>
      
      {error && showDetails && (
        <div className="mt-2 p-2 bg-red-50 rounded-md">
          <span className="text-xs text-red-700">{error}</span>
        </div>
      )}
      
      {hasConflicts && showDetails && (
        <div className="mt-2 p-2 bg-yellow-50 rounded-md">
          <span className="text-xs text-yellow-700">Conflicts detected. Manual resolution required.</span>
        </div>
      )}
    </div>
  );
}