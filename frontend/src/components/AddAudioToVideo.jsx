import React, { useState } from 'react';
import FileSelector from './FileSelector';
import ProgressBar from './ProgressBar';
import './AddAudioToVideo.css';

const BACKEND_URL = 'http://localhost:4000';

export default function AddAudioToVideo({ settings, setSettings }) {
  const [selectedVideoFile, setSelectedVideoFile] = useState(null);
  const [selectedAudioFile, setSelectedAudioFile] = useState(null);
  const [mode, setMode] = useState('replace');
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleVideoFileSelect = (file) => {
    setSelectedVideoFile(file);
    setError('');
    setSuccess('');
  };

  const handleAudioFileSelect = (file) => {
    setSelectedAudioFile(file);
    setError('');
    setSuccess('');
  };

  const handleAdd = async () => {
    if (!selectedVideoFile) {
      setError('Please select a video file');
      return;
    }

    if (!selectedAudioFile) {
      setError('Please select an audio file');
      return;
    }

    setAdding(true);
    setProgress(0);
    setProgressMessage('Starting audio addition...');
    setError('');
    setSuccess('');

    try {
      const mutation = `
        mutation AddAudioToVideo($videoPath: String!, $audioPath: String!, $mode: String!) {
          addAudioToVideo(input: {
            videoPath: $videoPath
            audioPath: $audioPath
            mode: $mode
          }) {
            success
            message
            outputFile
          }
        }
      `;

      const response = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: mutation,
          variables: {
            videoPath: selectedVideoFile.path || selectedVideoFile.name,
            audioPath: selectedAudioFile.path || selectedAudioFile.name,
            mode: mode,
          }
        }),
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const result = data.data.addAudioToVideo;
      if (result.success) {
        setProgress(100);
        setProgressMessage('Complete!');
        setSuccess(`Audio ${mode === 'mix' ? 'mixed' : 'replaced'} successfully! Saved to: ${result.outputFile}`);
      } else {
        setError(`Failed to add audio: ${result.message}`);
      }
    } catch (err) {
      setError(`Error adding audio: ${err.message}`);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="add-audio-to-video">
      <div className="section">
        <h2>Add Audio to Video</h2>
        <p className="description">
          Overlay or replace the audio track in a video file. The output file will be saved in the same folder as the original video with "-edited" appended to the filename.
        </p>

        <FileSelector
          selectedFile={selectedVideoFile}
          onFileSelect={handleVideoFileSelect}
          disabled={adding}
          title="Video File Path"
        />
      </div>

      <div className="section">
        <FileSelector
          selectedFile={selectedAudioFile}
          onFileSelect={handleAudioFileSelect}
          disabled={adding}
          title="Audio File Path"
        />
      </div>

      <div className="section">
        <h3>Audio Mode</h3>
        <div className="mode-selection">
          <label>
            <input
              type="radio"
              value="replace"
              checked={mode === 'replace'}
              onChange={(e) => setMode(e.target.value)}
              disabled={adding}
            />
            <span className="mode-label">Replace Audio (Default)</span>
            <span className="mode-description">Replace the video's audio with the new audio file</span>
          </label>
          <label>
            <input
              type="radio"
              value="mix"
              checked={mode === 'mix'}
              onChange={(e) => setMode(e.target.value)}
              disabled={adding}
            />
            <span className="mode-label">Mix Audio</span>
            <span className="mode-description">Overlay the new audio with the existing video audio</span>
          </label>
        </div>
      </div>

      {selectedVideoFile && selectedAudioFile && (
        <>
          {error && <div className="alert alert-danger">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          {adding && (
            <div className="section">
              <ProgressBar progress={progress} message={progressMessage} />
            </div>
          )}

          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              onClick={handleAdd}
              disabled={adding || !selectedVideoFile || !selectedAudioFile}
            >
              {adding ? 'Adding Audio...' : '🎵 Add Audio to Video'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
