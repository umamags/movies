import React, { useEffect } from 'react';
import './PreviewModal.css';

export default function PreviewModal({ media, onClose }) {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!media) return null;

  const isImage = media.type === 'image';
  const isVideo = media.type === 'video';

  return (
    <div className="preview-modal-overlay" onClick={onClose}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        <button className="preview-close" onClick={onClose} title="Close (Esc)">
          ✕
        </button>

        <div className="preview-content">
          {isImage ? (
            <img
              src={media.path}
              alt={media.filename}
              className="preview-image"
            />
          ) : isVideo ? (
            <video
              src={media.path}
              controls
              autoPlay
              className="preview-video"
            />
          ) : null}
        </div>

        <div className="preview-info">
          <h3>{media.filename}</h3>
          <div className="preview-details">
            <span>{media.type === 'image' ? '🖼️ Photo' : '🎥 Video'}</span>
            <span>{formatFileSize(media.size)}</span>
            <span>{media.format.toUpperCase()}</span>
            {media.duration && <span>{formatDuration(media.duration)}</span>}
          </div>
        </div>
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

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
