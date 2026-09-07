import React from 'react';
import './QualitySelector.css';

export default function QualitySelector({ quality, onQualityChange, disabled }) {
  const options = [
    { value: 'auto-detect', label: 'Auto-detect (original quality)', description: 'Maintain original bitrate' },
    { value: 'high', label: 'High (5000k video, 192k audio)', description: 'Best quality' },
    { value: 'medium', label: 'Medium (2500k video, 128k audio)', description: 'Balanced' },
    { value: 'low', label: 'Low (1000k video, 96k audio)', description: 'Smaller file size' },
  ];

  return (
    <div className="quality-selector">
      <div className="quality-options">
        {options.map(option => (
          <label key={option.value} className="quality-option">
            <input
              type="radio"
              name="quality"
              value={option.value}
              checked={quality === option.value}
              onChange={e => onQualityChange(e.target.value)}
              disabled={disabled}
            />
            <span className="option-label">{option.label}</span>
            <span className="option-description">{option.description}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
