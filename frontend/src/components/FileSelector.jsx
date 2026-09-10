import React from 'react';
import './FileSelector.css';

export default function FileSelector({ selectedFile, onFileSelect, disabled, title }) {
  const handleFilePathChange = (e) => {
    const path = e.target.value;
    onFileSelect({ name: path.split('/').pop(), path: path });
  };

  const handleFilePickerChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div className="file-selector">
      <div className="file-input-group">
        <label>{title || 'Video File Path'}:</label>
        <input
          type="text"
          value={selectedFile?.path || ''}
          onChange={handleFilePathChange}
          placeholder="/path/to/video.mkv"
          disabled={disabled}
          className="text-input-large"
        />
        <small>Enter the full file path (e.g., /Users/name/Downloads/video/movie.mkv)</small>
      </div>

      <div className="file-picker-divider">or</div>

      <div className="file-input-group">
        <label>Select from Computer:</label>
        <input
          type="file"
          accept="video/*"
          onChange={handleFilePickerChange}
          disabled={disabled}
          className="file-input"
        />
      </div>

      {selectedFile && (
        <div className="selected-file">
          <p>Selected: {selectedFile.name}</p>
          <p className="file-path-display">{selectedFile.path}</p>
        </div>
      )}
    </div>
  );
}
