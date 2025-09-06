import React from 'react';
import { SyncStatus } from '~/components/SyncStatus';
import { BookmarkList } from '~/components/BookmarkList';
import { SyncControls } from '~/components/SyncControls';

function App() {
  const openOptions = () => {
    browser.runtime.openOptionsPage();
  };

  return (
    <div className="w-80 min-h-96 bg-base-100">
      <header className="flex items-center justify-between p-4 border-b border-base-200 bg-base-200">
        <h1 className="text-xl font-bold text-primary">HubMark</h1>
        <button 
          onClick={openOptions} 
          className="btn btn-primary btn-sm"
        >
          Settings
        </button>
      </header>
      
      <main className="p-4 space-y-4">
        <SyncStatus />
        <SyncControls />
        <BookmarkList />
      </main>
    </div>
  );
}

export default App;