import { getSyncManager } from '~/utils/sync';
import { storageManager } from '~/utils/storage';
import { bookmarkManager } from '~/utils/bookmarks';

// WXT storage definitions for MV3 compatibility
const pendingSyncReason = storage.defineItem<string>('local:pendingSyncReason');

/**
 * Background service worker for HubMark extension
 * 
 * Responsibilities:
 * - Initialize sync manager and schedule periodic syncs
 * - Listen for bookmark changes and trigger syncs
 * - Handle extension lifecycle events
 * - Manage extension badge and notifications
 * - Process sync operations in background
 */
export default defineBackground(() => {
  console.log('HubMark background service starting...', { 
    id: browser.runtime.id,
    timestamp: new Date().toISOString()
  });

  let syncManager: Awaited<ReturnType<typeof getSyncManager>> | null = null;
  const debounceAlarmName = 'hubmark-debounce-sync';

  /**
   * Initialize the background service
   */
  async function initialize(): Promise<void> {
    try {
      // Initialize sync manager
      syncManager = await getSyncManager();
      console.log('Sync manager initialized');

      // Setup bookmark change listeners
      if (bookmarkManager && typeof browser.bookmarks !== 'undefined') {
        setupBookmarkListeners();
        console.log('Bookmark change listeners registered');
      }

      // Setup periodic sync
      await setupPeriodicSync();
      console.log('Periodic sync configured');

      // Update extension badge
      await updateBadge();
      console.log('Extension badge updated');

      // Perform initial sync check
      await performInitialSync();
      console.log('Initial sync check completed');

    } catch (error) {
      console.error('Failed to initialize background service:', error);
    }
  }

  /**
   * Setup bookmark change listeners
   */
  function setupBookmarkListeners(): void {
    if (!browser.bookmarks) return;

    // Listen for bookmark creation
    browser.bookmarks.onCreated?.addListener((id, bookmark) => {
      console.log('Bookmark created:', { id, title: bookmark.title });
      scheduleSync('Bookmark added');
    });

    // Listen for bookmark changes
    browser.bookmarks.onChanged?.addListener((id, changeInfo) => {
      console.log('Bookmark changed:', { id, changeInfo });
      scheduleSync('Bookmark modified');
    });

    // Listen for bookmark removal
    browser.bookmarks.onRemoved?.addListener((id, removeInfo) => {
      console.log('Bookmark removed:', { id, removeInfo });
      scheduleSync('Bookmark deleted');
    });

    // Listen for bookmark moves
    browser.bookmarks.onMoved?.addListener((id, moveInfo) => {
      console.log('Bookmark moved:', { id, moveInfo });
      scheduleSync('Bookmark moved');
    });
  }

  /**
   * Schedule a sync operation with debouncing using Chrome alarms (MV3 compatible)
   * 
   * @param reason - Reason for the sync
   */
  function scheduleSync(reason: string): void {
    // Clear existing alarm to debounce rapid changes
    chrome.alarms.clear(debounceAlarmName);

    // Schedule sync after a short delay to batch changes
    // Note: Chrome alarms minimum is typically 1 minute in production, but shorter delays work in development
    chrome.alarms.create(debounceAlarmName, {
      delayInMinutes: 0.033 // ~2 seconds (will be rounded up to minimum in production)
    });
    
    // Store the reason in storage for the alarm handler
    pendingSyncReason.setValue(reason).catch(console.error);
  }

  /**
   * Setup periodic sync based on user settings
   */
  async function setupPeriodicSync(): Promise<void> {
    try {
      const settings = await storageManager.getSettings();
      
      if (settings.autoSync && settings.syncInterval && syncManager) {
        syncManager.scheduleSync(settings.syncInterval);
        console.log(`Periodic sync enabled: ${settings.syncInterval}ms`);
      } else {
        console.log('Periodic sync disabled in settings');
      }
    } catch (error) {
      console.error('Failed to setup periodic sync:', error);
    }
  }

  /**
   * Update extension badge with sync status
   * 
   * @param status - Current status
   */
  async function updateBadge(status?: 'syncing' | 'error' | 'success'): Promise<void> {
    try {
      if (!syncManager) return;

      const syncStatus = await syncManager.getStatus();
      
      let badgeText = '';
      let badgeColor = '#4CAF50'; // Green
      let title = 'HubMark - Bookmark Sync';

      switch (status || syncStatus.status) {
        case 'syncing':
          badgeText = '⟳';
          badgeColor = '#2196F3'; // Blue
          title = 'HubMark - Syncing...';
          break;
          
        case 'error':
          badgeText = '⚠';
          badgeColor = '#F44336'; // Red
          title = 'HubMark - Sync Error';
          break;
          
        case 'conflicts':
          badgeText = '⚡';
          badgeColor = '#FF9800'; // Orange
          title = 'HubMark - Conflicts Need Resolution';
          break;
          
        case 'idle':
          if (syncStatus.totalBookmarks > 0) {
            badgeText = syncStatus.totalBookmarks > 99 ? '99+' : syncStatus.totalBookmarks.toString();
            badgeColor = '#4CAF50'; // Green
            title = `HubMark - ${syncStatus.totalBookmarks} bookmarks synced`;
          }
          break;
      }

      // Update badge
      if (browser.action) {
        await browser.action.setBadgeText({ text: badgeText });
        await browser.action.setBadgeBackgroundColor({ color: badgeColor });
        await browser.action.setTitle({ title });
      }

    } catch (error) {
      console.error('Failed to update badge:', error);
    }
  }

  /**
   * Perform initial sync check on extension startup
   */
  async function performInitialSync(): Promise<void> {
    try {
      if (!syncManager) return;

      const status = await syncManager.getStatus();
      
      // Only sync if GitHub is configured and it's been a while since last sync
      if (status.isGitHubConfigured && status.lastSync > 0) {
        const timeSinceLastSync = Date.now() - status.lastSync;
        const fiveMinutes = 5 * 60 * 1000;
        
        if (timeSinceLastSync > fiveMinutes) {
          console.log('Performing startup sync...');
          await updateBadge('syncing');
          
          const result = await syncManager.performSync({
            direction: 'bidirectional',
            strategy: 'latest-wins'
          });
          
          if (result.success) {
            await updateBadge('success');
            console.log('Startup sync completed successfully');
          } else {
            await updateBadge('error');
            console.error('Startup sync failed:', result.errors);
          }
        }
      }
    } catch (error) {
      console.error('Initial sync check failed:', error);
      await updateBadge('error');
    }
  }

  /**
   * Handle extension messages from popup/options
   */
  browser.runtime.onMessage?.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message);

    switch (message.type) {
      case 'TRIGGER_SYNC':
        handleTriggerSync(message, sendResponse);
        return true; // Keep channel open for async response

      case 'GET_SYNC_STATUS':
        handleGetSyncStatus(sendResponse);
        return true;

      case 'UPDATE_SETTINGS':
        handleUpdateSettings(message, sendResponse);
        return true;

      case 'RESOLVE_CONFLICTS':
        handleResolveConflicts(message, sendResponse);
        return true;

      default:
        console.warn('Unknown message type:', message.type);
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  });

  /**
   * Handle manual sync trigger from UI
   */
  async function handleTriggerSync(
    message: { type: 'TRIGGER_SYNC'; direction?: 'bidirectional' | 'to-github' | 'from-github' },
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      if (!syncManager) {
        throw new Error('Sync manager not initialized');
      }

      await updateBadge('syncing');
      
      const result = await syncManager.performSync({
        direction: message.direction || 'bidirectional',
        strategy: 'latest-wins'
      });

      if (result.success) {
        await updateBadge('success');
      } else if (result.conflicts.length > 0) {
        await updateBadge('conflicts');
      } else {
        await updateBadge('error');
      }

      sendResponse({ success: result.success, result });
    } catch (error: any) {
      console.error('Manual sync failed:', error);
      await updateBadge('error');
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Handle sync status request from UI
   */
  async function handleGetSyncStatus(sendResponse: (response: any) => void): Promise<void> {
    try {
      if (!syncManager) {
        throw new Error('Sync manager not initialized');
      }

      const status = await syncManager.getStatus();
      const validation = await syncManager.validateSyncState();
      
      sendResponse({ 
        success: true, 
        status: {
          ...status,
          validation
        }
      });
    } catch (error: any) {
      console.error('Failed to get sync status:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Handle settings update from options page
   */
  async function handleUpdateSettings(
    message: { type: 'UPDATE_SETTINGS'; settings: any },
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      await storageManager.saveSettings(message.settings);
      
      // Update GitHub config if provided
      if (message.settings.github) {
        if (syncManager) {
          await syncManager.updateGitHubConfig(message.settings.github);
        }
      }

      // Restart periodic sync with new settings
      await setupPeriodicSync();
      await updateBadge();
      
      sendResponse({ success: true });
    } catch (error: any) {
      console.error('Failed to update settings:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Handle conflict resolution from UI
   */
  async function handleResolveConflicts(
    message: { type: 'RESOLVE_CONFLICTS'; strategy: string },
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      if (!syncManager) {
        throw new Error('Sync manager not initialized');
      }

      await updateBadge('syncing');
      
      const result = await syncManager.performSync({
        direction: 'bidirectional',
        strategy: message.strategy as any
      });

      if (result.success) {
        await updateBadge('success');
      } else if (result.conflicts.length > 0) {
        await updateBadge('conflicts');
      } else {
        await updateBadge('error');
      }

      sendResponse({ success: result.success, result });
    } catch (error: any) {
      console.error('Conflict resolution failed:', error);
      await updateBadge('error');
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Handle extension lifecycle events
   */
  browser.runtime.onStartup?.addListener(() => {
    console.log('Extension startup detected');
    initialize();
  });

  browser.runtime.onInstalled?.addListener((details) => {
    console.log('Extension installed/updated:', details);
    
    if (details.reason === 'install') {
      // First time installation - could show welcome page
      console.log('First time installation');
    } else if (details.reason === 'update') {
      console.log('Extension updated from:', details.previousVersion);
    }
    
    initialize();
  });

  // Handle chrome alarms for debounced sync
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === debounceAlarmName) {
      const reason = await pendingSyncReason.getValue() || 'Bookmark change';
      console.log(`Triggering sync: ${reason}`);
      
      try {
        if (syncManager) {
          await syncManager.queueOperation({
            type: 'sync',
            config: {
              direction: 'bidirectional',
              strategy: 'latest-wins',
              batchSize: 50,
              retryAttempts: 3,
              retryDelay: 1000,
            }
          });
          
          await updateBadge();
        }
      } catch (error) {
        console.error('Sync operation failed:', error);
        await updateBadge('error');
      }
      
      // Clear the pending sync reason
      await pendingSyncReason.removeValue();
    }
  });
  
  // Note: onSuspend is not available in MV3 service workers
  // Service workers automatically suspend/resume as needed
  // Chrome alarms persist across suspensions

  // Initialize immediately
  initialize();
});