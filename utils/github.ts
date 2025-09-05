import { Octokit } from '@octokit/rest';
import type { StoredBookmark, GitHubConfig } from './storage';
import { encodeBase64, decodeBase64 } from './base64';

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

/**
 * Convert array of bookmarks to organized Markdown content
 * 
 * @param bookmarks - Array of bookmarks to convert
 * @param groupBy - How to organize bookmarks ('folder', 'date', 'tags', or 'none')
 * @returns Markdown formatted content
 */
export function generateMarkdownContent(
  bookmarks: StoredBookmark[], 
  groupBy: 'folder' | 'date' | 'tags' | 'none' = 'folder'
): string {
  if (bookmarks.length === 0) {
    return '# Bookmarks\n\nNo bookmarks yet.\n';
  }

  let content = '# Bookmarks\n\n';
  content += `*Last updated: ${new Date().toISOString().split('T')[0]}*\n\n`;

  switch (groupBy) {
    case 'folder':
      content += generateByFolder(bookmarks);
      break;
    case 'date':
      content += generateByDate(bookmarks);
      break;
    case 'tags':
      content += generateByTags(bookmarks);
      break;
    default:
      content += generateFlat(bookmarks);
  }

  return content;
}

/**
 * Parse Markdown content back to bookmark objects
 * 
 * @param content - Markdown content to parse
 * @returns Array of parsed bookmarks
 */
export function parseMarkdownContent(content: string): StoredBookmark[] {
  const bookmarks: StoredBookmark[] = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Match markdown link format: - [Title](URL)
    const linkMatch = line.match(/^-\s*\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const [, title, url] = linkMatch;
      
      // Look for metadata in subsequent lines
      let notes = '';
      let tags: string[] = [];
      let folder = '';
      
      // Check next few lines for metadata
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const nextLine = lines[j].trim();
        if (nextLine.startsWith('*Tags:')) {
          tags = nextLine.replace('*Tags:', '').replace(/\*$/, '').trim().split(',').map(t => t.trim()).filter(t => t);
        } else if (nextLine.startsWith('*Notes:')) {
          notes = nextLine.replace('*Notes:', '').replace(/\*$/, '').trim();
        } else if (nextLine.startsWith('*Folder:')) {
          folder = nextLine.replace('*Folder:', '').replace(/\*$/, '').trim();
        }
      }
      
      bookmarks.push({
        id: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title,
        url,
        tags: tags.length > 0 ? tags : undefined,
        notes: notes || undefined,
        folder: folder || undefined,
        dateAdded: Date.now(),
        dateModified: Date.now(),
      });
    }
  }
  
  return bookmarks;
}

/**
 * Create a safe filename from bookmark title
 * 
 * @param title - Bookmark title
 * @param maxLength - Maximum filename length (default: 50)
 * @returns Safe filename string
 */
export function sanitizeFilename(title: string, maxLength = 50): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .substring(0, maxLength) // Limit length
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Generate conventional commit message for bookmark operations
 * 
 * @param operation - Type of operation ('add', 'update', 'delete')
 * @param bookmarkTitle - Title of the affected bookmark
 * @returns Formatted commit message
 */
export function formatCommitMessage(operation: 'add' | 'update' | 'delete', bookmarkTitle: string): string {
  const shortTitle = bookmarkTitle.length > 50 ? `${bookmarkTitle.substr(0, 47)}...` : bookmarkTitle;
  
  switch (operation) {
    case 'add':
      return `feat: add bookmark "${shortTitle}"`;
    case 'update':
      return `chore: update bookmark "${shortTitle}"`;
    case 'delete':
      return `chore: remove bookmark "${shortTitle}"`;
    default:
      return `chore: modify bookmark "${shortTitle}"`;
  }
}

// Helper functions for markdown generation

function generateByFolder(bookmarks: StoredBookmark[]): string {
  const grouped = new Map<string, StoredBookmark[]>();
  
  bookmarks.forEach(bookmark => {
    const folder = bookmark.folder || 'Uncategorized';
    if (!grouped.has(folder)) {
      grouped.set(folder, []);
    }
    grouped.get(folder)!.push(bookmark);
  });
  
  let content = '';
  [...grouped.entries()].sort().forEach(([folder, bookmarks]) => {
    content += `## ${folder}\n\n`;
    content += generateBookmarkList(bookmarks);
    content += '\n';
  });
  
  return content;
}

function generateByDate(bookmarks: StoredBookmark[]): string {
  const sorted = [...bookmarks].sort((a, b) => b.dateAdded - a.dateAdded);
  const grouped = new Map<string, StoredBookmark[]>();
  
  sorted.forEach(bookmark => {
    const date = new Date(bookmark.dateAdded).toISOString().split('T')[0];
    if (!grouped.has(date)) {
      grouped.set(date, []);
    }
    grouped.get(date)!.push(bookmark);
  });
  
  let content = '';
  [...grouped.entries()].forEach(([date, bookmarks]) => {
    content += `## ${date}\n\n`;
    content += generateBookmarkList(bookmarks);
    content += '\n';
  });
  
  return content;
}

function generateByTags(bookmarks: StoredBookmark[]): string {
  const tagged = new Map<string, StoredBookmark[]>();
  const untagged: StoredBookmark[] = [];
  
  bookmarks.forEach(bookmark => {
    if (bookmark.tags && bookmark.tags.length > 0) {
      bookmark.tags.forEach(tag => {
        if (!tagged.has(tag)) {
          tagged.set(tag, []);
        }
        tagged.get(tag)!.push(bookmark);
      });
    } else {
      untagged.push(bookmark);
    }
  });
  
  let content = '';
  [...tagged.entries()].sort().forEach(([tag, bookmarks]) => {
    content += `## ${tag}\n\n`;
    content += generateBookmarkList(bookmarks);
    content += '\n';
  });
  
  if (untagged.length > 0) {
    content += `## Untagged\n\n`;
    content += generateBookmarkList(untagged);
    content += '\n';
  }
  
  return content;
}

function generateFlat(bookmarks: StoredBookmark[]): string {
  return generateBookmarkList(bookmarks);
}

function generateBookmarkList(bookmarks: StoredBookmark[]): string {
  return bookmarks
    .map(bookmark => {
      let item = `- [${bookmark.title}](${bookmark.url})`;
      
      const metadata: string[] = [];
      if (bookmark.tags && bookmark.tags.length > 0) {
        metadata.push(`*Tags: ${bookmark.tags.join(', ')}*`);
      }
      if (bookmark.notes) {
        metadata.push(`*Notes: ${bookmark.notes}*`);
      }
      if (bookmark.folder) {
        metadata.push(`*Folder: ${bookmark.folder}*`);
      }
      
      if (metadata.length > 0) {
        item += '\n  ' + metadata.join('\n  ');
      }
      
      return item;
    })
    .join('\n');
}