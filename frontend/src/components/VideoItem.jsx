import React, { useState, useEffect } from 'react';
import './VideoItem.css';

export default function VideoItem({ video, isSelected, onToggle }) {
  const [thumbnail, setThumbnail] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchThumbnail();
  }, [video.id]);

  const fetchThumbnail = async () => {
    try {
      const query = `
        query {
          getThumbnail(videoPath: "${video.path.replace(/"/g, '\\"')}")
        }
      `;

      const response = await fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        setError(true);
        return;
      }

      const data = await response.json();
      if (data.data?.getThumbnail) {
        setThumbnail(`http://localhost:4000${data.data.getThumbnail}`);
      } else {
        setError(true);
      }
    } catch (err) {
      console.error('Failed to fetch thumbnail:', err);
      setError(true);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`video-item ${isSelected ? 'selected' : ''}`}>
      <div className="video-thumbnail-wrapper">
        <input
          type="checkbox"
          className="video-checkbox"
          checked={isSelected}
          onChange={onToggle}
        />
        {thumbnail ? (
          <img src={thumbnail} alt={video.filename} className="video-thumbnail" />
        ) : error ? (
          <div className="video-thumbnail-placeholder error">
            <span>No preview</span>
          </div>
        ) : (
          <div className="video-thumbnail-placeholder loading">
            <span>Loading...</span>
          </div>
        )}
        <div className="video-duration">{formatDuration(video.duration)}</div>
      </div>
      <div className="video-info">
        <h4 title={video.filename}>{video.filename}</h4>
        <p className="video-size">{formatFileSize(video.size)}</p>
        <p className="video-format">{video.format.toUpperCase()}</p>
      </div>
    </div>
  );
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
}
