import React, { useState, useEffect } from 'react';
import CombineVideos from './components/CombineVideos';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('combine');
  const [settings, setSettings] = useState({
    defaultFolder: localStorage.getItem('defaultFolder') || '~/home_movies',
    outputQuality: localStorage.getItem('outputQuality') || 'auto-detect',
    lastOutputName: localStorage.getItem('lastOutputName') || '',
  });

  useEffect(() => {
    localStorage.setItem('defaultFolder', settings.defaultFolder);
    localStorage.setItem('outputQuality', settings.outputQuality);
    localStorage.setItem('lastOutputName', settings.lastOutputName);
  }, [settings]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎬 Video Editor</h1>
        <p>Combine, split, extract, and manipulate your videos</p>
      </header>

      <div className="container">
        <nav className="tabs">
          <button
            className={`tab ${activeTab === 'combine' ? 'active' : ''}`}
            onClick={() => setActiveTab('combine')}
          >
            Combine Videos
          </button>
          <button
            className={`tab ${activeTab === 'split' ? 'active' : ''}`}
            onClick={() => setActiveTab('split')}
            disabled
          >
            Split Videos
          </button>
          <button
            className={`tab ${activeTab === 'extractAudio' ? 'active' : ''}`}
            onClick={() => setActiveTab('extractAudio')}
            disabled
          >
            Extract Audio
          </button>
          <button
            className={`tab ${activeTab === 'deleteAudio' ? 'active' : ''}`}
            onClick={() => setActiveTab('deleteAudio')}
            disabled
          >
            Delete Audio
          </button>
          <button
            className={`tab ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => setActiveTab('create')}
            disabled
          >
            Create Movie
          </button>
        </nav>

        <div className="tab-content">
          {activeTab === 'combine' && (
            <CombineVideos settings={settings} setSettings={setSettings} />
          )}
          {activeTab === 'split' && <div>Split Videos Coming Soon</div>}
          {activeTab === 'extractAudio' && <div>Extract Audio Coming Soon</div>}
          {activeTab === 'deleteAudio' && <div>Delete Audio Coming Soon</div>}
          {activeTab === 'create' && <div>Create Movie Coming Soon</div>}
        </div>
      </div>
    </div>
  );
}
