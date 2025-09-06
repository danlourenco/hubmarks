import React, { useState, useEffect, useRef } from 'react';
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
  const saveMessageTimeoutRef = useRef<number | null>(null);

  // Update form data when settings load
  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveMessageTimeoutRef.current) {
        clearTimeout(saveMessageTimeoutRef.current);
      }
    };
  }, []);

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

    // Clear any existing timeout
    if (saveMessageTimeoutRef.current) {
      clearTimeout(saveMessageTimeoutRef.current);
    }

    const success = await saveSettings(formData);
    
    if (success) {
      setSaveMessage('Settings saved successfully');
      // Use ref to store timeout ID for proper cleanup
      saveMessageTimeoutRef.current = window.setTimeout(() => {
        setSaveMessage(null);
        saveMessageTimeoutRef.current = null;
      }, 3000);
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
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <span className="ml-3 text-base-content">Loading settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`settings-form ${className}`}>
      <div className="space-y-8">
        {/* Auto Sync */}
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <label className="text-sm font-normal text-base-content">Automatic Sync</label>
              {formData.autoSync && (
                <p className="text-xs text-base-content/60 mt-1">{formatSyncInterval(formData.syncInterval)}</p>
              )}
            </div>
            <input
              type="checkbox"
              checked={formData.autoSync}
              onChange={(e) => handleChange('autoSync', e.target.checked)}
              className="toggle toggle-sm"
            />
          </div>
          
          {formData.autoSync && (
            <select
              value={formData.syncInterval}
              onChange={(e) => handleChange('syncInterval', parseInt(e.target.value))}
              className="select select-sm select-bordered w-full"
            >
              <option value={60000}>Every minute</option>
              <option value={300000}>Every 5 minutes</option>
              <option value={600000}>Every 10 minutes</option>
              <option value={1800000}>Every 30 minutes</option>
              <option value={3600000}>Every hour</option>
              <option value={7200000}>Every 2 hours</option>
              <option value={21600000}>Every 6 hours</option>
              <option value={86400000}>Once a day</option>
            </select>
          )}
        </div>

        {/* Data Organization */}
        <div className="space-y-3">
          <label className="text-sm font-normal text-base-content">Data Organization</label>
          <select
            value={formData.markdownFormat}
            onChange={(e) => handleChange('markdownFormat', e.target.value)}
            className="select select-sm select-bordered w-full"
          >
            <option value="folder">By Folder</option>
            <option value="date">By Date Added</option>
            <option value="tags">By Tags</option>
            <option value="flat">Flat List</option>
          </select>
        </div>

        {/* Conflict Resolution */}
        <div className="space-y-3">
          <label className="text-sm font-normal text-base-content">Conflict Resolution</label>
          <select
            value={formData.conflictResolution}
            onChange={(e) => handleChange('conflictResolution', e.target.value)}
            className="select select-sm select-bordered w-full"
          >
            <option value="latest-wins">Latest Wins</option>
            <option value="browser-wins">Browser Wins</option>
            <option value="github-wins">GitHub Wins</option>
            <option value="manual">Ask Me</option>
          </select>
        </div>

        {/* Notifications */}
        <div className="space-y-3">
          <label className="text-sm font-normal text-base-content">Notifications</label>
          <select
            value={formData.notificationLevel}
            onChange={(e) => handleChange('notificationLevel', e.target.value)}
            className="select select-sm select-bordered w-full"
          >
            <option value="all">All Events</option>
            <option value="errors">Errors Only</option>
            <option value="none">Silent</option>
          </select>
        </div>


        {/* Error Display */}
        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}

        {/* Save Message */}
        {saveMessage && (
          <div className="alert alert-success">
            <span>{saveMessage}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn btn-sm btn-neutral"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          
          <button
            onClick={resetToDefaults}
            disabled={isSaving}
            className="btn btn-sm btn-ghost"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}