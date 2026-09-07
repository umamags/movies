import React, { useState } from 'react';
import './FolderPicker.css';

export default function FolderPicker({ folder, onFolderChange }) {
  const [inputValue, setInputValue] = useState(folder);
  const [isEditing, setIsEditing] = useState(false);

  const handleSubmit = () => {
    if (inputValue.trim()) {
      onFolderChange(inputValue.trim());
      setIsEditing(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      setInputValue(folder);
      setIsEditing(false);
    }
  };

  return (
    <div className="folder-picker">
      {isEditing ? (
        <div className="folder-input-group">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            autoFocus
            placeholder="Enter folder path..."
            className="folder-input"
          />
          <button className="btn-submit" onClick={handleSubmit}>
            Load
          </button>
          <button
            className="btn-cancel"
            onClick={() => {
              setInputValue(folder);
              setIsEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="folder-display">
          <span className="folder-path">📁 {folder}</span>
          <button className="btn-edit" onClick={() => setIsEditing(true)}>
            Change Folder
          </button>
        </div>
      )}
    </div>
  );
}
