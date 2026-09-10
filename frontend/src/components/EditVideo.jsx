import React, { useState, useEffect } from 'react';
import FileSelector from './FileSelector';
import ProgressBar from './ProgressBar';
import './EditVideo.css';

const BACKEND_URL = 'http://localhost:4000';

export default function EditVideo({ settings, setSettings }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [videoDuration, setVideoDuration] = useState(null);
  const [deletionRanges, setDeletionRanges] = useState([{ id: 1, startTime: '', endTime: '' }]);
  const [nextId, setNextId] = useState(2);
  const [editing, setEditing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [validationErrors, setValidationErrors] = useState([]);

  const handleFileSelect = async (file) => {
    setSelectedFile(file);
    setDeletionRanges([{ id: 1, startTime: '', endTime: '' }]);
    setNextId(2);
    setError('');
    setSuccess('');
    setValidationErrors([]);

    // Fetch video duration
    try {
      const query = `
        query GetVideoDuration($filePath: String!) {
          getVideoDuration(filePath: $filePath)
        }
      `;

      const response = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: {
            filePath: file.path || file.name,
          }
        }),
      });

      const data = await response.json();
      if (data.data?.getVideoDuration) {
        setVideoDuration(data.data.getVideoDuration);
      }
    } catch (err) {
      console.error('Failed to fetch video duration:', err.message);
    }
  };

  const timeStringToSeconds = (timeStr) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length !== 3) return 0;
    const hours = parseInt(parts[0]) || 0;
    const minutes = parseInt(parts[1]) || 0;
    const seconds = parseInt(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  };

  const secondsToTimeString = (secs) => {
    if (isNaN(secs) || secs < 0) return '00:00:00';
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = Math.floor(secs % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const validateRanges = () => {
    const errors = [];
    const ranges = deletionRanges.filter(r => r.startTime || r.endTime);

    if (ranges.length === 0) {
      errors.push('Please enter at least one deletion range');
      return errors;
    }

    ranges.forEach((range, idx) => {
      if (!range.startTime) {
        errors.push(`Range ${idx + 1}: Start time is required`);
      }
      if (!range.endTime) {
        errors.push(`Range ${idx + 1}: End time is required`);
      }

      const startSecs = timeStringToSeconds(range.startTime);
      const endSecs = timeStringToSeconds(range.endTime);

      if (startSecs >= endSecs) {
        errors.push(`Range ${idx + 1}: End time must be after start time`);
      }

      if (videoDuration && endSecs > videoDuration) {
        errors.push(`Range ${idx + 1}: End time (${range.endTime}) exceeds video duration (${secondsToTimeString(videoDuration)})`);
      }

      if (videoDuration && startSecs > videoDuration) {
        errors.push(`Range ${idx + 1}: Start time (${range.startTime}) exceeds video duration (${secondsToTimeString(videoDuration)})`);
      }
    });

    // Check for overlapping ranges
    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        const start1 = timeStringToSeconds(ranges[i].startTime);
        const end1 = timeStringToSeconds(ranges[i].endTime);
        const start2 = timeStringToSeconds(ranges[j].startTime);
        const end2 = timeStringToSeconds(ranges[j].endTime);

        if ((start1 < end2 && end1 > start2)) {
          errors.push(`Ranges overlap: ${ranges[i].startTime}-${ranges[i].endTime} and ${ranges[j].startTime}-${ranges[j].endTime}`);
        }
      }
    }

    setValidationErrors(errors);
    return errors;
  };

  const handleAddRange = () => {
    if (deletionRanges.length < 5) {
      setDeletionRanges([...deletionRanges, { id: nextId, startTime: '', endTime: '' }]);
      setNextId(nextId + 1);
    }
  };

  const handleRemoveRange = (id) => {
    if (deletionRanges.length > 1) {
      setDeletionRanges(deletionRanges.filter(r => r.id !== id));
    }
  };

  const handleTimeChange = (id, field, value) => {
    setDeletionRanges(deletionRanges.map(r =>
      r.id === id ? { ...r, [field]: value } : r
    ));
    setValidationErrors([]);
  };

  const getKeptPortions = () => {
    const ranges = deletionRanges.filter(r => r.startTime && r.endTime)
      .map(r => ({
        start: timeStringToSeconds(r.startTime),
        end: timeStringToSeconds(r.endTime)
      }))
      .sort((a, b) => a.start - b.start);

    if (ranges.length === 0 || !videoDuration) return [];

    const kept = [];
    let currentPos = 0;

    ranges.forEach(range => {
      if (currentPos < range.start) {
        kept.push({ start: currentPos, end: range.start });
      }
      currentPos = Math.max(currentPos, range.end);
    });

    if (currentPos < videoDuration) {
      kept.push({ start: currentPos, end: videoDuration });
    }

    return kept;
  };

  const handleEdit = async () => {
    const errors = validateRanges();
    if (errors.length > 0) return;

    if (!selectedFile) {
      setError('Please select a video file');
      return;
    }

    setEditing(true);
    setProgress(0);
    setProgressMessage('Starting video editing...');
    setError('');
    setSuccess('');

    try {
      const mutation = `
        mutation EditVideo($filePath: String!, $deletionRanges: [DeletionRangeInput!]!) {
          editVideo(input: {
            filePath: $filePath
            deletionRanges: $deletionRanges
          }) {
            success
            message
            outputFile
          }
        }
      `;

      const rangeInputs = deletionRanges
        .filter(r => r.startTime && r.endTime)
        .map(r => ({
          startTime: r.startTime,
          endTime: r.endTime
        }));

      const response = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: mutation,
          variables: {
            filePath: selectedFile.path || selectedFile.name,
            deletionRanges: rangeInputs,
          }
        }),
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const result = data.data.editVideo;
      if (result.success) {
        setProgress(100);
        setProgressMessage('Complete!');
        setSuccess(`Video edited successfully! Saved to: ${result.outputFile}`);
      } else {
        setError(`Failed to edit video: ${result.message}`);
      }
    } catch (err) {
      setError(`Error editing video: ${err.message}`);
    } finally {
      setEditing(false);
    }
  };

  const Timeline = () => {
    if (!videoDuration) return null;

    const kept = getKeptPortions();
    const ranges = deletionRanges
      .filter(r => r.startTime && r.endTime)
      .map(r => ({
        start: timeStringToSeconds(r.startTime),
        end: timeStringToSeconds(r.endTime)
      }));

    return (
      <div className="timeline-section">
        <h3>Timeline Preview</h3>
        <div className="timeline-info">
          <p>Total Duration: <strong>{secondsToTimeString(videoDuration)}</strong></p>
          <p>Time to Keep: <strong>{secondsToTimeString(kept.reduce((sum, k) => sum + (k.end - k.start), 0))}</strong></p>
          <p>Time to Delete: <strong>{secondsToTimeString(ranges.reduce((sum, d) => sum + (d.end - d.start), 0))}</strong></p>
        </div>

        <div className="timeline-bar">
          <div className="timeline-background">
            {ranges.map((range, idx) => (
              <div
                key={idx}
                className="timeline-segment timeline-delete"
                style={{
                  left: `${(range.start / videoDuration) * 100}%`,
                  width: `${((range.end - range.start) / videoDuration) * 100}%`,
                }}
                title={`Delete: ${secondsToTimeString(range.start)} - ${secondsToTimeString(range.end)}`}
              />
            ))}
            {kept.map((range, idx) => (
              <div
                key={`keep-${idx}`}
                className="timeline-segment timeline-keep"
                style={{
                  left: `${(range.start / videoDuration) * 100}%`,
                  width: `${((range.end - range.start) / videoDuration) * 100}%`,
                }}
                title={`Keep: ${secondsToTimeString(range.start)} - ${secondsToTimeString(range.end)}`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="edit-video">
      <div className="section">
        <h2>Edit Video</h2>
        <p className="description">
          Remove specific time ranges from your video. You can define up to 5 deletion ranges.
        </p>

        <FileSelector
          selectedFile={selectedFile}
          onFileSelect={handleFileSelect}
          disabled={editing}
          title="Video File Path"
        />
      </div>

      {selectedFile && videoDuration && (
        <>
          {error && <div className="alert alert-danger">{error}</div>}
          {validationErrors.length > 0 && (
            <div className="alert alert-danger">
              <strong>Validation Errors:</strong>
              <ul>
                {validationErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          {success && <div className="alert alert-success">{success}</div>}

          <Timeline />

          <div className="section">
            <h3>Deletion Ranges</h3>

            <div className="ranges-container">
              {deletionRanges.map((range, idx) => (
                <div key={range.id} className="range-row">
                  <div className="range-label">Range {idx + 1}:</div>

                  <div className="time-input-group">
                    <label>Start Time:</label>
                    <input
                      type="text"
                      value={range.startTime}
                      onChange={(e) => handleTimeChange(range.id, 'startTime', e.target.value)}
                      placeholder="hh:mm:ss"
                      disabled={editing}
                      className="time-text-input"
                    />
                    <input
                      type="time"
                      value={range.startTime.substring(0, 5) || ''}
                      onChange={(e) => {
                        const [h, m] = e.target.value.split(':');
                        handleTimeChange(range.id, 'startTime', `${h}:${m}:00`);
                      }}
                      disabled={editing}
                      className="time-picker-input"
                    />
                  </div>

                  <div className="time-input-group">
                    <label>End Time:</label>
                    <input
                      type="text"
                      value={range.endTime}
                      onChange={(e) => handleTimeChange(range.id, 'endTime', e.target.value)}
                      placeholder="hh:mm:ss"
                      disabled={editing}
                      className="time-text-input"
                    />
                    <input
                      type="time"
                      value={range.endTime.substring(0, 5) || ''}
                      onChange={(e) => {
                        const [h, m] = e.target.value.split(':');
                        handleTimeChange(range.id, 'endTime', `${h}:${m}:00`);
                      }}
                      disabled={editing}
                      className="time-picker-input"
                    />
                  </div>

                  {deletionRanges.length > 1 && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleRemoveRange(range.id)}
                      disabled={editing}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            {deletionRanges.length < 5 && (
              <button
                className="btn btn-secondary"
                onClick={handleAddRange}
                disabled={editing}
              >
                + Add Range
              </button>
            )}
          </div>

          {editing && (
            <div className="section">
              <ProgressBar progress={progress} message={progressMessage} />
            </div>
          )}

          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              onClick={handleEdit}
              disabled={editing || !selectedFile}
            >
              {editing ? 'Editing...' : '✂️ Edit Video'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
