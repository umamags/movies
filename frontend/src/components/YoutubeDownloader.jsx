import React, { useState } from 'react';
import ProgressBar from './ProgressBar';
import './YoutubeDownloader.css';

const BACKEND_URL = 'http://localhost:4000';

export default function YoutubeDownloader() {
  const [urlsInput, setUrlsInput] = useState('');
  const [urls, setUrls] = useState([]);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [urlStatuses, setUrlStatuses] = useState({});
  const [validationErrors, setValidationErrors] = useState([]);

  const isValidYoutubeUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|youtube\.com\/playlist|youtube\.com\/channel|youtube\.com\/@)\S+$/i;
    return youtubeRegex.test(url);
  };

  const getUrlType = (url) => {
    if (url.includes('/playlist')) return 'playlist';
    if (url.includes('/channel/') || url.includes('/@')) return 'channel';
    return 'video';
  };

  const validateUrls = () => {
    const errors = [];
    const urlList = urlsInput
      .split('\n')
      .map(u => u.trim())
      .filter(u => u.length > 0);

    if (urlList.length === 0) {
      errors.push('Please enter at least one YouTube URL');
      setValidationErrors(errors);
      return null;
    }

    urlList.forEach((url, idx) => {
      if (!isValidYoutubeUrl(url)) {
        errors.push(`Line ${idx + 1}: Invalid YouTube URL format`);
      }

      const urlType = getUrlType(url);
      if (urlType === 'playlist') {
        errors.push(`Line ${idx + 1}: This is a playlist URL. Multiple videos will be downloaded.`);
      } else if (urlType === 'channel') {
        errors.push(`Line ${idx + 1}: This is a channel URL. All videos from the channel will be downloaded.`);
      }
    });

    setValidationErrors(errors);
    setUrls(urlList);
    return urlList.length > 0 ? urlList : null;
  };

  const handleDownload = async () => {
    const urlList = validateUrls();
    if (!urlList || validationErrors.length > 0) {
      return;
    }

    setDownloading(true);
    setProgress(0);
    setProgressMessage('Starting downloads...');
    setError('');
    setUrlStatuses({});

    const newStatuses = {};
    urlList.forEach(url => {
      newStatuses[url] = { status: 'pending', message: '' };
    });
    setUrlStatuses(newStatuses);

    try {
      let completedCount = 0;

      for (let i = 0; i < urlList.length; i++) {
        const url = urlList[i];

        // Update status to downloading
        setUrlStatuses(prev => ({
          ...prev,
          [url]: { status: 'downloading', message: 'Downloading...' }
        }));

        setProgress(Math.round((completedCount / urlList.length) * 100));
        setProgressMessage(`Downloading ${i + 1} of ${urlList.length}...`);

        try {
          const mutation = `
            mutation DownloadYoutube($url: String!) {
              downloadYoutube(url: $url) {
                success
                message
                filename
              }
            }
          `;

          const response = await fetch(`${BACKEND_URL}/graphql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: mutation,
              variables: { url }
            }),
          });

          const data = await response.json();

          if (data.errors) {
            throw new Error(data.errors[0].message);
          }

          const result = data.data.downloadYoutube;

          if (result.success) {
            setUrlStatuses(prev => ({
              ...prev,
              [url]: {
                status: 'complete',
                message: `✓ Downloaded: ${result.filename}`
              }
            }));
            completedCount++;
          } else {
            setUrlStatuses(prev => ({
              ...prev,
              [url]: {
                status: 'failed',
                message: `✗ ${result.message}`
              }
            }));
            setError(`Download failed for URL ${i + 1}: ${result.message}`);
            setDownloading(false);
            return;
          }
        } catch (err) {
          setUrlStatuses(prev => ({
            ...prev,
            [url]: {
              status: 'failed',
              message: `✗ Error: ${err.message}`
            }
          }));
          setError(`Error downloading URL ${i + 1}: ${err.message}`);
          setDownloading(false);
          return;
        }
      }

      setProgress(100);
      setProgressMessage('All downloads complete!');
      setUrlsInput('');
    } finally {
      setDownloading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'complete':
        return '#28a745';
      case 'failed':
        return '#dc3545';
      case 'downloading':
        return '#007bff';
      case 'pending':
        return '#6c757d';
      default:
        return '#333';
    }
  };

  return (
    <div className="youtube-downloader">
      <div className="section">
        <h2>YouTube Downloader</h2>
        <p className="description">
          Download videos from YouTube. Enter one URL per line. Supports individual videos, playlists, and channels.
        </p>

        <div className="form-group">
          <label>YouTube URLs:</label>
          <textarea
            value={urlsInput}
            onChange={(e) => setUrlsInput(e.target.value)}
            placeholder="Paste YouTube URLs here (one per line)&#10;Examples:&#10;https://www.youtube.com/watch?v=dQw4w9WgXcQ&#10;https://www.youtube.com/playlist?list=PLxxxxxx&#10;https://www.youtube.com/@channelname"
            disabled={downloading}
            className="urls-textarea"
            rows={8}
          />
          <small className="help-text">
            Videos will be saved to your Downloads folder with sanitized filenames.
          </small>
        </div>

        {validationErrors.length > 0 && (
          <div className="alert alert-warning">
            <strong>Note:</strong>
            <ul>
              {validationErrors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {error && <div className="alert alert-danger">{error}</div>}
      </div>

      {urls.length > 0 && (
        <div className="section">
          <h3>URLs ({Object.keys(urlStatuses).length}/{urls.length})</h3>

          <div className="urls-list">
            {urls.map((url, idx) => {
              const status = urlStatuses[url];
              const statusColor = status ? getStatusColor(status.status) : '#333';

              return (
                <div key={idx} className="url-item">
                  <div className="url-status-indicator" style={{ backgroundColor: statusColor }} />
                  <div className="url-content">
                    <div className="url-link">
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        {url}
                      </a>
                    </div>
                    {status && (
                      <div className="url-message">{status.message}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {downloading && (
        <div className="section">
          <ProgressBar progress={progress} message={progressMessage} />
        </div>
      )}

      <div className="actions">
        <button
          className="btn btn-primary btn-lg"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? 'Downloading...' : '📥 Download Videos'}
        </button>
      </div>
    </div>
  );
}
