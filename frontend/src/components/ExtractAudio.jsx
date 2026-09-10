import React, { useState } from 'react';
import FileSelector from './FileSelector';
import ProgressBar from './ProgressBar';
import './ExtractAudio.css';

const BACKEND_URL = 'http://localhost:4000';

export default function ExtractAudio({ settings, setSettings }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFileSelect = (file) => {
    setSelectedFile(file);
    setError('');
    setSuccess('');
  };

  const handleExtract = async () => {
    if (!selectedFile) {
      setError('Please select a video file');
      return;
    }

    setExtracting(true);
    setProgress(0);
    setProgressMessage('Starting audio extraction...');
    setError('');
    setSuccess('');

    try {
      const mutation = `
        mutation ExtractAudio($filePath: String!) {
          extractAudio(input: {
            filePath: $filePath
          }) {
            success
            message
            audioFile
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
          }
        }),
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const result = data.data.extractAudio;
      if (result.success) {
        setProgress(100);
        setProgressMessage('Complete!');
        setSuccess(`Audio extracted successfully! Saved to: ${result.audioFile}`);
      } else {
        setError(`Failed to extract audio: ${result.message}`);
      }
    } catch (err) {
      setError(`Error extracting audio: ${err.message}`);
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="extract-audio">
      <div className="section">
        <h2>Extract Audio from Video</h2>
        <p className="description">
          Extract audio from a video file and save it as an MP3 file in the same folder as the original video.
        </p>

        <FileSelector
          selectedFile={selectedFile}
          onFileSelect={handleFileSelect}
          disabled={extracting}
          title="Video File Path"
        />
      </div>

      {selectedFile && (
        <>
          {error && <div className="alert alert-danger">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          {extracting && (
            <div className="section">
              <ProgressBar progress={progress} message={progressMessage} />
            </div>
          )}

          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              onClick={handleExtract}
              disabled={extracting || !selectedFile}
            >
              {extracting ? 'Extracting...' : '🎵 Extract Audio'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
