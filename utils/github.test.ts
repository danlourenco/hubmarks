import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  GitHubClient, 
  validateGitHubToken,
  generateMarkdownContent,
  parseMarkdownContent,
  sanitizeFilename,
  formatCommitMessage,
  type RepositoryInfo,
  type GitHubFile,
  type CreateRepositoryOptions
} from './github';
import type { GitHubConfig, StoredBookmark } from './storage';

// Mock Octokit
const mockOctokit = {
  rest: {
    users: {
      getAuthenticated: vi.fn(),
    },
    repos: {
      listForAuthenticatedUser: vi.fn(),
      createForAuthenticatedUser: vi.fn(),
      get: vi.fn(),
      getBranch: vi.fn(),
      createOrUpdateFileContents: vi.fn(),
      deleteFile: vi.fn(),
      getContent: vi.fn(),
    },
    git: {
      createRef: vi.fn(),
    },
  },
};

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => mockOctokit),
}));

describe('GitHubClient', () => {
  let client: GitHubClient;
  const mockConfig: GitHubConfig = {
    token: 'test-token',
    repoOwner: 'testuser',
    repoName: 'test-bookmarks',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GitHubClient(mockConfig);
  });

  describe('authenticate', () => {
    it('should authenticate successfully with valid token', async () => {
      const mockUser = {
        login: 'testuser',
        id: 12345,
        name: 'Test User',
      };

      mockOctokit.rest.users.getAuthenticated.mockResolvedValue({ data: mockUser });
      mockOctokit.rest.repos.listForAuthenticatedUser.mockResolvedValue({ data: [] });

      const result = await client.authenticate();

      expect(result).toEqual({
        login: 'testuser',
        id: 12345,
        name: 'Test User',
      });
      expect(mockOctokit.rest.users.getAuthenticated).toHaveBeenCalled();
      expect(mockOctokit.rest.repos.listForAuthenticatedUser).toHaveBeenCalledWith({
        per_page: 1,
        sort: 'updated'
      });
    });

    it('should throw error on authentication failure', async () => {
      mockOctokit.rest.users.getAuthenticated.mockRejectedValue(new Error('Unauthorized'));

      await expect(client.authenticate()).rejects.toThrow('GitHub authentication failed: Unauthorized');
    });
  });

  describe('createRepository', () => {
    it('should create repository with default options', async () => {
      const mockRepo = {
        id: 123,
        name: 'test-bookmarks',
        full_name: 'testuser/test-bookmarks',
        description: 'Test repository',
        private: true,
        default_branch: 'main',
        html_url: 'https://github.com/testuser/test-bookmarks',
        clone_url: 'https://github.com/testuser/test-bookmarks.git',
      };

      mockOctokit.rest.repos.createForAuthenticatedUser.mockResolvedValue({ data: mockRepo });

      const options: CreateRepositoryOptions = {
        name: 'test-bookmarks',
        description: 'Test repository',
      };

      const result = await client.createRepository(options);

      expect(result).toEqual({
        id: 123,
        name: 'test-bookmarks',
        fullName: 'testuser/test-bookmarks',
        description: 'Test repository',
        private: true,
        defaultBranch: 'main',
        htmlUrl: 'https://github.com/testuser/test-bookmarks',
        cloneUrl: 'https://github.com/testuser/test-bookmarks.git',
      });

      expect(mockOctokit.rest.repos.createForAuthenticatedUser).toHaveBeenCalledWith({
        name: 'test-bookmarks',
        description: 'Test repository',
        private: true,
        auto_init: true,
      });
    });

    it('should throw error on repository creation failure', async () => {
      mockOctokit.rest.repos.createForAuthenticatedUser.mockRejectedValue(new Error('Repository already exists'));

      const options: CreateRepositoryOptions = { name: 'test-bookmarks' };

      await expect(client.createRepository(options)).rejects.toThrow('Failed to create repository: Repository already exists');
    });
  });

  describe('listRepositories', () => {
    it('should list user repositories', async () => {
      const mockRepos = [
        {
          id: 123,
          name: 'repo1',
          full_name: 'testuser/repo1',
          description: 'First repo',
          private: false,
          default_branch: 'main',
          html_url: 'https://github.com/testuser/repo1',
          clone_url: 'https://github.com/testuser/repo1.git',
        },
        {
          id: 124,
          name: 'repo2',
          full_name: 'testuser/repo2',
          description: null,
          private: true,
          default_branch: 'master',
          html_url: 'https://github.com/testuser/repo2',
          clone_url: 'https://github.com/testuser/repo2.git',
        },
      ];

      mockOctokit.rest.repos.listForAuthenticatedUser.mockResolvedValue({ data: mockRepos });

      const result = await client.listRepositories();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 123,
        name: 'repo1',
        fullName: 'testuser/repo1',
        description: 'First repo',
        private: false,
        defaultBranch: 'main',
        htmlUrl: 'https://github.com/testuser/repo1',
        cloneUrl: 'https://github.com/testuser/repo1.git',
      });

      expect(mockOctokit.rest.repos.listForAuthenticatedUser).toHaveBeenCalledWith({
        type: 'owner',
        per_page: 30,
        sort: 'updated',
        direction: 'desc'
      });
    });
  });

  describe('getRepositoryInfo', () => {
    it('should get repository information', async () => {
      const mockRepo = {
        id: 123,
        name: 'test-repo',
        full_name: 'testuser/test-repo',
        description: 'Test repository',
        private: false,
        default_branch: 'main',
        html_url: 'https://github.com/testuser/test-repo',
        clone_url: 'https://github.com/testuser/test-repo.git',
      };

      mockOctokit.rest.repos.get.mockResolvedValue({ data: mockRepo });

      const result = await client.getRepositoryInfo('testuser', 'test-repo');

      expect(result).toEqual({
        id: 123,
        name: 'test-repo',
        fullName: 'testuser/test-repo',
        description: 'Test repository',
        private: false,
        defaultBranch: 'main',
        htmlUrl: 'https://github.com/testuser/test-repo',
        cloneUrl: 'https://github.com/testuser/test-repo.git',
      });

      expect(mockOctokit.rest.repos.get).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-repo',
      });
    });
  });

  describe('createFile', () => {
    it('should create new file successfully', async () => {
      const mockResponse = {
        content: {
          sha: 'abc123',
          path: 'bookmarks.md',
        },
      };

      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({ data: mockResponse });

      const result = await client.createFile('bookmarks.md', '# My Bookmarks', 'Add bookmarks file');

      expect(result).toEqual({
        content: '# My Bookmarks',
        sha: 'abc123',
        path: 'bookmarks.md',
        encoding: 'utf8'
      });

      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-bookmarks',
        path: 'bookmarks.md',
        message: 'Add bookmarks file',
        content: Buffer.from('# My Bookmarks', 'utf8').toString('base64'),
        branch: undefined,
      });
    });
  });

  describe('updateFile', () => {
    it('should update existing file successfully', async () => {
      const mockResponse = {
        content: {
          sha: 'def456',
          path: 'bookmarks.md',
        },
      };

      mockOctokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({ data: mockResponse });

      const result = await client.updateFile('bookmarks.md', '# Updated Bookmarks', 'Update bookmarks', 'abc123');

      expect(result).toEqual({
        content: '# Updated Bookmarks',
        sha: 'def456',
        path: 'bookmarks.md',
        encoding: 'utf8'
      });

      expect(mockOctokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-bookmarks',
        path: 'bookmarks.md',
        message: 'Update bookmarks',
        content: Buffer.from('# Updated Bookmarks', 'utf8').toString('base64'),
        sha: 'abc123',
        branch: undefined,
      });
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      mockOctokit.rest.repos.deleteFile.mockResolvedValue({});

      await client.deleteFile('old-bookmarks.md', 'Remove old bookmarks file', 'abc123');

      expect(mockOctokit.rest.repos.deleteFile).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-bookmarks',
        path: 'old-bookmarks.md',
        message: 'Remove old bookmarks file',
        sha: 'abc123',
        branch: undefined,
      });
    });
  });

  describe('getFileContent', () => {
    it('should get file content successfully', async () => {
      const mockContent = Buffer.from('# My Bookmarks\n\n- [Example](https://example.com)', 'utf8').toString('base64');
      const mockResponse = {
        type: 'file',
        content: mockContent,
        encoding: 'base64',
        sha: 'abc123',
        path: 'bookmarks.md',
      };

      mockOctokit.rest.repos.getContent.mockResolvedValue({ data: mockResponse });

      const result = await client.getFileContent('bookmarks.md');

      expect(result).toEqual({
        content: '# My Bookmarks\n\n- [Example](https://example.com)',
        sha: 'abc123',
        path: 'bookmarks.md',
        encoding: 'utf8'
      });

      expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-bookmarks',
        path: 'bookmarks.md',
        ref: undefined,
      });
    });

    it('should throw error for directory path', async () => {
      mockOctokit.rest.repos.getContent.mockResolvedValue({ 
        data: [{ name: 'file1.md' }, { name: 'file2.md' }] 
      });

      await expect(client.getFileContent('folder')).rejects.toThrow('Path folder is not a file');
    });
  });

  describe('listFiles', () => {
    it('should list files in directory', async () => {
      const mockResponse = [
        { name: 'bookmarks.md' },
        { name: 'categories.md' },
        { name: 'README.md' },
      ];

      mockOctokit.rest.repos.getContent.mockResolvedValue({ data: mockResponse });

      const result = await client.listFiles('');

      expect(result).toEqual(['bookmarks.md', 'categories.md', 'README.md']);

      expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-bookmarks',
        path: '',
        ref: undefined,
      });
    });

    it('should throw error for file path', async () => {
      mockOctokit.rest.repos.getContent.mockResolvedValue({ 
        data: { type: 'file', content: 'file content' } 
      });

      await expect(client.listFiles('bookmarks.md')).rejects.toThrow('Path bookmarks.md is not a directory');
    });
  });

  describe('createBranch', () => {
    it('should create branch from default branch', async () => {
      const mockRepo = { default_branch: 'main' };
      const mockBranch = { commit: { sha: 'abc123' } };

      mockOctokit.rest.repos.get.mockResolvedValue({ data: mockRepo });
      mockOctokit.rest.repos.getBranch.mockResolvedValue({ data: mockBranch });
      mockOctokit.rest.git.createRef.mockResolvedValue({});

      await client.createBranch('feature-branch');

      expect(mockOctokit.rest.repos.get).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-bookmarks',
      });
      expect(mockOctokit.rest.repos.getBranch).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-bookmarks',
        branch: 'main',
      });
      expect(mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-bookmarks',
        ref: 'refs/heads/feature-branch',
        sha: 'abc123',
      });
    });

    it('should create branch from specified SHA', async () => {
      mockOctokit.rest.git.createRef.mockResolvedValue({});

      await client.createBranch('feature-branch', 'def456');

      expect(mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-bookmarks',
        ref: 'refs/heads/feature-branch',
        sha: 'def456',
      });
      expect(mockOctokit.rest.repos.get).not.toHaveBeenCalled();
    });
  });

  describe('getBranch', () => {
    it('should get branch information', async () => {
      const mockBranch = {
        name: 'main',
        commit: { sha: 'abc123' },
        protected: false,
      };

      mockOctokit.rest.repos.getBranch.mockResolvedValue({ data: mockBranch });

      const result = await client.getBranch('main');

      expect(result).toEqual({
        name: 'main',
        sha: 'abc123',
        protected: false,
      });

      expect(mockOctokit.rest.repos.getBranch).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-bookmarks',
        branch: 'main',
      });
    });

    it('should get default branch when no branch specified', async () => {
      const mockRepo = { default_branch: 'main' };
      const mockBranch = {
        name: 'main',
        commit: { sha: 'abc123' },
        protected: false,
      };

      mockOctokit.rest.repos.get.mockResolvedValue({ data: mockRepo });
      mockOctokit.rest.repos.getBranch.mockResolvedValue({ data: mockBranch });

      const result = await client.getBranch();

      expect(result).toEqual({
        name: 'main',
        sha: 'abc123',
        protected: false,
      });
    });
  });
});

