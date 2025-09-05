import React, { useState, useEffect } from 'react';
import { useSettings } from '~/hooks/useSettings';
import { GitHubClient, validateGitHubToken } from '~/utils/github';
import type { GitHubConfig } from '~/utils/storage';

interface GitHubSetupProps {
  onComplete?: () => void;
  className?: string;
}

interface Repository {
  name: string;
  full_name: string;
  private: boolean;
  description?: string;
}

/**
 * Component for setting up GitHub integration
 * 
 * Handles token validation, repository selection/creation, and configuration
 */
export function GitHubSetup({ onComplete, className = '' }: GitHubSetupProps) {
  const { githubConfig, saveGitHubConfig, isConfigured } = useSettings();
  
  const [step, setStep] = useState<'token' | 'repository' | 'complete'>('token');
  const [token, setToken] = useState(githubConfig?.token || '');
  const [repoOwner, setRepoOwner] = useState(githubConfig?.repoOwner || '');
  const [repoName, setRepoName] = useState(githubConfig?.repoName || '');
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validatedUser, setValidatedUser] = useState<{ login: string; name?: string } | null>(null);

  // Initialize step based on current configuration
  useEffect(() => {
    if (isConfigured) {
      setStep('complete');
    } else if (githubConfig?.token) {
      setStep('repository');
    }
  }, [isConfigured, githubConfig]);

  /**
   * Validate GitHub token and fetch user info
   */
  const validateToken = async () => {
    if (!token.trim()) {
      setError('Please enter a GitHub token');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const user = await validateGitHubToken(token.trim());
      setValidatedUser(user);
      setRepoOwner(user.login);
      
      // Load user's repositories
      const github = new GitHubClient({
        token: token.trim(),
        repoOwner: user.login,
        repoName: '' // Not needed for listing repos
      });
      
      const repos = await github.listRepositories('owner', 50);
      setRepositories(repos);
      
      setStep('repository');
    } catch (err: any) {
      setError(err.message || 'Invalid GitHub token');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Create a new repository for bookmarks
   */
  const createRepository = async (name: string) => {
    if (!validatedUser || !token) return;

    setIsLoading(true);
    setError(null);

    try {
      const github = new GitHubClient({
        token,
        repoOwner: validatedUser.login,
        repoName: name
      });

      await github.createRepository({
        name,
        description: 'Bookmarks synced via HubMark',
        private: true,
        autoInit: true
      });

      setRepoName(name);
      await saveConfiguration(validatedUser.login, name);
    } catch (err: any) {
      setError(err.message || 'Failed to create repository');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Save GitHub configuration
   */
  const saveConfiguration = async (owner: string, name: string) => {
    const config: GitHubConfig = {
      token,
      repoOwner: owner,
      repoName: name
    };

    const success = await saveGitHubConfig(config);
    if (success) {
      setStep('complete');
      onComplete?.();
    }
  };

  /**
   * Reset configuration
   */
  const resetConfiguration = () => {
    setStep('token');
    setToken('');
    setRepoOwner('');
    setRepoName('');
    setValidatedUser(null);
    setRepositories([]);
    setError(null);
  };

  if (step === 'token') {
    return (
      <div className={`github-setup ${className}`}>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">Connect to GitHub</h3>
            <p className="text-sm text-gray-600 mb-4">
              Enter your GitHub personal access token to sync bookmarks.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Personal Access Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxx"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && validateToken()}
            />
            <p className="text-xs text-gray-500 mt-1">
              Need a token? <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Create one here</a>
            </p>
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
              {error}
            </div>
          )}

          <button
            onClick={validateToken}
            disabled={isLoading || !token.trim()}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Validating...' : 'Continue'}
          </button>
        </div>
      </div>
    );
  }

  if (step === 'repository') {
    return (
      <div className={`github-setup ${className}`}>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">Choose Repository</h3>
            <p className="text-sm text-gray-600 mb-4">
              Select an existing repository or create a new one for your bookmarks.
            </p>
          </div>

          <div>
            <h4 className="font-medium mb-2">Create New Repository</h4>
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="my-bookmarks"
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const input = e.target as HTMLInputElement;
                    if (input.value.trim()) {
                      createRepository(input.value.trim());
                    }
                  }
                }}
              />
              <button
                onClick={() => {
                  const input = document.querySelector('input[placeholder="my-bookmarks"]') as HTMLInputElement;
                  if (input.value.trim()) {
                    createRepository(input.value.trim());
                  }
                }}
                disabled={isLoading}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300"
              >
                Create
              </button>
            </div>
          </div>

          {repositories.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Or Select Existing Repository</h4>
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded">
                {repositories.map(repo => (
                  <div
                    key={repo.full_name}
                    className="p-3 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer"
                    onClick={() => saveConfiguration(repoOwner, repo.name)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{repo.name}</div>
                        {repo.description && (
                          <div className="text-sm text-gray-600">{repo.description}</div>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        {repo.private && (
                          <span className="text-xs bg-gray-200 px-2 py-1 rounded">Private</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
              {error}
            </div>
          )}

          <button
            onClick={resetConfiguration}
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            ← Back to token
          </button>
        </div>
      </div>
    );
  }

  if (step === 'complete') {
    return (
      <div className={`github-setup ${className}`}>
        <div className="text-center space-y-4">
          <div className="text-green-600 text-4xl">✓</div>
          <div>
            <h3 className="text-lg font-semibold mb-2">GitHub Connected</h3>
            <p className="text-sm text-gray-600">
              Successfully connected to <strong>{githubConfig?.repoOwner}/{githubConfig?.repoName}</strong>
            </p>
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={onComplete}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
            >
              Continue
            </button>
            <button
              onClick={resetConfiguration}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
            >
              Change
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}