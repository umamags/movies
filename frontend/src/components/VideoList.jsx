import React, { useState } from 'react';
import VideoItem from './VideoItem';
import './VideoList.css';

export default function VideoList({
  videos,
  selectedVideos,
  onToggleSelection,
  onReorder,
}) {
  const [draggedId, setDraggedId] = useState(null);

  const handleDragStart = (videoId) => {
    setDraggedId(videoId);
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

  const orderedVideos = selectedVideos
    .map(id => videos.find(v => v.id === id))
    .filter(Boolean);

  return (
    <div className="video-list">
      <div className="video-list-container">
        {orderedVideos.length > 0 && (
          <div className="selected-videos">
            <h3>Selected Videos (in order):</h3>
            <div className="ordered-list">
              {orderedVideos.map((video, index) => (
                <div
                  key={video.id}
                  className={`video-order-item ${draggedId === video.id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(video.id)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(video.id)}
                  onDragEnd={handleDragEnd}
                >
                  <span className="order-number">{index + 1}</span>
                  <span className="order-name">{video.filename}</span>
                  <span className="order-duration">
                    {formatDuration(video.duration)}
                  </span>
                  <button
                    className="remove-btn"
                    onClick={() => onToggleSelection(video.id)}
                    title="Remove from selection"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <h3>Available Videos:</h3>
        <div className="videos-grid">
          {videos.map(video => (
            <VideoItem
              key={video.id}
              video={video}
              isSelected={selectedVideos.includes(video.id)}
              onToggle={() => onToggleSelection(video.id)}
            />
          ))}
        </div>
      </div>
    </div>
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
