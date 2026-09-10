import React, { useState } from 'react';
import FileSelector from './FileSelector';
import ProgressBar from './ProgressBar';
import './Timestamps.css';

const BACKEND_URL = 'http://localhost:4000';

export default function Timestamps() {
  const [folderPath, setFolderPath] = useState('');
  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [timestampFormat, setTimestampFormat] = useState('YYYYMMDD_HHMMSS');
  const [previewMode, setPreviewMode] = useState(null); // 'add' or 'remove'

  const handleFolderSelect = (folder) => {
    setFolderPath(folder.path || folder.name);
    setFiles([]);
    setPreview(null);
    setError('');
    setSuccess('');
  };

  const handleListFiles = async () => {
    if (!folderPath.trim()) {
      setError('Please enter a folder path');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const query = `
        query ListFilesInFolder($folderPath: String!) {
          listFilesInFolder(folderPath: $folderPath) {
            success
            message
            files {
              name
              timestamp
              hasTimestampPrefix
            }
          }
        }
      `;

      const response = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { folderPath }
        }),
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const result = data.data.listFilesInFolder;
      if (result.success) {
        setFiles(result.files);
        setPreview(null);
        setPreviewMode(null);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(`Error listing files: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTimestampPreview = () => {
    if (files.length === 0) {
      setError('No files to add timestamps');
      return;
    }

    const previewData = files.map(file => ({
      original: file.name,
      new: file.timestamp ? `${file.timestamp}_${file.name}` : file.name,
      timestamp: file.timestamp || 'N/A',
    }));

    setPreview(previewData);
    setPreviewMode('add');
  };

  const handleRemoveTimestampPreview = () => {
    if (files.length === 0) {
      setError('No files to remove timestamps');
      return;
    }

    const previewData = files
      .filter(file => file.hasTimestampPrefix)
      .map(file => ({
        original: file.name,
        new: file.name.replace(/^\d{8}_\d{6}_/, ''),
        timestamp: file.timestamp || 'N/A',
      }));

    if (previewData.length === 0) {
      setError('No files with timestamp prefixes found');
      return;
    }

    setPreview(previewData);
    setPreviewMode('remove');
  };

  const handleApply = async () => {
    if (!preview || !previewMode) {
      setError('No preview to apply');
      return;
    }

    setProcessing(true);
    setProgress(0);
    setProgressMessage(`Starting ${previewMode === 'add' ? 'adding' : 'removing'} timestamps...`);
    setError('');
    setSuccess('');

    try {
      const mutation = `
        mutation ProcessTimestamps($folderPath: String!, $mode: String!, $filePairs: [FilePairInput!]!) {
          processTimestamps(input: {
            folderPath: $folderPath
            mode: $mode
            filePairs: $filePairs
          }) {
            success
            message
            processedCount
            failedCount
            results {
              originalFile
              newFile
              status
              error
            }
          }
        }
      `;

      const filePairs = preview.map(item => ({
        original: item.original,
        new: item.new,
      }));

      const response = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: mutation,
          variables: {
            folderPath,
            mode: previewMode,
            filePairs,
          }
        }),
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const result = data.data.processTimestamps;
      setProgress(100);
      setProgressMessage('Complete!');

      if (result.success) {
        setSuccess(
          `✅ ${result.processedCount} file(s) ${previewMode === 'add' ? 'timestamped' : 'cleaned'}` +
          (result.failedCount > 0 ? ` | ❌ ${result.failedCount} failed` : '')
        );
        setFiles([]);
        setPreview(null);
        setPreviewMode(null);
      } else {
        setError(`Failed: ${result.message}`);
      }
    } catch (err) {
      setError(`Error processing files: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="timestamps">
      <div className="section">
        <h2>File Timestamps</h2>
        <p className="description">
          Add or remove timestamps (YYYYMMDD_HHMMSS) to file names based on creation dates from metadata.
        </p>

        <FileSelector
          selectedFile={folderPath ? { name: folderPath, path: folderPath } : null}
          onFileSelect={handleFolderSelect}
          disabled={loading || processing}
          title="Folder Path"
        />

        <div className="controls">
          <button
            className="btn btn-secondary"
            onClick={handleListFiles}
            disabled={loading || processing || !folderPath.trim()}
          >
            {loading ? 'Loading...' : '📁 List Files'}
          </button>
        </div>
      </div>

      {files.length > 0 && !preview && (
        <div className="section">
          <h3>Files Found ({files.length})</h3>
          <div className="files-preview">
            {files.slice(0, 10).map((file, idx) => (
              <div key={idx} className="file-preview-item">
                <div className="file-info">
                  <span className="file-name">{file.name}</span>
                  <span className="file-timestamp">{file.timestamp || 'No timestamp'}</span>
                </div>
                {file.hasTimestampPrefix && <span className="badge">Has Prefix</span>}
              </div>
            ))}
            {files.length > 10 && <div className="more-files">...and {files.length - 10} more files</div>}
          </div>

          <div className="action-buttons">
            <button
              className="btn btn-primary"
              onClick={handleAddTimestampPreview}
              disabled={processing}
            >
              ➕ Add Timestamps
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleRemoveTimestampPreview}
              disabled={processing}
            >
              ✂️ Remove Timestamps
            </button>
          </div>
        </div>
      )}

      {preview && (
        <div className="section">
          <h3>Preview: {previewMode === 'add' ? 'Add Timestamps' : 'Remove Timestamps'}</h3>
          <div className="preview-list">
            {preview.map((item, idx) => (
              <div key={idx} className="preview-item">
                <div className="preview-column">
                  <div className="label">Before:</div>
                  <div className="filename before">{item.original}</div>
                </div>
                <div className="arrow">→</div>
                <div className="preview-column">
                  <div className="label">After:</div>
                  <div className="filename after">{item.new}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="action-buttons">
            <button
              className="btn btn-success btn-large"
              onClick={handleApply}
              disabled={processing}
            >
              {processing ? 'Applying...' : '✅ Apply Changes'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setPreview(null);
                setPreviewMode(null);
              }}
              disabled={processing}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {processing && (
        <div className="section">
          <ProgressBar progress={progress} message={progressMessage} />
        </div>
      )}

      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
    </div>
  );
}
