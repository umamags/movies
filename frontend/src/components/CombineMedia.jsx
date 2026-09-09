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
  const [chunkSize, setChunkSize] = useState(settings.chunkSize || '500MB');
  const [loading, setLoading] = useState(false);
  const [combining, setCombining] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [availableDates, setAvailableDates] = useState([]);
  const [includeLocation, setIncludeLocation] = useState(false);
  const [mediaLocations, setMediaLocations] = useState({});

  const extractDateFromFilename = (filename) => {
    const match = filename.match(/^(\d{8})/);
    return match ? match[1] : null;
  };

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
      setSelectedDate('');

      // Extract unique dates from filenames
      const dates = new Set();
      mediaData.forEach(m => {
        const date = extractDateFromFilename(m.filename);
        if (date) {
          dates.add(date);
        }
      });

      // Only show date filter if all files have dates
      if (dates.size > 0 && dates.size === new Set(mediaData.map(m => extractDateFromFilename(m.filename)).filter(Boolean)).size / mediaData.length * mediaData.length) {
        const sortedDates = Array.from(dates).sort().reverse();
        setAvailableDates(sortedDates);
      } else if (dates.size > 0) {
        const sortedDates = Array.from(dates).sort().reverse();
        setAvailableDates(sortedDates);
      }
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

  const handleSelectAll = () => {
    const filteredMedia = selectedDate
      ? media.filter(m => extractDateFromFilename(m.filename) === selectedDate)
      : media;
    const allIds = filteredMedia.map(m => m.id);
    setSelectedMedia(allIds);
  };

  const handleClearSelection = () => {
    setSelectedMedia([]);
  };

  const getFilteredMedia = () => {
    return selectedDate
      ? media.filter(m => extractDateFromFilename(m.filename) === selectedDate)
      : media;
  };

  const fetchLocationForMedia = async (mediaItem) => {
    if (!includeLocation || !mediaItem.path) return null;

    const cacheKey = mediaItem.id;
    if (mediaLocations[cacheKey]) {
      return mediaLocations[cacheKey];
    }

    try {
      const query = `
        query GetMediaLocation($mediaPath: String!) {
          getMediaLocation(mediaPath: $mediaPath)
        }
      `;

      const response = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { mediaPath: mediaItem.path }
        }),
      });

      const data = await response.json();
      const location = data.data?.getMediaLocation || null;

      if (location) {
        setMediaLocations(prev => ({
          ...prev,
          [cacheKey]: location
        }));
      }

      return location;
    } catch (err) {
      console.error('Failed to fetch location:', err);
      return null;
    }
  };

  const handleIncludeLocationChange = async (checked) => {
    setIncludeLocation(checked);
    if (checked) {
      // Fetch locations for all filtered media
      const filteredMedia = getFilteredMedia();
      for (const item of filteredMedia) {
        await fetchLocationForMedia(item);
      }
    }
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
        mutation CombineMedia($inputFolder: String!, $mediaPaths: [String!]!, $outputName: String!, $quality: String!, $photoDuration: Float!, $chunkSize: String!) {
          combineMedia(input: {
            inputFolder: $inputFolder
            mediaPaths: $mediaPaths
            outputName: $outputName
            quality: $quality
            photoDuration: $photoDuration
            chunkSize: $chunkSize
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
            photoDuration: parseFloat(photoDuration),
            chunkSize
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

            {availableDates.length > 0 && (
              <div className="filter-section">
                <div className="filter-row">
                  <div className="filter-group">
                    <label>Filter by Date:</label>
                    <select
                      value={selectedDate}
                      onChange={e => setSelectedDate(e.target.value)}
                      disabled={combining}
                      className="date-filter"
                    >
                      <option value="">All Dates</option>
                      {availableDates.map(date => (
                        <option key={date} value={date}>
                          {date.substring(0, 4)}-{date.substring(4, 6)}-{date.substring(6, 8)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={includeLocation}
                        onChange={e => handleIncludeLocationChange(e.target.checked)}
                        disabled={combining}
                      />
                      <span>📍 Include Location</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="section-controls">
              <button
                className="btn btn-secondary"
                onClick={handleSelectAll}
                disabled={combining || (selectedDate ? getFilteredMedia().length === 0 : media.length === 0)}
              >
                ✓ Select All
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleClearSelection}
                disabled={combining || selectedMedia.length === 0}
              >
                ✕ Clear Selection
              </button>
            </div>

            <p className="section-hint">
              {getFilteredMedia().length} file(s) available, {selectedMedia.length} file(s) selected
            </p>
            <MediaList
              media={getFilteredMedia()}
              selectedMedia={selectedMedia}
              onToggleSelection={toggleMediaSelection}
              onReorder={reorderMedia}
              mediaLocations={mediaLocations}
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

            <div className="form-group">
              <label>Video Chunk Size (for large files):</label>
              <select
                value={chunkSize}
                onChange={e => {
                  setChunkSize(e.target.value);
                  setSettings({ ...settings, chunkSize: e.target.value });
                }}
                disabled={combining}
                className="form-select"
              >
                <option value="100MB">100 MB</option>
                <option value="200MB">200 MB</option>
                <option value="500MB">500 MB (recommended)</option>
                <option value="1GB">1 GB</option>
              </select>
              <small>Splits large videos into chunks to avoid file size issues</small>
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
