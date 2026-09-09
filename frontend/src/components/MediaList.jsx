import React, { useState } from 'react';
import MediaItem from './MediaItem';
import PreviewModal from './PreviewModal';
import './MediaList.css';

export default function MediaList({
  media,
  selectedMedia,
  onToggleSelection,
  onReorder,
  mediaLocations = {},
}) {
  const [draggedId, setDraggedId] = useState(null);
  const [previewMedia, setPreviewMedia] = useState(null);

  const handleDragStart = (mediaId) => {
    setDraggedId(mediaId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (targetId) => {
    if (draggedId && draggedId !== targetId) {
      onReorder(draggedId, targetId);
    }
    setDraggedId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  const orderedMedia = selectedMedia
    .map(id => media.find(m => m.id === id))
    .filter(Boolean);

  return (
    <>
      <div className="media-list">
        <div className="media-list-container">
          {orderedMedia.length > 0 && (
            <div className="selected-media">
              <h3>Selected Media (in order):</h3>
              <div className="ordered-list">
                {orderedMedia.map((m, index) => (
                  <div
                    key={m.id}
                    className={`media-order-item ${draggedId === m.id ? 'dragging' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(m.id)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(m.id)}
                    onDragEnd={handleDragEnd}
                  >
                    <span className="order-number">{index + 1}</span>
                    <span className="order-type">{m.type === 'image' ? '🖼️' : '🎥'}</span>
                    <span className="order-name">{m.filename}</span>
                    {m.type === 'video' && m.duration && (
                      <span className="order-duration">{formatDuration(m.duration)}</span>
                    )}
                    {m.type === 'image' && <span className="order-duration">Photo</span>}
                    <button
                      className="remove-btn"
                      onClick={() => onToggleSelection(m.id)}
                      title="Remove from selection"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h3>Available Media:</h3>
          <div className="media-grid">
            {media.map(m => (
              <MediaItem
                key={m.id}
                media={m}
                isSelected={selectedMedia.includes(m.id)}
                onToggle={() => onToggleSelection(m.id)}
                onPreview={() => setPreviewMedia(m)}
                location={mediaLocations[m.id]}
              />
            ))}
          </div>
        </div>
      </div>

      <PreviewModal media={previewMedia} onClose={() => setPreviewMedia(null)} />
    </>
  );
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