describe('validateGitHubToken', () => {
  it('should validate token successfully', async () => {
    const mockUser = {
      login: 'testuser',
      name: 'Test User',
    };

    mockOctokit.rest.users.getAuthenticated.mockResolvedValue({ data: mockUser });
    mockOctokit.rest.repos.listForAuthenticatedUser.mockResolvedValue({ data: [] });

    const result = await validateGitHubToken('valid-token');

    expect(result).toEqual({
      login: 'testuser',
      name: 'Test User',
    });
  });

  it('should throw error for invalid token', async () => {
    mockOctokit.rest.users.getAuthenticated.mockRejectedValue(new Error('Bad credentials'));

    await expect(validateGitHubToken('invalid-token')).rejects.toThrow('Invalid GitHub token: Bad credentials');
  });
});

describe('generateMarkdownContent', () => {
  const mockBookmarks: StoredBookmark[] = [
    {
      id: '1',
      title: 'React Documentation',
      url: 'https://reactjs.org',
      tags: ['react', 'javascript'],
      folder: 'Development',
      dateAdded: 1234567890000,
      dateModified: 1234567890000,
    },
    {
      id: '2',
      title: 'TypeScript Handbook',
      url: 'https://typescriptlang.org',
      tags: ['typescript', 'javascript'],
      folder: 'Development',
      notes: 'Great reference for TS',
      dateAdded: 1234567891000,
      dateModified: 1234567891000,
    },
    {
      id: '3',
      title: 'GitHub',
      url: 'https://github.com',
      folder: 'Tools',
      dateAdded: 1234567892000,
      dateModified: 1234567892000,
    },
  ];

  it('should generate markdown grouped by folder', () => {
    const result = generateMarkdownContent(mockBookmarks, 'folder');

    expect(result).toContain('# Bookmarks');
    expect(result).toContain('## Development');
    expect(result).toContain('## Tools');
    expect(result).toContain('- [React Documentation](https://reactjs.org)');
    expect(result).toContain('*Tags: react, javascript*');
    expect(result).toContain('*Notes: Great reference for TS*');
  });

  it('should generate markdown grouped by tags', () => {
    const result = generateMarkdownContent(mockBookmarks, 'tags');

    expect(result).toContain('# Bookmarks');
    expect(result).toContain('## javascript');
    expect(result).toContain('## react');
    expect(result).toContain('## typescript');
    expect(result).toContain('## Untagged');
  });

  it('should generate markdown grouped by date', () => {
    const result = generateMarkdownContent(mockBookmarks, 'date');

    expect(result).toContain('# Bookmarks');
    expect(result).toContain('## 2009-02-13'); // Date from timestamp
  });

  it('should generate flat markdown', () => {
    const result = generateMarkdownContent(mockBookmarks, 'none');

    expect(result).toContain('# Bookmarks');
    expect(result).toContain('- [React Documentation](https://reactjs.org)');
    expect(result).toContain('- [TypeScript Handbook](https://typescriptlang.org)');
    expect(result).toContain('- [GitHub](https://github.com)');
  });

  it('should handle empty bookmarks array', () => {
    const result = generateMarkdownContent([], 'folder');

    expect(result).toBe('# Bookmarks\n\nNo bookmarks yet.\n');
  });
});

