import { useState, useEffect, useCallback } from 'react';
import type { SyncStatus, SyncResult, SyncConfig } from '~/utils/sync';

/**
 * Hook for managing sync operations with the background service
 * 
 * Provides state management for sync status, operations, and real-time updates
 */
export function useSync() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Send message to background service
   */
  const sendMessage = useCallback(async (message: any): Promise<any> => {
    return new Promise((resolve) => {
      browser.runtime.sendMessage(message, (response) => {
        if (browser.runtime.lastError) {
          setError(browser.runtime.lastError.message || 'Communication error');
        }
        resolve(response);
      });
    });
  }, []);

  /**
   * Fetch current sync status
   */
  const refreshStatus = useCallback(async () => {
    try {
      setError(null);
      const response = await sendMessage({ type: 'GET_SYNC_STATUS' });
      
      if (response?.success) {
        setStatus(response.status);
      } else {
        setError(response?.error || 'Failed to get sync status');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to get sync status');
    }
  }, [sendMessage]);

  /**
   * Trigger manual sync operation
   */
  const triggerSync = useCallback(async (direction?: SyncConfig['direction']): Promise<SyncResult | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await sendMessage({ 
        type: 'TRIGGER_SYNC', 
        direction 
      });
      
      if (response?.success) {
        await refreshStatus(); // Refresh status after sync
        return response.result;
      } else {
        setError(response?.error || 'Sync failed');
        return null;
      }
    } catch (err: any) {
      setError(err.message || 'Sync failed');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [sendMessage, refreshStatus]);

  /**
   * Resolve sync conflicts
   */
  const resolveConflicts = useCallback(async (strategy: string): Promise<SyncResult | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await sendMessage({ 
        type: 'RESOLVE_CONFLICTS', 
        strategy 
      });
      
      if (response?.success) {
        await refreshStatus(); // Refresh status after resolution
        return response.result;
      } else {
        setError(response?.error || 'Conflict resolution failed');
        return null;
      }
    } catch (err: any) {
      setError(err.message || 'Conflict resolution failed');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [sendMessage, refreshStatus]);

  /**
   * Initialize and fetch status on mount
   */
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  return {
    // State
    status,
    isLoading,
    error,
    
    // Actions
    refreshStatus,
    triggerSync,
    resolveConflicts,
    
    // Computed values
    isConfigured: status?.isGitHubConfigured ?? false,
    hasConflicts: status?.status === 'conflicts',
    isSyncing: status?.status === 'syncing' || isLoading,
    totalBookmarks: status?.totalBookmarks ?? 0,
    lastSync: status?.lastSync ?? 0,
  };
}