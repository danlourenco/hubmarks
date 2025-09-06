export interface GitHubConfig {
  token: string;
  repoOwner: string;
  repoName: string;
}

export interface AppSettings {
  github?: GitHubConfig;
  syncInterval?: number;
  autoSync?: boolean;
}

export interface ExtensionSettings extends AppSettings {
  markdownFormat?: 'folder' | 'date' | 'title';
  conflictResolution?: 'latest-wins' | 'browser-wins' | 'github-wins' | 'manual';
  notificationLevel?: 'all' | 'errors' | 'none';
  theme?: 'light' | 'dark' | 'auto';
}

export interface StoredBookmark {
  id: string;
  title: string;
  url: string;
  folder: string;
  tags: string[];
  notes: string;
  dateAdded: number;
  dateModified: number;
  archived: boolean;
  favorite: boolean;
}

class StorageManager {
  async getSettings(): Promise<ExtensionSettings> {
    const result = await browser.storage.sync.get('settings');
    return result.settings || {};
  }

  async saveSettings(settings: ExtensionSettings): Promise<void> {
    await browser.storage.sync.set({ settings });
  }

  async getGitHubConfig(): Promise<GitHubConfig | null> {
    console.log('🗄️ [Storage] Getting GitHub config...');
    const settings = await this.getSettings();
    console.log('🗄️ [Storage] Retrieved settings:', settings);
    const config = settings.github || null;
    console.log('🗄️ [Storage] GitHub config:', config);
    return config;
  }

  async saveGitHubConfig(config: GitHubConfig): Promise<void> {
    const settings = await this.getSettings();
    settings.github = config;
    await this.saveSettings(settings);
  }

  async clearGitHubConfig(): Promise<void> {
    const settings = await this.getSettings();
    delete settings.github;
    await this.saveSettings(settings);
  }

  async getBookmarks(): Promise<StoredBookmark[]> {
    const result = await browser.storage.local.get('bookmarks');
    return result.bookmarks || [];
  }

  async saveBookmarks(bookmarks: StoredBookmark[]): Promise<void> {
    await browser.storage.local.set({ bookmarks });
  }

  async addBookmark(bookmark: StoredBookmark): Promise<void> {
    const bookmarks = await this.getBookmarks();
    bookmarks.push(bookmark);
    await this.saveBookmarks(bookmarks);
  }

  async updateBookmark(id: string, updates: Partial<StoredBookmark>): Promise<void> {
    const bookmarks = await this.getBookmarks();
    const index = bookmarks.findIndex(b => b.id === id);
    if (index !== -1) {
      bookmarks[index] = { ...bookmarks[index], ...updates, dateModified: Date.now() };
      await this.saveBookmarks(bookmarks);
    }
  }

  async deleteBookmark(id: string): Promise<void> {
    const bookmarks = await this.getBookmarks();
    const filtered = bookmarks.filter(b => b.id !== id);
    await this.saveBookmarks(filtered);
  }

  async getLastSyncTime(): Promise<number> {
    const result = await browser.storage.local.get('lastSyncTime');
    return result.lastSyncTime || 0;
  }

  async setLastSyncTime(timestamp: number): Promise<void> {
    await browser.storage.local.set({ lastSyncTime: timestamp });
  }

  async clearAll(): Promise<void> {
    await browser.storage.local.clear();
    await browser.storage.sync.clear();
  }
}

export const storageManager = new StorageManager();