import { Octokit } from '@octokit/rest';
import type { StoredBookmark, GitHubConfig } from './storage';
import { encodeBase64, decodeBase64 } from './base64';

// Removed generateSyncStableId() - no longer needed without Markdown parsing

/**
 * Repository information returned by GitHub API
 */
export interface RepositoryInfo {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  cloneUrl: string;
}

/**
 * File content and metadata from GitHub
 */
export interface GitHubFile {
  content: string;
  sha: string;
  path: string;
  encoding: string;
}

/**
 * Options for creating a new repository
 */
export interface CreateRepositoryOptions {
  name: string;
  description?: string;
  private?: boolean;
  autoInit?: boolean;
}

/**
 * GitHub API client for managing bookmark repositories
 * 
 * Handles all interactions with the GitHub API including:
 * - Repository management (create, list, get info)
 * - File operations (create, read, update, delete)
 * - Authentication and permission validation
 * - Branch management
 */
export class GitHubClient {
  private octokit: Octokit;
  private config: GitHubConfig;

  /**
   * Initialize GitHub client with configuration
   * 
   * @param config - GitHub configuration containing token, repo owner, and repo name
   */
  constructor(config: GitHubConfig) {
    this.config = config;
    this.octokit = new Octokit({
      auth: config.token,
    });
  }

  /**
   * Authenticate and verify GitHub token has required permissions
   * 
   * @returns Promise that resolves to user information if authentication successful
   * @throws Error if token is invalid or lacks required permissions
   */
  async authenticate(): Promise<{ login: string; id: number; name: string | null }> {
    try {
      const { data: user } = await this.octokit.rest.users.getAuthenticated();
      
      // Verify token has repo scope by checking permissions
      const { data: repos } = await this.octokit.rest.repos.listForAuthenticatedUser({
        per_page: 1,
        sort: 'updated'
      });
      
      return {
        login: user.login,
        id: user.id,
        name: user.name
      };
    } catch (error: any) {
      throw new Error(`GitHub authentication failed: ${error.message}`);
    }
  }

  /**
   * Create a new repository for storing bookmarks
   * 
   * @param options - Repository creation options
   * @returns Promise that resolves to created repository information
   * @throws Error if repository creation fails
   */
  async createRepository(options: CreateRepositoryOptions): Promise<RepositoryInfo> {
    try {
      const { data: repo } = await this.octokit.rest.repos.createForAuthenticatedUser({
        name: options.name,
        description: options.description || 'Bookmarks synced via HubMark extension',
        private: options.private ?? true,
        auto_init: options.autoInit ?? true,
      });

      return this.mapRepositoryInfo(repo);
    } catch (error: any) {
      throw new Error(`Failed to create repository: ${error.message}`);
    }
  }

  /**
   * List repositories accessible to the authenticated user
   * 
   * @param type - Repository type filter ('owner', 'member', 'all')
   * @param perPage - Number of repositories per page (default: 30)
   * @returns Promise that resolves to array of repository information
   */
  async listRepositories(type: 'owner' | 'member' | 'all' = 'owner', perPage = 30): Promise<RepositoryInfo[]> {
    try {
      const { data: repos } = await this.octokit.rest.repos.listForAuthenticatedUser({
        type,
        per_page: perPage,
        sort: 'updated',
        direction: 'desc'
      });

      return repos.map(repo => this.mapRepositoryInfo(repo));
    } catch (error: any) {
      throw new Error(`Failed to list repositories: ${error.message}`);
    }
  }

  /**
   * Get detailed information about a specific repository
   * 
   * @param owner - Repository owner username
   * @param repo - Repository name
   * @returns Promise that resolves to repository information
   * @throws Error if repository not found or access denied
   */
  async getRepositoryInfo(owner: string, repo: string): Promise<RepositoryInfo> {
    try {
      const { data: repository } = await this.octokit.rest.repos.get({
        owner,
        repo,
      });

      return this.mapRepositoryInfo(repository);
    } catch (error: any) {
      throw new Error(`Failed to get repository info: ${error.message}`);
    }
  }

  /**
   * Create a new file in the repository
   * 
   * @param path - File path relative to repository root
   * @param content - File content (will be base64 encoded automatically)
   * @param message - Commit message
   * @param branch - Target branch (defaults to repository default branch)
   * @returns Promise that resolves to file information
   * @throws Error if file already exists or creation fails
   */
  async createFile(path: string, content: string, message: string, branch?: string): Promise<GitHubFile> {
    try {
      const { data: result } = await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: this.config.repoOwner,
        repo: this.config.repoName,
        path,
        message,
        content: encodeBase64(content),
        branch,
      });

