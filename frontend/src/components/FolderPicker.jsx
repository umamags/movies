import React, { useRef, useState } from 'react';
import './FolderPicker.css';

export default function FolderPicker({ folder, onFolderChange }) {
  const [inputValue, setInputValue] = useState(folder);
  const [isEditing, setIsEditing] = useState(false);
  const [pathError, setPathError] = useState('');
  const fileInputRef = useRef(null);

  const isValidPath = (path) => {
    // Path must be absolute (start with / or ~)
    return path.startsWith('/') || path.startsWith('~');
  };

  const handleSubmit = () => {
    const path = inputValue.trim();
    if (!path) {
      setPathError('Please enter a path');
      return;
    }
    if (!isValidPath(path)) {
      setPathError('Path must be absolute (start with / or ~). Example: /Users/username/Videos or ~/Documents');
      return;
    }
    setPathError('');
    onFolderChange(path);
    setIsEditing(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      setInputValue(folder);
      setPathError('');
      setIsEditing(false);
    }
  };

  const handleFolderSelect = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // The file picker gives relative paths, so we need to guide the user
      alert('File browser selected a folder. Please copy the full absolute path to the folder and paste it in the text field.\n\nExample: /Users/username/Videos or ~/Documents');
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="folder-picker">
      {isEditing ? (
        <div className="folder-input-group">
          <div className="folder-input-wrapper">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setPathError('');
              }}
              onKeyDown={handleKeyPress}
              autoFocus
              placeholder="e.g., ~/Downloads or /Users/username/Videos"
              className={`folder-input ${pathError ? 'error' : ''}`}
            />
            {pathError && <div className="path-error">{pathError}</div>}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            webkitdirectory="true"
            directory="true"
            multiple
            onChange={handleFolderSelect}
            style={{ display: 'none' }}
          />
          <button className="btn-submit" onClick={handleSubmit}>
            Load
          </button>
          <button
            className="btn-cancel"
            onClick={() => {
              setInputValue(folder);
              setPathError('');
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
