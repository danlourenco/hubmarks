import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SyncStatus } from './SyncStatus';

// Mock the hooks
vi.mock('~/hooks/useSync', () => ({
  useSync: vi.fn()
}));

vi.mock('~/hooks/useGitHubConfig', () => ({
  useGitHubConfig: vi.fn()
}));

import { useSync } from '~/hooks/useSync';
import { useGitHubConfig } from '~/hooks/useGitHubConfig';

describe('SyncStatus', () => {
  const mockUseSync = vi.mocked(useSync);
  const mockUseGitHubConfig = vi.mocked(useGitHubConfig);

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock for useGitHubConfig
    mockUseGitHubConfig.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      error: null,
      config: null,
      updateConfig: vi.fn(),
      clearConfig: vi.fn()
    });
  });

  describe('status display', () => {
    it('should show synced status', () => {
      mockUseSync.mockReturnValue({
        status: { status: 'idle' },
        isLoading: false,
        error: null,
        isConfigured: true,
        hasConflicts: false,
        isSyncing: false,
        totalBookmarks: 5,
        lastSync: Date.now() - 60000, // 1 minute ago
        refreshStatus: vi.fn(),
        triggerSync: vi.fn(),
        resolveConflicts: vi.fn()
      });

      render(<SyncStatus />);

      expect(screen.getByText('•')).toBeInTheDocument();
      expect(screen.getByText('Synced')).toBeInTheDocument();
      expect(screen.getByText('• Last sync: 1m ago')).toBeInTheDocument();
    });

    it('should show syncing status with spinner', () => {
      mockUseSync.mockReturnValue({
        status: { status: 'syncing' },
        isLoading: false,
        error: null,
        isConfigured: true,
        hasConflicts: false,
        isSyncing: true,
        totalBookmarks: 5,
        lastSync: Date.now(),
        refreshStatus: vi.fn(),
        triggerSync: vi.fn(),
        resolveConflicts: vi.fn()
      });

      render(<SyncStatus />);

      expect(screen.getByText('•')).toBeInTheDocument();
      expect(screen.getByText('Syncing...')).toBeInTheDocument();
    });

    it('should show conflict status', () => {
      mockUseSync.mockReturnValue({
        status: { status: 'conflicts' },
        isLoading: false,
        error: null,
        isConfigured: true,
        hasConflicts: true,
        isSyncing: false,
        totalBookmarks: 5,
        lastSync: Date.now(),
        refreshStatus: vi.fn(),
        triggerSync: vi.fn(),
        resolveConflicts: vi.fn()
      });

      render(<SyncStatus />);

      expect(screen.getByText('•')).toBeInTheDocument();
      expect(screen.getByText('Conflicts')).toBeInTheDocument();
      expect(screen.getByText('Conflicts detected. Manual resolution required.')).toBeInTheDocument();
    });

    it('should show error status', () => {
      mockUseSync.mockReturnValue({
        status: null,
        isLoading: false,
        error: 'Connection failed',
        isConfigured: true,
        hasConflicts: false,
        isSyncing: false,
        totalBookmarks: 0,
        lastSync: 0,
        refreshStatus: vi.fn(),
        triggerSync: vi.fn(),
        resolveConflicts: vi.fn()
      });

      render(<SyncStatus />);

      expect(screen.getByText('•')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });

    it('should show not configured status', () => {
      mockUseSync.mockReturnValue({
        status: null,
        isLoading: false,
        error: null,
        hasConflicts: false,
        isSyncing: false,
        totalBookmarks: 0,
        lastSync: 0,
        refreshStatus: vi.fn(),
        triggerSync: vi.fn(),
        resolveConflicts: vi.fn()
      });

      mockUseGitHubConfig.mockReturnValue({
        isConfigured: false,
        isLoading: false,
        error: null,
        config: null,
        updateConfig: vi.fn(),
        clearConfig: vi.fn()
      });

      render(<SyncStatus />);

      expect(screen.getByText('•')).toBeInTheDocument();
      expect(screen.getByText('Not configured')).toBeInTheDocument();
    });
  });

  describe('details display', () => {
    it('should show details by default', () => {
      mockUseSync.mockReturnValue({
        status: { status: 'idle' },
        isLoading: false,
        error: null,
        hasConflicts: false,
        isSyncing: false,
        totalBookmarks: 10,
        lastSync: Date.now() - 3600000, // 1 hour ago
        refreshStatus: vi.fn(),
        triggerSync: vi.fn(),
        resolveConflicts: vi.fn()
      });

      render(<SyncStatus />);

      expect(screen.getByText('Synced')).toBeInTheDocument();
      expect(screen.getByText('• Last sync: 1h ago')).toBeInTheDocument();
    });

    it('should hide details when showDetails is false', () => {
      mockUseSync.mockReturnValue({
        status: { status: 'idle' },
        isLoading: false,
        error: null,
        isConfigured: true,
        hasConflicts: false,
        isSyncing: false,
        totalBookmarks: 10,
        lastSync: Date.now(),
        refreshStatus: vi.fn(),
        triggerSync: vi.fn(),
        resolveConflicts: vi.fn()
      });

      render(<SyncStatus showDetails={false} />);

      expect(screen.queryByText('Bookmarks:')).not.toBeInTheDocument();
      expect(screen.queryByText('Last sync:')).not.toBeInTheDocument();
    });
  });

  describe('time formatting', () => {
    const now = Date.now();

    it('should format recent times correctly', () => {
      mockUseSync.mockReturnValue({
        status: { status: 'idle' },
        isLoading: false,
        error: null,
        isConfigured: true,
        hasConflicts: false,
        isSyncing: false,
        totalBookmarks: 5,
        lastSync: now - 30000, // 30 seconds ago
        refreshStatus: vi.fn(),
        triggerSync: vi.fn(),
        resolveConflicts: vi.fn()
      });

      render(<SyncStatus />);
      expect(screen.getByText('• Last sync: Just now')).toBeInTheDocument();
    });

    it('should show "Never" for zero timestamp', () => {
      mockUseSync.mockReturnValue({
        status: { status: 'idle' },
        isLoading: false,
        error: null,
        isConfigured: true,
        hasConflicts: false,
        isSyncing: false,
        totalBookmarks: 0,
        lastSync: 0,
        refreshStatus: vi.fn(),
        triggerSync: vi.fn(),
        resolveConflicts: vi.fn()
      });

      render(<SyncStatus />);
      expect(screen.getByText('• Last sync: Never')).toBeInTheDocument();
    });

  });

  describe('styling', () => {
    it('should apply custom className', () => {
      mockUseSync.mockReturnValue({
        status: { status: 'idle' },
        isLoading: false,
        error: null,
        isConfigured: true,
        hasConflicts: false,
        isSyncing: false,
        totalBookmarks: 0,
        lastSync: 0,
        refreshStatus: vi.fn(),
        triggerSync: vi.fn(),
        resolveConflicts: vi.fn()
      });

      const { container } = render(<SyncStatus className="custom-class" />);
      expect(container.firstChild).toHaveClass('sync-status', 'custom-class');
    });

    it('should apply correct color classes for different states', () => {
      const states = [
        { status: 'idle', expectedColor: 'text-success' },
        { status: 'syncing', expectedColor: 'text-info' },
        { status: 'conflicts', expectedColor: 'text-warning' },
        { error: 'Error', expectedColor: 'text-error' },
      ];

      states.forEach(({ status, error, expectedColor }) => {
        const mockReturn = {
          status: status ? { status } : null,
          isLoading: false,
          error: error || null,
          isConfigured: !error,
          hasConflicts: status === 'conflicts',
          isSyncing: status === 'syncing',
          totalBookmarks: 0,
          lastSync: 0,
          refreshStatus: vi.fn(),
          triggerSync: vi.fn(),
          resolveConflicts: vi.fn()
        };

        mockUseSync.mockReturnValue(mockReturn);

        const { container, unmount } = render(<SyncStatus />);
        const statusElement = container.querySelector('.text-sm');
        expect(statusElement).toHaveClass(expectedColor);
        
        unmount();
      });
    });
  });
});