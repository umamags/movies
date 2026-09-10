import React, { useState } from 'react';
import FileSelector from './FileSelector';
import ProgressBar from './ProgressBar';
import './DeleteAudio.css';

const BACKEND_URL = 'http://localhost:4000';

export default function DeleteAudio({ settings, setSettings }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFileSelect = (file) => {
    setSelectedFile(file);
    setError('');
    setSuccess('');
  };

  const handleDelete = async () => {
    if (!selectedFile) {
      setError('Please select a video file');
      return;
    }

    setDeleting(true);
    setProgress(0);
    setProgressMessage('Starting audio deletion...');
    setError('');
    setSuccess('');

    try {
      const mutation = `
        mutation DeleteAudio($filePath: String!) {
          deleteAudio(input: {
            filePath: $filePath
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
            filePath: selectedFile.path || selectedFile.name,
          }
        }),
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const result = data.data.deleteAudio;
      if (result.success) {
        setProgress(100);
        setProgressMessage('Complete!');
        setSuccess(`Audio deleted successfully! Saved to: ${result.outputFile}`);
      } else {
        setError(`Failed to delete audio: ${result.message}`);
      }
    } catch (err) {
      setError(`Error deleting audio: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="delete-audio">
      <div className="section">
        <h2>Delete Audio from Video</h2>
        <p className="description">
          Remove audio track from a video file and save the video-only file with "-modified" appended to the filename in the same folder as the original video.
        </p>

        <FileSelector
          selectedFile={selectedFile}
          onFileSelect={handleFileSelect}
          disabled={deleting}
          title="Video File Path"
        />
      </div>

      {selectedFile && (
        <>
          {error && <div className="alert alert-danger">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          {deleting && (
            <div className="section">
              <ProgressBar progress={progress} message={progressMessage} />
            </div>
          )}

          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              onClick={handleDelete}
              disabled={deleting || !selectedFile}
            >
              {deleting ? 'Deleting...' : '🔇 Delete Audio'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