      return {
        content,
        sha: result.content!.sha,
        path: result.content!.path,
        encoding: 'utf8'
      };
    } catch (error: any) {
      throw new Error(`Failed to create file: ${error.message}`);
    }
  }

  /**
   * Update an existing file in the repository
   * 
   * @param path - File path relative to repository root
   * @param content - New file content
   * @param message - Commit message
   * @param sha - Current file SHA (required for updates)
   * @param branch - Target branch (defaults to repository default branch)
   * @returns Promise that resolves to updated file information
   * @throws Error if file doesn't exist or update fails
   */
  async updateFile(path: string, content: string, message: string, sha: string, branch?: string): Promise<GitHubFile> {
    try {
      const { data: result } = await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: this.config.repoOwner,
        repo: this.config.repoName,
        path,
        message,
        content: encodeBase64(content),
        sha,
        branch,
      });

      return {
        content,
        sha: result.content!.sha,
        path: result.content!.path,
        encoding: 'utf8'
      };
    } catch (error: any) {
      throw new Error(`Failed to update file: ${error.message}`);
    }
  }

  /**
   * Delete a file from the repository
   * 
   * @param path - File path relative to repository root
   * @param message - Commit message
   * @param sha - Current file SHA (required for deletion)
   * @param branch - Target branch (defaults to repository default branch)
   * @returns Promise that resolves when file is deleted
   * @throws Error if file doesn't exist or deletion fails
   */
  async deleteFile(path: string, message: string, sha: string, branch?: string): Promise<void> {
    try {
      await this.octokit.rest.repos.deleteFile({
        owner: this.config.repoOwner,
        repo: this.config.repoName,
        path,
        message,
        sha,
        branch,
      });
    } catch (error: any) {
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Retrieve file content and metadata from the repository
   * 
   * @param path - File path relative to repository root
   * @param branch - Source branch (defaults to repository default branch)
   * @returns Promise that resolves to file information
   * @throws Error if file not found
   */
  async getFileContent(path: string, branch?: string): Promise<GitHubFile> {
    try {
      const { data: result } = await this.octokit.rest.repos.getContent({
        owner: this.config.repoOwner,
        repo: this.config.repoName,
        path,
        ref: branch,
      });

      if (Array.isArray(result) || result.type !== 'file') {
        throw new Error(`Path ${path} is not a file`);
      }

      const content = result.encoding === 'base64' 
        ? decodeBase64(result.content)
        : result.content;

      return {
        content,
        sha: result.sha,
        path: result.path,
        encoding: 'utf8'
      };
    } catch (error: any) {
      throw new Error(`Failed to get file content: ${error.message}`);
    }
  }

  /**
   * List files and directories in a repository path
   * 
   * @param path - Directory path (empty string for root)
   * @param branch - Source branch (defaults to repository default branch)
   * @returns Promise that resolves to array of file/directory names
   * @throws Error if path not found or not a directory
   */
  async listFiles(path = '', branch?: string): Promise<string[]> {
    try {
      const { data: result } = await this.octokit.rest.repos.getContent({
        owner: this.config.repoOwner,
        repo: this.config.repoName,
        path,
        ref: branch,
      });

      if (!Array.isArray(result)) {
        throw new Error(`Path ${path} is not a directory`);
      }

      return result.map(item => item.name);
    } catch (error: any) {
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  /**
   * Create a new branch from the default branch or specified SHA
   * 
   * @param branchName - Name of the new branch
   * @param fromSha - SHA to create branch from (defaults to default branch HEAD)
   * @returns Promise that resolves when branch is created
   * @throws Error if branch creation fails
   */
  async createBranch(branchName: string, fromSha?: string): Promise<void> {
    try {
      if (!fromSha) {
        const { data: repo } = await this.octokit.rest.repos.get({
          owner: this.config.repoOwner,
          repo: this.config.repoName,
        });
        
        const { data: branch } = await this.octokit.rest.repos.getBranch({
          owner: this.config.repoOwner,
          repo: this.config.repoName,
          branch: repo.default_branch,
        });
        
        fromSha = branch.commit.sha;
      }

      await this.octokit.rest.git.createRef({
        owner: this.config.repoOwner,
        repo: this.config.repoName,
        ref: `refs/heads/${branchName}`,
        sha: fromSha,
      });
    } catch (error: any) {
      throw new Error(`Failed to create branch: ${error.message}`);
    }
  }

  /**
   * Get information about a branch
   * 
   * @param branchName - Branch name (defaults to repository default branch)
   * @returns Promise that resolves to branch information
   * @throws Error if branch not found
   */
  async getBranch(branchName?: string): Promise<{ name: string; sha: string; protected: boolean }> {
    try {
      if (!branchName) {
        const { data: repo } = await this.octokit.rest.repos.get({
          owner: this.config.repoOwner,
          repo: this.config.repoName,
        });
        branchName = repo.default_branch;
      }

      const { data: branch } = await this.octokit.rest.repos.getBranch({
        owner: this.config.repoOwner,
        repo: this.config.repoName,
        branch: branchName,
      });

      return {
        name: branch.name,
        sha: branch.commit.sha,
        protected: branch.protected,
      };
    } catch (error: any) {
      throw new Error(`Failed to get branch info: ${error.message}`);
    }
  }

  /**
   * Map GitHub API repository response to our RepositoryInfo interface
   * 
   * @param repo - Repository data from GitHub API
   * @returns Mapped repository information
   */
  private mapRepositoryInfo(repo: any): RepositoryInfo {
    return {
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      defaultBranch: repo.default_branch,
      htmlUrl: repo.html_url,
      cloneUrl: repo.clone_url,
    };
  }
}

/**
 * Validate GitHub personal access token
 * 
 * @param token - GitHub personal access token
 * @returns Promise that resolves to user info if token is valid
 * @throws Error if token is invalid or lacks required permissions
 */
export async function validateGitHubToken(token: string): Promise<{ login: string; name: string | null }> {
  const tempClient = new Octokit({ auth: token });
  
  try {
    const { data: user } = await tempClient.rest.users.getAuthenticated();
    
    // Test repo access
    await tempClient.rest.repos.listForAuthenticatedUser({ per_page: 1 });
    
    return {
      login: user.login,
      name: user.name,
    };
  } catch (error: any) {
    throw new Error(`Invalid GitHub token: ${error.message}`);
  }
}

