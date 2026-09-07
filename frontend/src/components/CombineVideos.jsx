import React, { useState, useEffect } from 'react';
import VideoList from './VideoList';
import FolderPicker from './FolderPicker';
import QualitySelector from './QualitySelector';
import ProgressBar from './ProgressBar';
import { listVideos, combineVideos as apiCombineVideos, checkBackendHealth } from '../utils/api';
import './CombineVideos.css';

export default function CombineVideos({ settings, setSettings }) {
  const [folder, setFolder] = useState(settings.defaultFolder);
  const [videos, setVideos] = useState([]);
  const [selectedVideos, setSelectedVideos] = useState([]);
  const [outputName, setOutputName] = useState(settings.lastOutputName || 'combined_video');
  const [quality, setQuality] = useState(settings.outputQuality || 'auto-detect');
  const [loading, setLoading] = useState(false);
  const [combining, setCombining] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [backendAvailable, setBackendAvailable] = useState(true);

  useEffect(() => {
    checkBackendHealth().then(setBackendAvailable);
  }, []);

  const fetchVideos = async (folderPath) => {
    setLoading(true);
    setError('');
    try {
      const data = await listVideos(folderPath);
      const videosData = data.listVideos || [];
      setVideos(videosData);
      setSelectedVideos([]);
    } catch (err) {
      setError(`Error fetching videos: ${err.message}`);
      setVideos([]);
      setBackendAvailable(false);
    } finally {
      setLoading(false);
    }
  };

  const handleFolderChange = (newFolder) => {
    setFolder(newFolder);
    setSettings({ ...settings, defaultFolder: newFolder });
    fetchVideos(newFolder);
  };

  const toggleVideoSelection = (videoId) => {
    setSelectedVideos(prev =>
      prev.includes(videoId) ? prev.filter(id => id !== videoId) : [...prev, videoId]
    );
  };

  const reorderVideos = (draggedId, targetId) => {
    const draggedIndex = selectedVideos.indexOf(draggedId);
    const targetIndex = selectedVideos.indexOf(targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newOrder = [...selectedVideos];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedId);
    setSelectedVideos(newOrder);
  };

  const handleCombineVideos = async () => {
    if (selectedVideos.length < 2) {
      setError('Please select at least 2 videos to combine');
      return;
    }

    if (!outputName.trim()) {
      setError('Please enter an output filename');
      return;
    }

    setCombining(true);
    setProgress(0);
    setProgressMessage('Initializing...');
    setError('');
    setSuccess('');

    try {
      const selectedPaths = selectedVideos
        .map(id => videos.find(v => v.id === id)?.path)
        .filter(Boolean);

      setProgressMessage('Preparing files...');
      setProgress(25);

      const result = await apiCombineVideos(folder, selectedPaths, outputName, quality);
      const combineResult = result.combineVideos;

      setProgress(100);
      setProgressMessage('Combining complete!');
      setSuccess(`Videos combined successfully! Output: ${combineResult.outputPath}`);
      setSettings({
        ...settings,
        lastOutputName: outputName,
        outputQuality: quality,
      });

      // Reset selection
      setTimeout(() => {
        setSelectedVideos([]);
        setOutputName('combined_video');
        setCombining(false);
      }, 2000);
    } catch (err) {
      setError(`Error combining videos: ${err.message}`);
      setCombining(false);
    }
  };

  return (
    <div className="combine-videos">
      {!backendAvailable && (
        <div className="alert alert-danger">
          ⚠️ Backend server is not available. Make sure the backend is running on port 4000:
          <code>cd backend && npm run dev</code>
        </div>
      )}

      <div className="section">
        <h2>Step 1: Select Folder</h2>
        <div className="folder-actions">
          <FolderPicker folder={folder} onFolderChange={handleFolderChange} />
          <button
            className="btn-list-videos"
            onClick={() => fetchVideos(folder)}
            disabled={loading || combining}
          >
            {loading ? '⏳ Loading...' : '📁 List Videos'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {loading ? (
        <div className="loading">Loading videos...</div>
      ) : videos.length > 0 ? (
        <>
          <div className="section">
            <h2>Step 2: Select Videos to Combine</h2>
            <p className="section-hint">
              {selectedVideos.length} video(s) selected
            </p>
            <VideoList
              videos={videos}
              selectedVideos={selectedVideos}
              onToggleSelection={toggleVideoSelection}
              onReorder={reorderVideos}
            />
          </div>

          <div className="section">
            <h2>Step 3: Configure Output</h2>
            <div className="form-group">
              <label>Output Filename (without extension):</label>
              <input
                type="text"
                value={outputName}
                onChange={e => setOutputName(e.target.value)}
                placeholder="combined_video"
                disabled={combining}
              />
            </div>

            <div className="form-group">
              <label>Video Quality:</label>
              <QualitySelector
                quality={quality}
                onQualityChange={setQuality}
                disabled={combining}
              />
            </div>
          </div>

          {combining && (
            <div className="section">
              <ProgressBar progress={progress} message={progressMessage} />
            </div>
          )}

          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              onClick={handleCombineVideos}
              disabled={
                combining ||
                selectedVideos.length < 2 ||
                !outputName.trim()
              }
            >
              {combining ? 'Combining...' : '▶ Combine Videos'}
            </button>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <p>No videos found in this folder</p>
          <p className="hint">Supported formats: MP4, MOV, AVI, MKV, WebM</p>
        </div>
      )}
    </div>
  );
}
