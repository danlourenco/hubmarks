import { useState, useEffect } from 'react';
import { storageManager } from '~/utils/storage';
import type { GitHubConfig } from '~/utils/storage';

/**
 * Hook for directly accessing GitHub config from storage
 * 
 * This bypasses the background service messaging and reads directly from browser.storage
 * Useful for popup context where we need immediate config state
 */
export function useGitHubConfig() {
  const [config, setConfig] = useState<GitHubConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('🔧 [useGitHubConfig] Loading config directly from storage...');
      
      const githubConfig = await storageManager.getGitHubConfig();
      console.log('🔧 [useGitHubConfig] Config loaded:', githubConfig);
      
      setConfig(githubConfig);
    } catch (err: any) {
      console.error('🔧 [useGitHubConfig] Failed to load config:', err);
      setError(err.message || 'Failed to load GitHub config');
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfig = async (newConfig: GitHubConfig) => {
    try {
      setError(null);
      console.log('🔧 [useGitHubConfig] Saving config:', newConfig);
      
      await storageManager.saveGitHubConfig(newConfig);
      setConfig(newConfig);
      
      console.log('🔧 [useGitHubConfig] Config saved successfully');
      return true;
    } catch (err: any) {
      console.error('🔧 [useGitHubConfig] Failed to save config:', err);
      setError(err.message || 'Failed to save GitHub config');
      return false;
    }
  };

  return {
    config,
    isConfigured: !!config,
    isLoading,
    error,
    saveConfig,
    reloadConfig: loadConfig,
  };
}