describe('parseMarkdownContent', () => {
  it('should parse basic markdown links', () => {
    const markdown = `# Bookmarks

- [React Documentation](https://reactjs.org)
- [GitHub](https://github.com)`;

    const result = parseMarkdownContent(markdown);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(expect.objectContaining({
      title: 'React Documentation',
      url: 'https://reactjs.org',
    }));
    expect(result[1]).toEqual(expect.objectContaining({
      title: 'GitHub',
      url: 'https://github.com',
    }));
  });

  it('should parse markdown with metadata', () => {
    const markdown = `# Bookmarks

- [React Documentation](https://reactjs.org)
  *Tags: react, javascript*
  *Notes: Official React docs*
  *Folder: Development*`;

    const result = parseMarkdownContent(markdown);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      title: 'React Documentation',
      url: 'https://reactjs.org',
      tags: ['react', 'javascript'],
      notes: 'Official React docs',
      folder: 'Development',
    }));
  });

  it('should handle empty content', () => {
    const result = parseMarkdownContent('# Bookmarks\n\nNo bookmarks yet.');

    expect(result).toEqual([]);
  });
});

describe('sanitizeFilename', () => {
  it('should create safe filename from title', () => {
    expect(sanitizeFilename('My Awesome Bookmark!')).toBe('my-awesome-bookmark');
    expect(sanitizeFilename('React & TypeScript Guide')).toBe('react-typescript-guide');
    expect(sanitizeFilename('Test/Path\\Name')).toBe('testpathname');
  });

  it('should limit filename length', () => {
    const longTitle = 'This is a very long bookmark title that exceeds the maximum length';
    const result = sanitizeFilename(longTitle, 20);
    
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result).toBe('this-is-a-very-long');
  });

  it('should handle special characters', () => {
    expect(sanitizeFilename('Title with "quotes" and @symbols')).toBe('title-with-quotes-and-symbols');
    expect(sanitizeFilename('---Multiple---Hyphens---')).toBe('multiple-hyphens');
  });
});

describe('formatCommitMessage', () => {
  it('should format add commit message', () => {
    const result = formatCommitMessage('add', 'My New Bookmark');
    expect(result).toBe('feat: add bookmark "My New Bookmark"');
  });

  it('should format update commit message', () => {
    const result = formatCommitMessage('update', 'Updated Bookmark');
    expect(result).toBe('chore: update bookmark "Updated Bookmark"');
  });

  it('should format delete commit message', () => {
    const result = formatCommitMessage('delete', 'Old Bookmark');
    expect(result).toBe('chore: remove bookmark "Old Bookmark"');
  });

  it('should truncate long titles', () => {
    const longTitle = 'This is a very long bookmark title that exceeds fifty characters';
    const result = formatCommitMessage('add', longTitle);
    
    expect(result).toBe('feat: add bookmark "This is a very long bookmark title that exceeds..."');
    expect(result.length).toBeLessThan(100);
  });
});