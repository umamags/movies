import React, { useState, useEffect } from 'react';
import './MediaItem.css';

const BACKEND_URL = 'http://localhost:4000';

export default function MediaItem({ media, isSelected, onToggle, onPreview }) {
  const [thumbnail, setThumbnail] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (media.type === 'video') {
      fetchThumbnail();
    } else if (media.type === 'image') {
      // For images, we'll create a simple placeholder with the image
      setThumbnail(media.path);
    }
  }, [media.id]);

  const fetchThumbnail = async () => {
    try {
      const query = `
        query GetThumbnail($videoPath: String!) {
          getThumbnail(videoPath: $videoPath)
        }
      `;

      const response = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { videoPath: media.path }
        }),
      });

      const data = await response.json();
      if (data.data?.getThumbnail) {
        setThumbnail(`${BACKEND_URL}${data.data.getThumbnail}`);
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
    <div className={`media-item ${isSelected ? 'selected' : ''} ${media.type}`}>
      <div className="media-thumbnail-wrapper" onClick={onPreview} role="button" tabIndex="0">
        <input
          type="checkbox"
          className="media-checkbox"
          checked={isSelected}
          onChange={onToggle}
        />
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={media.filename}
            className="media-thumbnail"
            onError={() => setError(true)}
          />
        ) : error ? (
          <div className="media-thumbnail-placeholder error">
            <span>{media.type === 'image' ? '🖼️' : '🎥'}</span>
          </div>
        ) : (
          <div className="media-thumbnail-placeholder loading">
            <span>Loading...</span>
          </div>
        )}
        <div className="media-badge">{media.type === 'image' ? '🖼️ Photo' : '🎥 Video'}</div>
        {media.type === 'video' && media.duration && (
          <div className="media-duration">{formatDuration(media.duration)}</div>
        )}
      </div>
      <div className="media-info">
        <h4 title={media.filename}>{media.filename}</h4>
        <p className="media-size">{formatFileSize(media.size)}</p>
        <p className="media-format">{media.format.toUpperCase()}</p>
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
