import React, { useState } from 'react';
import FileSelector from './FileSelector';
import ProgressBar from './ProgressBar';
import './SplitVideo.css';

const BACKEND_URL = 'http://localhost:4000';

export default function SplitVideo({ settings, setSettings }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [mode, setMode] = useState('size'); // 'size' or 'time'
  const [sizeValue, setSizeValue] = useState(50); // in MB
  const [timeValue, setTimeValue] = useState(1); // in minutes
  const [splitting, setSplitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFileSelect = (file) => {
    setSelectedFile(file);
    if (file.path) {
      setSettings({ ...settings, lastFileLocation: file.path });
    }
    setError('');
    setSuccess('');
  };

  const handleSizeChange = (e) => {
    setSizeValue(parseFloat(e.target.value));
  };

  const handleSizeTextChange = (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 50 && value <= 500) {
      setSizeValue(value);
    }
  };

  const handleTimeChange = (e) => {
    setTimeValue(parseFloat(e.target.value));
  };

  const handleTimeTextChange = (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 1 && value <= 30) {
      setTimeValue(value);
    }
  };

  const handleSplit = async () => {
    if (!selectedFile) {
      setError('Please select a video file');
      return;
    }

    setSplitting(true);
    setProgress(0);
    setProgressMessage('Preparing to split video...');
    setError('');
    setSuccess('');

    try {
      const mutation = `
        mutation SplitVideo($filePath: String!, $mode: String!, $sizeValue: Float, $timeValue: Float) {
          splitVideo(input: {
            filePath: $filePath
            mode: $mode
            sizeValue: $sizeValue
            timeValue: $timeValue
          }) {
            success
            message
            parts
          }
        }
      `;

      const response = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: mutation,
          variables: {
            filePath: selectedFile.path || selectedFile.name,
            mode: mode,
            sizeValue: mode === 'size' ? sizeValue : null,
            timeValue: mode === 'time' ? timeValue : null,
          }
        }),
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const result = data.data.splitVideo;
      if (result.success) {
        setProgress(100);
        setProgressMessage('Complete!');
        setSuccess(`Video split successfully! Created ${result.parts} part(s)`);
      } else {
        setError(`Failed to split video: ${result.message}`);
      }
    } catch (err) {
      setError(`Error splitting video: ${err.message}`);
    } finally {
      setSplitting(false);
    }
  };

  return (
    <div className="split-video">
      <div className="section">
        <h2>Split Video File</h2>

        <FileSelector
          selectedFile={selectedFile}
          onFileSelect={handleFileSelect}
          disabled={splitting}
          title="Video File Path"
        />
      </div>

      {selectedFile && (
        <>
          {error && <div className="alert alert-danger">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <div className="section">
            <h2>Split Options</h2>

            <div className="mode-selector">
              <label className="mode-option">
                <input
                  type="radio"
                  value="size"
                  checked={mode === 'size'}
                  onChange={(e) => setMode(e.target.value)}
                  disabled={splitting}
                />
                <span>Split by File Size</span>
              </label>
              <label className="mode-option">
                <input
                  type="radio"
                  value="time"
                  checked={mode === 'time'}
                  onChange={(e) => setMode(e.target.value)}
                  disabled={splitting}
                />
                <span>Split by Duration</span>
              </label>
            </div>

            {mode === 'size' && (
              <div className="form-group">
                <label>Split by File Size: {sizeValue} MB</label>
                <input
                  type="range"
                  min="50"
                  max="500"
                  step="10"
                  value={sizeValue}
                  onChange={handleSizeChange}
                  disabled={splitting}
                  className="slider"
                />
                <div className="slider-labels">
                  <span>50 MB</span>
                  <span>500 MB</span>
                </div>
                <input
                  type="number"
                  min="50"
                  max="500"
                  step="10"
                  value={sizeValue}
                  onChange={handleSizeTextChange}
                  disabled={splitting}
                  className="text-input"
                  placeholder="Enter size in MB"
                />
              </div>
            )}

            {mode === 'time' && (
              <div className="form-group">
                <label>Split by Duration: {timeValue} minute(s)</label>
                <input
                  type="range"
                  min="1"
                  max="30"
                  step="0.5"
                  value={timeValue}
                  onChange={handleTimeChange}
                  disabled={splitting}
                  className="slider"
                />
                <div className="slider-labels">
                  <span>1 min</span>
                  <span>30 min</span>
                </div>
                <input
                  type="number"
                  min="1"
                  max="30"
                  step="0.5"
                  value={timeValue}
                  onChange={handleTimeTextChange}
                  disabled={splitting}
                  className="text-input"
                  placeholder="Enter duration in minutes"
                />
              </div>
            )}
          </div>

          {splitting && (
            <div className="section">
              <ProgressBar progress={progress} message={progressMessage} />
            </div>
          )}

          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              onClick={handleSplit}
              disabled={splitting || !selectedFile}
            >
              {splitting ? 'Splitting...' : '✂️ Split Video'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
