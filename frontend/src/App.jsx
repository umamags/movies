import React, { useState, useEffect } from 'react';
import CombineVideos from './components/CombineVideos';
import CombineMedia from './components/CombineMedia';
import SplitVideo from './components/SplitVideo';
import EditVideo from './components/EditVideo';
import ExtractAudio from './components/ExtractAudio';
import DeleteAudio from './components/DeleteAudio';
import YoutubeDownloader from './components/YoutubeDownloader';
import YoutubePlaylistDownloader from './components/YoutubePlaylistDownloader';
import Timestamps from './components/Timestamps';
import PhotoLabeller from './components/PhotoLabeller';
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
            className={`tab ${activeTab === 'timestamps' ? 'active' : ''}`}
            onClick={() => setActiveTab('timestamps')}
          >
            Timestamps
          </button>
          <button
            className={`tab ${activeTab === 'photoLabeller' ? 'active' : ''}`}
            onClick={() => setActiveTab('photoLabeller')}
          >
            Photo Labeller
          </button>
          <button
            className={`tab ${activeTab === 'combine' ? 'active' : ''}`}
            onClick={() => setActiveTab('combine')}
          >
            Combine Videos
          </button>
          <button
            className={`tab ${activeTab === 'combineMedia' ? 'active' : ''}`}
            onClick={() => setActiveTab('combineMedia')}
          >
            Combine Pictures & Videos
          </button>
          <button
            className={`tab ${activeTab === 'split' ? 'active' : ''}`}
            onClick={() => setActiveTab('split')}
          >
            Split Videos
          </button>
          <button
            className={`tab ${activeTab === 'edit' ? 'active' : ''}`}
            onClick={() => setActiveTab('edit')}
          >
            Edit Video
          </button>
          <button
            className={`tab ${activeTab === 'extractAudio' ? 'active' : ''}`}
            onClick={() => setActiveTab('extractAudio')}
          >
            Extract Audio
          </button>
          <button
            className={`tab ${activeTab === 'deleteAudio' ? 'active' : ''}`}
            onClick={() => setActiveTab('deleteAudio')}
          >
            Delete Audio
          </button>
          <button
            className={`tab ${activeTab === 'youtube' ? 'active' : ''}`}
            onClick={() => setActiveTab('youtube')}
          >
            Youtube Downloader
          </button>
          <button
            className={`tab ${activeTab === 'youtubePlaylist' ? 'active' : ''}`}
            onClick={() => setActiveTab('youtubePlaylist')}
          >
            Youtube Playlist Downloader
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
          {activeTab === 'timestamps' && <Timestamps />}
          {activeTab === 'photoLabeller' && <PhotoLabeller />}
          {activeTab === 'combine' && (
            <CombineVideos settings={settings} setSettings={setSettings} />
          )}
          {activeTab === 'combineMedia' && (
            <CombineMedia settings={settings} setSettings={setSettings} />
          )}
          {activeTab === 'split' && (
            <SplitVideo settings={settings} setSettings={setSettings} />
          )}
          {activeTab === 'edit' && (
            <EditVideo settings={settings} setSettings={setSettings} />
          )}
          {activeTab === 'extractAudio' && (
            <ExtractAudio settings={settings} setSettings={setSettings} />
          )}
          {activeTab === 'deleteAudio' && (
            <DeleteAudio settings={settings} setSettings={setSettings} />
          )}
          {activeTab === 'youtube' && <YoutubeDownloader />}
          {activeTab === 'youtubePlaylist' && <YoutubePlaylistDownloader />}
          {activeTab === 'create' && <div>Create Movie Coming Soon</div>}
        </div>
      </div>
    </div>
  );
}
