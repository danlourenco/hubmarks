import React from 'react';
import { GitHubSetup } from '~/components/GitHubSetup';
import { SettingsForm } from '~/components/SettingsForm';
import { SyncStatus } from '~/components/SyncStatus';

export default function App() {
  return (
    <div className="options-container">
      <header>
        <h1>HubMark Settings</h1>
        <p>Configure your GitHub integration and sync preferences</p>
      </header>
      
      <main>
        <section className="sync-status-section">
          <SyncStatus />
        </section>
        
        <section className="github-setup-section">
          <h2>GitHub Integration</h2>
          <GitHubSetup />
        </section>
        
        <section className="settings-section">
          <h2>Extension Settings</h2>
          <SettingsForm />
        </section>
      </main>
    </div>
  );
}