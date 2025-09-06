import React, { useState, useEffect } from 'react';
import { useSettings } from '~/hooks/useSettings';
import { useSync } from '~/hooks/useSync';
import { useBookmarks } from '~/hooks/useBookmarks';
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
  const { triggerSync, isSyncing } = useSync();
  const { totalBookmarks } = useBookmarks();
  
  console.log('🔍 [GitHubSetup] useBookmarks().totalBookmarks:', totalBookmarks);
  
  const [step, setStep] = useState<'token' | 'repository' | 'complete'>('token');
  const [token, setToken] = useState(githubConfig?.token || '');
  const [repoOwner, setRepoOwner] = useState(githubConfig?.repoOwner || '');
  const [repoName, setRepoName] = useState(githubConfig?.repoName || '');
  const [newRepoName, setNewRepoName] = useState('');
  const [selectedRepoName, setSelectedRepoName] = useState('');
  const [repoFilter, setRepoFilter] = useState('');
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
              value={token || ''}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxx"
              className="input input-bordered w-full"
              onKeyDown={(e) => e.key === 'Enter' && validateToken()}
            />
            <p className="text-xs text-gray-500 mt-1">
              Need a token? <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Create one here</a>
            </p>
          </div>

          {error && (
            <div className="alert alert-error">
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={validateToken}
            disabled={isLoading || !token?.trim()}
            className="btn btn-primary w-full"
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
            <div className="join w-full">
              <input
                type="text"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                placeholder="my-bookmarks"
                className="input input-bordered join-item flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newRepoName.trim()) {
                    createRepository(newRepoName.trim());
                  }
                }}
              />
              <button
                onClick={() => {
                  if (newRepoName.trim()) {
                    createRepository(newRepoName.trim());
                  }
                }}
                disabled={isLoading || !newRepoName.trim()}
                className="btn btn-success join-item"
              >
                Create
              </button>
            </div>
          </div>

          {repositories.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Or Select Existing Repository</h4>
              
              {/* Filter Input */}
              <div className="mb-3">
                <input
                  type="text"
                  value={repoFilter}
                  onChange={(e) => setRepoFilter(e.target.value)}
                  placeholder="Filter repositories..."
                  className="input input-bordered input-sm w-full"
                />
              </div>

              {/* Repository Dropdown */}
              <div className="form-control mb-3">
                <select
                  value={selectedRepoName}
                  onChange={(e) => setSelectedRepoName(e.target.value)}
                  className="select select-bordered w-full"
                >
                  <option value="">Choose a repository...</option>
                  {repositories
                    .filter(repo => 
                      repo.name.toLowerCase().includes(repoFilter.toLowerCase()) ||
                      (repo.description?.toLowerCase() || '').includes(repoFilter.toLowerCase())
                    )
                    .map(repo => (
                      <option key={repo.full_name} value={repo.name}>
                        {repo.name} {repo.private ? '(Private)' : ''}
                        {repo.description ? ` - ${repo.description.slice(0, 50)}${repo.description.length > 50 ? '...' : ''}` : ''}
                      </option>
                    ))}
                </select>
              </div>

              {/* Selected Repository Preview */}
              {selectedRepoName && (() => {
                const selectedRepo = repositories.find(r => r.name === selectedRepoName);
                return selectedRepo ? (
                  <div className="card bg-base-100 border border-base-300 mb-3">
                    <div className="card-body p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="font-semibold">{selectedRepo.name}</h5>
                          {selectedRepo.description && (
                            <p className="text-sm text-base-content/70 mt-1">{selectedRepo.description}</p>
                          )}
                        </div>
                        {selectedRepo.private && (
                          <div className="badge badge-ghost badge-sm">Private</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Confirm Selection Button */}
              {selectedRepoName && (
                <button
                  onClick={() => saveConfiguration(repoOwner, selectedRepoName)}
                  disabled={isLoading}
                  className="btn btn-primary w-full"
                >
                  Use Repository: {selectedRepoName}
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="alert alert-error">
              <span>{error}</span>
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
        <div className="space-y-6">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <div className="w-6 h-1 bg-green-600 dark:bg-green-400 rotate-45 absolute"></div>
              <div className="w-3 h-1 bg-green-600 dark:bg-green-400 -rotate-45"></div>
            </div>
            <h3 className="text-lg font-semibold mb-2 text-base-content">GitHub Connected</h3>
            <p className="text-sm text-base-content/70">
              Successfully connected to <strong className="text-base-content">{githubConfig?.repoOwner}/{githubConfig?.repoName}</strong>
            </p>
          </div>
          
          <div className="divider"></div>
          
          <div className="flex gap-2">
            <button
              onClick={() => setStep('repository')}
              className="btn btn-sm btn-outline flex-1"
            >
              Change Repository
            </button>
            <button
              onClick={resetConfiguration}
              className="btn btn-sm btn-error btn-outline"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}