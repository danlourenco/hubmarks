import React from 'react';
import { GitHubSetup } from '~/components/GitHubSetup';
import { SettingsForm } from '~/components/SettingsForm';
import { SyncStatus } from '~/components/SyncStatus';

export default function App() {
  return (
    <div className="min-h-screen bg-base-200">
      <div className="max-w-4xl mx-auto">
        {/* macOS-style Header */}
        <div className="border-b border-base-300 bg-base-100 px-8 py-4">
          <h1 className="text-2xl font-light text-base-content">HubMark Settings</h1>
        </div>
        
        {/* Settings Content */}
        <div className="bg-base-100">
          {/* Sync Status Section */}
          <div className="border-b border-base-300 px-8 py-6">
            <div className="flex items-start">
              <div className="flex-1">
                <h2 className="text-sm font-medium text-base-content/80 mb-4">SYNC STATUS</h2>
                <SyncStatus />
              </div>
            </div>
          </div>
          
          {/* GitHub Integration Section */}
          <div className="border-b border-base-300 px-8 py-6">
            <div className="flex items-start">
              <div className="flex-1">
                <h2 className="text-sm font-medium text-base-content/80 mb-4">GITHUB INTEGRATION</h2>
                <GitHubSetup onComplete={() => window.close()} />
              </div>
            </div>
          </div>
          
          {/* Preferences Section */}
          <div className="px-8 py-6">
            <div className="flex items-start">
              <div className="flex-1">
                <h2 className="text-sm font-medium text-base-content/80 mb-4">PREFERENCES</h2>
                <SettingsForm />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}