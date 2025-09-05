import React, { useState, useEffect } from 'react';
import { useSettings } from '~/hooks/useSettings';
import type { ExtensionSettings } from '~/utils/storage';

interface SettingsFormProps {
  onSave?: () => void;
  className?: string;
}

/**
 * Component for managing extension settings
 * 
 * Handles auto-sync, sync interval, markdown format, and other preferences
 */
export function SettingsForm({ onSave, className = '' }: SettingsFormProps) {
  const { 
    settings, 
    saveSettings, 
    isLoading, 
    error, 
    autoSyncEnabled, 
    syncInterval, 
    markdownFormat 
  } = useSettings();

  const [formData, setFormData] = useState<ExtensionSettings>({
    autoSync: true,
    syncInterval: 300000, // 5 minutes
    markdownFormat: 'folder',
    conflictResolution: 'latest-wins',
    notificationLevel: 'errors',
    theme: 'auto'
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Update form data when settings load
  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  /**
   * Handle form field changes
   */
  const handleChange = (field: keyof ExtensionSettings, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  /**
   * Save settings
   */
  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    const success = await saveSettings(formData);
    
    if (success) {
      setSaveMessage('Settings saved successfully');
      setTimeout(() => setSaveMessage(null), 3000);
      onSave?.();
    }
    
    setIsSaving(false);
  };

  /**
   * Reset to defaults
   */
  const resetToDefaults = () => {
    const defaults: ExtensionSettings = {
      autoSync: true,
      syncInterval: 300000,
      markdownFormat: 'folder',
      conflictResolution: 'latest-wins',
      notificationLevel: 'errors',
      theme: 'auto'
    };
    setFormData(defaults);
  };

  const formatSyncInterval = (ms: number) => {
    const minutes = ms / 60000;
    const hours = minutes / 60;
    
    if (hours >= 1 && hours % 1 === 0) {
      return hours === 1 ? '1 hour' : `${hours} hours`;
    }
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  };

  if (isLoading) {
    return (
      <div className={`settings-form ${className}`}>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin text-2xl mr-2">⟳</div>
          <span className="text-gray-600">Loading settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`settings-form ${className}`}>
      <div className="space-y-6">
        {/* Auto Sync Settings */}
        <div className="setting-group">
          <h3 className="text-lg font-semibold mb-4">Sync Settings</h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="font-medium text-gray-700">Auto Sync</label>
                <div className="text-sm text-gray-500">
                  Automatically sync bookmarks in the background
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.autoSync}
                onChange={(e) => handleChange('autoSync', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
            </div>

            {formData.autoSync && (
              <div>
                <label className="block font-medium text-gray-700 mb-2">
                  Sync Interval
                </label>
                <select
                  value={formData.syncInterval}
                  onChange={(e) => handleChange('syncInterval', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={60000}>1 minute</option>
                  <option value={300000}>5 minutes</option>
                  <option value={600000}>10 minutes</option>
                  <option value={1800000}>30 minutes</option>
                  <option value={3600000}>1 hour</option>
                  <option value={7200000}>2 hours</option>
                  <option value={21600000}>6 hours</option>
                  <option value={86400000}>24 hours</option>
                </select>
                <div className="text-sm text-gray-500 mt-1">
                  Currently: {formatSyncInterval(formData.syncInterval)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Markdown Format */}
        <div className="setting-group">
          <h3 className="text-lg font-semibold mb-4">Export Format</h3>
          
          <div>
            <label className="block font-medium text-gray-700 mb-2">
              Markdown Organization
            </label>
            <select
              value={formData.markdownFormat}
              onChange={(e) => handleChange('markdownFormat', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="folder">Group by Folder</option>
              <option value="date">Group by Date Added</option>
              <option value="tags">Group by Tags</option>
              <option value="flat">Flat List</option>
            </select>
            <div className="text-sm text-gray-500 mt-1 space-y-1">
              <div><strong>Folder:</strong> Organize by browser folder structure</div>
              <div><strong>Date:</strong> Group by date bookmarks were added</div>
              <div><strong>Tags:</strong> Group by bookmark tags</div>
              <div><strong>Flat:</strong> Simple list without grouping</div>
            </div>
          </div>
        </div>

        {/* Conflict Resolution */}
        <div className="setting-group">
          <h3 className="text-lg font-semibold mb-4">Conflict Resolution</h3>
          
          <div>
            <label className="block font-medium text-gray-700 mb-2">
              Default Strategy
            </label>
            <select
              value={formData.conflictResolution}
              onChange={(e) => handleChange('conflictResolution', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="latest-wins">Keep Latest Changes</option>
              <option value="browser-wins">Prefer Browser Version</option>
              <option value="github-wins">Prefer GitHub Version</option>
              <option value="manual">Always Ask</option>
            </select>
            <div className="text-sm text-gray-500 mt-1 space-y-1">
              <div><strong>Latest:</strong> Choose the most recently modified version</div>
              <div><strong>Browser:</strong> Always prefer the browser's version</div>
              <div><strong>GitHub:</strong> Always prefer the repository version</div>
              <div><strong>Manual:</strong> Always prompt for user decision</div>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="setting-group">
          <h3 className="text-lg font-semibold mb-4">Notifications</h3>
          
          <div>
            <label className="block font-medium text-gray-700 mb-2">
              Notification Level
            </label>
            <select
              value={formData.notificationLevel}
              onChange={(e) => handleChange('notificationLevel', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Events</option>
              <option value="errors">Errors Only</option>
              <option value="none">None</option>
            </select>
            <div className="text-sm text-gray-500 mt-1">
              Controls when the extension shows notifications
            </div>
          </div>
        </div>

        {/* Theme */}
        <div className="setting-group">
          <h3 className="text-lg font-semibold mb-4">Appearance</h3>
          
          <div>
            <label className="block font-medium text-gray-700 mb-2">
              Theme
            </label>
            <select
              value={formData.theme}
              onChange={(e) => handleChange('theme', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="auto">Auto (System)</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
            {error}
          </div>
        )}

        {/* Save Message */}
        {saveMessage && (
          <div className="text-green-600 text-sm bg-green-50 p-3 rounded">
            {saveMessage}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
          
          <button
            onClick={resetToDefaults}
            disabled={isSaving}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}