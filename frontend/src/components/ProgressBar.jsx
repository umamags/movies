import React from 'react';
import './ProgressBar.css';

export default function ProgressBar({ progress, message }) {
  return (
    <div className="progress-container">
      <div className="progress-header">
        <h3>Processing Video</h3>
        <span className="progress-percent">{Math.round(progress)}%</span>
      </div>
      <div className="progress-bar-wrapper">
        <div className="progress-bar-background">
          <div
            className="progress-bar-fill"
            style={{ width: `${progress}%` }}
          >
            <span className="progress-bar-shine"></span>
          </div>
        </div>
      </div>
      <p className="progress-message">{message}</p>
      <div className="progress-details">
        <div className="detail-item">
          <span className="detail-label">Status:</span>
          <span className="detail-value">
            {progress === 100 ? '✓ Completed' : '⏳ Processing'}
          </span>
        </div>
      </div>
    </div>
  );
}
