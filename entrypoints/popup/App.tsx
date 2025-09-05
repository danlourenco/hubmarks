import React from 'react';
import { SyncStatus } from '~/components/SyncStatus';
import { BookmarkList } from '~/components/BookmarkList';
import { SyncControls } from '~/components/SyncControls';
import './App.css';

function App() {
  const openOptions = () => {
    browser.runtime.openOptionsPage();
  };

  return (
    <div className="hubmark-popup">
      <header className="popup-header">
        <h1>HubMark</h1>
        <button onClick={openOptions} className="settings-btn">
          Settings
        </button>
      </header>
      
      <main className="popup-main">
        <SyncStatus />
        <SyncControls />
        <BookmarkList />
      </main>
    </div>
  );
}

export default App;