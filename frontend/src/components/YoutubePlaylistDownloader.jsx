import React, { useState } from 'react';
import ProgressBar from './ProgressBar';
import './YoutubePlaylistDownloader.css';

const BACKEND_URL = 'http://localhost:4000';

function convertDurationToReadable(duration) {
  // Convert ISO 8601 duration (PT1H30M45S) to readable text format
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 'unknown duration';

  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;

  const parts = [];

  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  }
  if (seconds > 0) {
    parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
  }

  if (parts.length === 0) {
    return 'less than 1 second';
  }

  return parts.join(' ');
}

function formatViewCount(views) {
  if (views >= 1000000) {
    return `${(views / 1000000).toFixed(1)}M`;
  } else if (views >= 1000) {
    return `${(views / 1000).toFixed(1)}K`;
  }
  return views.toString();
}

export default function YoutubePlaylistDownloader() {
  const [channelUrl, setChannelUrl] = useState('');
  const [videos, setVideos] = useState([]);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVideos, setSelectedVideos] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [validationError, setValidationError] = useState('');
  const [totalSelectedCount, setTotalSelectedCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  const isValidChannelUrl = (url) => {
    const channelUrlRegex = /^(https?:\/\/)?(www\.)?youtube\.com\/(channel\/|@|c\/)\S+$/i;
    return channelUrlRegex.test(url);
  };

  const handleFetchVideos = async (token = null) => {
    if (!channelUrl.trim()) {
      setValidationError('Please enter a channel URL');
      return;
    }

    if (!isValidChannelUrl(channelUrl)) {
      setValidationError('Invalid YouTube channel URL');
      return;
    }

    setValidationError('');
    setLoading(true);
    setError('');

    try {
      const query = `
        query FetchChannelVideos($channelUrl: String!, $pageToken: String, $searchQuery: String) {
          fetchChannelVideos(channelUrl: $channelUrl, pageToken: $pageToken, searchQuery: $searchQuery) {
            success
            message
            videos {
              id
              title
              duration
              views
              published
              thumbnail
            }
            nextPageToken
            totalCount
          }
        }
      `;

      const response = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: {
            channelUrl,
            pageToken: token,
            searchQuery
          }
        }),
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const result = data.data.fetchChannelVideos;
      if (result.success) {
        if (token) {
          // Append to existing videos for pagination
          setVideos([...videos, ...result.videos]);
        } else {
          // New search, replace videos and clear selections
          setVideos(result.videos);
          setSelectedVideos(new Set());
        }
        setNextPageToken(result.nextPageToken);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(`Error fetching videos: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    setIsSearching(true);
    // Reset to first page when searching
    setVideos([]);
    setSelectedVideos(new Set());
    setNextPageToken(null);
  };

  React.useEffect(() => {
    if (isSearching) {
      const timer = setTimeout(() => {
        if (channelUrl && isValidChannelUrl(channelUrl)) {
          handleFetchVideos();
        }
        setIsSearching(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [searchQuery]);

  const toggleVideo = (videoId) => {
    const newSelected = new Set(selectedVideos);
    if (newSelected.has(videoId)) {
      newSelected.delete(videoId);
    } else {
      newSelected.add(videoId);
    }
    setSelectedVideos(newSelected);
    setTotalSelectedCount(newSelected.size);
  };

  const selectAll = () => {
    const newSelected = new Set(videos.map(v => v.id));
    setSelectedVideos(newSelected);
    setTotalSelectedCount(newSelected.size);
  };

  const deselectAll = () => {
    setSelectedVideos(new Set());
    setTotalSelectedCount(0);
  };

  const handleDownload = async () => {
    if (selectedVideos.size === 0) {
      setError('Please select at least one video to download');
      return;
    }

    const videoUrls = Array.from(selectedVideos).map(id => {
      const video = videos.find(v => v.id === id);
      return `https://www.youtube.com/watch?v=${id}`;
    });

    setDownloading(true);
    setProgress(0);
    setProgressMessage('Starting downloads...');
    setError('');
    setSuccess('');

    try {
      const mutation = `
        mutation DownloadMultipleYoutube($urls: [String!]!) {
          downloadMultipleYoutube(urls: $urls) {
            success
            message
            downloadedCount
            failedCount
            downloadedVideos
            failedVideos
          }
        }
      `;

      const response = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: mutation,
          variables: { urls: videoUrls }
        }),
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const result = data.data.downloadMultipleYoutube;
      setProgress(100);
      setProgressMessage('Complete!');

      if (result.downloadedCount > 0) {
        setSuccess(`Downloaded ${result.downloadedCount}/${selectedVideos.size} videos to Downloads folder`);
      }

      if (result.failedCount > 0) {
        setError(`Failed to download ${result.failedCount} video(s)`);
      }

      setSelectedVideos(new Set());
      setTotalSelectedCount(0);
    } catch (err) {
      setError(`Error downloading videos: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="youtube-playlist-downloader">
      <div className="section">
        <h2>YouTube Playlist/Channel Downloader</h2>
        <p className="description">
          Enter a YouTube channel URL to browse and download videos. Examples:
          <br />
          https://www.youtube.com/@channelname<br />
          https://www.youtube.com/channel/UCxxxxxx
        </p>

        <div className="form-group">
          <label>Channel URL:</label>
          <div className="url-input-group">
            <input
              type="text"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              placeholder="https://www.youtube.com/@channelname"
              disabled={loading || downloading}
              className="url-input"
            />
            <button
              className="btn btn-secondary"
              onClick={() => handleFetchVideos()}
              disabled={loading || downloading || !channelUrl.trim()}
            >
              {loading ? 'Loading...' : 'Browse'}
            </button>
          </div>
          {validationError && <div className="alert alert-danger">{validationError}</div>}
        </div>
      </div>

      {videos.length > 0 && (
        <>
          <div className="section">
            <div className="search-and-controls">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search videos by title..."
                disabled={downloading}
                className="search-input"
              />
              <div className="selection-controls">
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={selectAll}
                  disabled={downloading}
                >
                  Select All
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={deselectAll}
                  disabled={downloading}
                >
                  Deselect All
                </button>
                <span className="selected-count">
                  Selected: {totalSelectedCount}/{videos.length}
                </span>
              </div>
            </div>
          </div>

          {error && <div className="alert alert-danger">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <div className="section">
            <h3>Videos</h3>
            <div className="videos-list">
              {videos.map((video) => (
                <div
                  key={video.id}
                  className={`video-item ${selectedVideos.has(video.id) ? 'selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedVideos.has(video.id)}
                    onChange={() => toggleVideo(video.id)}
                    disabled={downloading}
                    className="video-checkbox"
                  />
                  <div className="video-info">
                    <a
                      href={`https://www.youtube.com/watch?v=${video.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="video-title"
                    >
                      {video.title}
                    </a>
                    <span className="video-duration">{convertDurationToReadable(video.duration)}</span>
                  </div>
                </div>
              ))}
            </div>

            {nextPageToken && (
              <button
                className="btn btn-secondary btn-block"
                onClick={() => handleFetchVideos(nextPageToken)}
                disabled={loading || downloading}
              >
                {loading ? 'Loading...' : 'Load Next 50'}
              </button>
            )}
          </div>

          {downloading && (
            <div className="section">
              <ProgressBar progress={progress} message={progressMessage} />
            </div>
          )}

          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              onClick={handleDownload}
              disabled={downloading || selectedVideos.size === 0}
            >
              {downloading ? 'Downloading...' : `📥 Download ${totalSelectedCount} Videos`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
