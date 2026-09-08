import React, { useState, useEffect } from 'react';
import FolderPicker from './FolderPicker';
import QualitySelector from './QualitySelector';
import ProgressBar from './ProgressBar';
import MediaList from './MediaList';
import './CombineMedia.css';

const BACKEND_URL = 'http://localhost:4000';

export default function CombineMedia({ settings, setSettings }) {
  const [folder, setFolder] = useState(settings.defaultFolder);
  const [media, setMedia] = useState([]);
  const [selectedMedia, setSelectedMedia] = useState([]);
  const [outputName, setOutputName] = useState(settings.lastOutputName || 'media_video');
  const [quality, setQuality] = useState(settings.outputQuality || 'auto-detect');
  const [photoDuration, setPhotoDuration] = useState(1);
  const [loading, setLoading] = useState(false);
  const [combining, setCombining] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchMedia = async (folderPath) => {
    setLoading(true);
    setError('');
    try {
      const query = `
        query ListMedia($folder: String!) {
          listMedia(folder: $folder) {
            id
            filename
            path
            type
            duration
            size
            format
          }
        }
      `;

      const response = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { folder: folderPath }
        }),
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const mediaData = data.data.listMedia || [];
      setMedia(mediaData);
      setSelectedMedia([]);
    } catch (err) {
      setError(`Error fetching media: ${err.message}`);
      setMedia([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFolderChange = (newFolder) => {
    setFolder(newFolder);
    setSettings({ ...settings, defaultFolder: newFolder });
  };

  const toggleMediaSelection = (mediaId) => {
    setSelectedMedia(prev =>
      prev.includes(mediaId) ? prev.filter(id => id !== mediaId) : [...prev, mediaId]
    );
  };

  const reorderMedia = (draggedId, targetId) => {
    const draggedIndex = selectedMedia.indexOf(draggedId);
    const targetIndex = selectedMedia.indexOf(targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newOrder = [...selectedMedia];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedId);
    setSelectedMedia(newOrder);
  };

  const handleCombineMedia = async () => {
    if (selectedMedia.length === 0) {
      setError('Please select at least 1 file to combine');
      return;
    }

    if (!outputName.trim()) {
      setError('Please enter an output filename');
      return;
    }

    setCombining(true);
    setProgress(0);
    setProgressMessage('Processing media...');
    setError('');
    setSuccess('');

    try {
      const selectedPaths = selectedMedia
        .map(id => media.find(m => m.id === id)?.path)
        .filter(Boolean);

      const mutation = `
        mutation CombineMedia($inputFolder: String!, $mediaPaths: [String!]!, $outputName: String!, $quality: String!, $photoDuration: Float!) {
          combineMedia(input: {
            inputFolder: $inputFolder
            mediaPaths: $mediaPaths
            outputName: $outputName
            quality: $quality
            photoDuration: $photoDuration
          }) {
            id
            outputPath
            duration
            status
          }
        }
      `;

      const response = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: mutation,
          variables: {
            inputFolder: folder,
            mediaPaths: selectedPaths,
            outputName,
            quality,
            photoDuration: parseFloat(photoDuration)
          }
        }),
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const result = data.data.combineMedia;
      setProgress(100);
      setProgressMessage('Complete!');
      setSuccess(`Media combined successfully! Output: ${result.outputPath}`);
      setSettings({
        ...settings,
        lastOutputName: outputName,
        outputQuality: quality,
      });

      setTimeout(() => {
        setSelectedMedia([]);
        setOutputName('media_video');
        setCombining(false);
      }, 2000);
    } catch (err) {
      setError(`Error combining media: ${err.message}`);
      setCombining(false);
    }
  };

  return (
    <div className="combine-media">
      <div className="section">
        <h2>Step 1: Select Folder</h2>
        <div className="folder-actions">
          <FolderPicker folder={folder} onFolderChange={handleFolderChange} />
          <button
            className="btn-list-videos"
            onClick={() => fetchMedia(folder)}
            disabled={loading || combining}
          >
            {loading ? '⏳ Loading...' : '📁 List Media'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {loading ? (
        <div className="loading">Loading media...</div>
      ) : media.length > 0 ? (
        <>
          <div className="section">
            <h2>Step 2: Select Media Files</h2>
            <p className="section-hint">
              {media.length} file(s) available, {selectedMedia.length} file(s) selected
            </p>
            <MediaList
              media={media}
              selectedMedia={selectedMedia}
              onToggleSelection={toggleMediaSelection}
              onReorder={reorderMedia}
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
                placeholder="media_video"
                disabled={combining}
              />
            </div>

            <div className="form-group">
              <label>Photo Display Duration: {photoDuration}s</label>
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={photoDuration}
                onChange={e => setPhotoDuration(e.target.value)}
                disabled={combining}
                className="slider"
              />
              <small>How long each photo displays (0.1s - 10s)</small>
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
              onClick={handleCombineMedia}
              disabled={
                combining ||
                selectedMedia.length === 0 ||
                !outputName.trim()
              }
            >
              {combining ? 'Processing...' : '▶ Create Video'}
            </button>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <p>No media files found in this folder</p>
          <p className="hint">Supported: MP4, MOV, AVI, MKV, WebM, JPG, PNG, GIF, WebP, HEIC</p>
        </div>
      )}
    </div>
  );
}
