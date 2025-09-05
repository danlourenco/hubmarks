import { useState, useEffect, useCallback } from 'react';
import { storageManager } from '~/utils/storage';
import type { ExtensionSettings, GitHubConfig } from '~/utils/storage';

/**
 * Hook for managing extension settings
 * 
 * Provides state management for user settings and GitHub configuration
 */
export function useSettings() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [githubConfig, setGitHubConfig] = useState<GitHubConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load settings from storage
   */
  const loadSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const [settingsData, configData] = await Promise.all([
        storageManager.getSettings(),
        storageManager.getGitHubConfig()
      ]);
      
      setSettings(settingsData);
      setGitHubConfig(configData);
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Save settings and notify background service
   */
  const saveSettings = useCallback(async (newSettings: Partial<ExtensionSettings>): Promise<boolean> => {
    try {
      setError(null);
      
      const updatedSettings = { ...settings, ...newSettings };
      await storageManager.saveSettings(updatedSettings);
      setSettings(updatedSettings);
      
      // Notify background service of settings change
      return new Promise((resolve) => {
        browser.runtime.sendMessage({
          type: 'UPDATE_SETTINGS',
          settings: updatedSettings
        }, (response) => {
          if (response?.success) {
            resolve(true);
          } else {
            setError(response?.error || 'Failed to update settings');
            resolve(false);
          }
        });
      });
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
      return false;
    }
  }, [settings]);

  /**
   * Save GitHub configuration
   */
  const saveGitHubConfig = useCallback(async (config: GitHubConfig): Promise<boolean> => {
    try {
      setError(null);
      
      await storageManager.saveGitHubConfig(config);
      setGitHubConfig(config);
      
      // Notify background service of GitHub config change
      return new Promise((resolve) => {
        browser.runtime.sendMessage({
          type: 'UPDATE_SETTINGS',
          settings: { github: config }
        }, (response) => {
          if (response?.success) {
            resolve(true);
          } else {
            setError(response?.error || 'Failed to update GitHub configuration');
            resolve(false);
          }
        });
      });
    } catch (err: any) {
      setError(err.message || 'Failed to save GitHub configuration');
      return false;
    }
  }, []);

  /**
   * Clear GitHub configuration
   */
  const clearGitHubConfig = useCallback(async (): Promise<boolean> => {
    try {
      setError(null);
      
      await storageManager.clearGitHubConfig();
      setGitHubConfig(null);
      
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to clear GitHub configuration');
      return false;
    }
  }, []);

  /**
   * Load settings on mount
   */
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return {
    // State
    settings,
    githubConfig,
    isLoading,
    error,
    
    // Actions
    loadSettings,
    saveSettings,
    saveGitHubConfig,
    clearGitHubConfig,
    
    // Computed values
    isConfigured: !!githubConfig?.token && !!githubConfig?.repoOwner && !!githubConfig?.repoName,
    autoSyncEnabled: settings?.autoSync ?? true,
    syncInterval: settings?.syncInterval ?? 300000, // 5 minutes default
    markdownFormat: settings?.markdownFormat ?? 'folder',
  };
}