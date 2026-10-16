import React, { useState } from 'react';
import { convertDurationToReadable } from '../utils/youtubeFormat';
import './YoutubeSubscriptions.css';
import './YoutubePlaylistDownloader.css';

const BACKEND_URL = 'http://localhost:4000';
const CACHE_KEY = 'youtubeSubscriptionsCache';

// The cache lives in this browser's localStorage. Reads and writes can fail
// (private mode, blocked storage), in which case the tab just shows no cache.
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore: the table still works without a cache
  }
}

export default function YoutubeSubscriptions() {
  const [initialCache] = useState(() => loadCache());
  const [subscriptions, setSubscriptions] = useState(initialCache?.subscriptions || []);
  const [filteredSubscriptions, setFilteredSubscriptions] = useState(initialCache?.subscriptions || []);
  const [cachedAt, setCachedAt] = useState(initialCache?.fetchedAt || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  // Channel videos panel (opened by clicking a channel name)
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [channelVideos, setChannelVideos] = useState([]);
  const [channelNextPageToken, setChannelNextPageToken] = useState(null);
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelError, setChannelError] = useState('');
  // Per-video download state, keyed by video id: { status, message }
  const [videoStatuses, setVideoStatuses] = useState({});

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortRows = (rows) => {
    if (!sortKey) return rows;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // Blank values always sort last, whichever direction is chosen
      const aBlank = av === null || av === undefined || av === '';
      const bBlank = bv === null || bv === undefined || bv === '';
      if (aBlank || bBlank) return aBlank === bBlank ? 0 : aBlank ? 1 : -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
  };

  const sortIndicator = (key) => {
    if (sortKey !== key) return ' ↕';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const visibleSubscriptions = sortRows(filteredSubscriptions);

  const handleRefreshFromYoutube = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    setSearchQuery('');

    try {
      const query = `
        query GetYoutubeSubscriptions {
          getYoutubeSubscriptions {
            success
            message
            subscriptions {
              channel_title
              handle
              channel_id
              subscribed_at
              video_count
              last_published_at
            }
          }
        }
      `;

      const response = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const result = data.data.getYoutubeSubscriptions;
      if (result.success) {
        const fetchedAt = new Date().toISOString();
        saveCache({ fetchedAt, subscriptions: result.subscriptions });
        setCachedAt(fetchedAt);
        setSubscriptions(result.subscriptions);
        setFilteredSubscriptions(result.subscriptions);
        setSuccess(`✅ ${result.message}`);
      } else {
        // Keep whatever is already shown (including the cache) on failure
        setError(`Failed: ${result.message}`);
      }
    } catch (err) {
      setError(`Error fetching subscriptions: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    if (!searchQuery.trim()) {
      setFilteredSubscriptions(subscriptions);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = subscriptions.filter(sub =>
      sub.channel_title.toLowerCase().includes(query)
    );
    setFilteredSubscriptions(filtered);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const fetchChannelVideos = async (channel, token = null) => {
    setChannelLoading(true);
    setChannelError('');

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
              description
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
            channelUrl: `https://www.youtube.com/channel/${channel.channel_id}`,
            pageToken: token,
            searchQuery: '',
          },
        }),
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const result = data.data.fetchChannelVideos;
      if (result.success) {
        // Functional update so "Load Next 50" appends to the latest list
        setChannelVideos(prev => (token ? [...prev, ...result.videos] : result.videos));
        setChannelNextPageToken(result.nextPageToken);
      } else {
        setChannelError(result.message);
      }
    } catch (err) {
      setChannelError(`Error fetching videos: ${err.message}`);
    } finally {
      setChannelLoading(false);
    }
  };

  const openChannel = (sub) => {
    setSelectedChannel(sub);
    setChannelVideos([]);
    setChannelNextPageToken(null);
    setVideoStatuses({});
    fetchChannelVideos(sub);
  };

  const closeChannel = () => {
    setSelectedChannel(null);
    setChannelVideos([]);
    setChannelNextPageToken(null);
    setChannelError('');
    setVideoStatuses({});
  };

  // Same downloadYoutube mutation the YouTube Downloader tab uses
  const handleDownloadVideo = async (video) => {
    const url = `https://www.youtube.com/watch?v=${video.id}`;
    setVideoStatuses(prev => ({ ...prev, [video.id]: { status: 'downloading', message: 'Downloading...' } }));

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
        body: JSON.stringify({ query: mutation, variables: { url } }),
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const result = data.data.downloadYoutube;
      if (result.success) {
        setVideoStatuses(prev => ({
          ...prev,
          [video.id]: { status: 'complete', message: `✓ Downloaded: ${result.filename}` },
        }));
      } else {
        setVideoStatuses(prev => ({
          ...prev,
          [video.id]: { status: 'failed', message: `Failed: ${result.message}` },
        }));
      }
    } catch (err) {
      setVideoStatuses(prev => ({
        ...prev,
        [video.id]: { status: 'failed', message: `Error: ${err.message}` },
      }));
    }
  };

  const formatCount = (n) => (n === null || n === undefined ? '—' : n.toLocaleString());

  return (
    <div className="youtube-subscriptions">
      <div className="section">
        <h2>YouTube Subscriptions</h2>
        <p className="description">
          Your YouTube channel subscriptions, loaded from the local cache.
          Use Refresh from YouTube to fetch the latest list.
        </p>

        <div className="fetch-controls">
          <button
            className="btn btn-primary"
            onClick={handleRefreshFromYoutube}
            disabled={loading}
          >
            {loading
              ? 'Refreshing from YouTube (this can take a few minutes)...'
              : '🔄 Refresh from YouTube'}
          </button>
          {cachedAt && (
            <span className="cache-info">
              Last refreshed: {new Date(cachedAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {subscriptions.length === 0 && !loading && (
        <div className="alert alert-info">
          No cached subscriptions yet. Click Refresh from YouTube to load them.
        </div>
      )}

      {subscriptions.length > 0 && (
        <div className="section">
          <div className="search-controls">
            <input
              type="text"
              className="search-input"
              placeholder="Search by channel name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
            <button
              className="btn btn-secondary"
              onClick={handleSearch}
              disabled={loading}
            >
              🔍 Filter
            </button>
            <span className="result-count">
              {filteredSubscriptions.length} of {subscriptions.length} channels
            </span>
          </div>

          {selectedChannel && (
            <div className="channel-videos-panel">
              <div className="channel-videos-header">
                <h3>Videos from {selectedChannel.channel_title}</h3>
                <button className="btn btn-sm btn-secondary" onClick={closeChannel}>
                  ✖ Close
                </button>
              </div>

              {channelError && <div className="alert alert-danger">{channelError}</div>}

              {channelVideos.length > 0 && (
                <div className="subscriptions-table-container">
                  <table className="subscriptions-table videos-table">
                    <thead>
                      <tr>
                        <th>Video Name</th>
                        <th>Published Date</th>
                        <th>Description</th>
                        <th>Download</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channelVideos.map((video) => {
                        const status = videoStatuses[video.id];
                        const downloading = status?.status === 'downloading';
                        return (
                          <tr key={video.id}>
                            <td className="channel-title">
                              <a
                                href={`https://www.youtube.com/watch?v=${video.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="video-title"
                              >
                                {video.title}
                              </a>
                              <div className="video-duration">
                                {convertDurationToReadable(video.duration)}
                              </div>
                            </td>
                            <td className="last-published">{video.published.slice(0, 10)}</td>
                            <td className="video-description" title={video.description || ''}>
                              {video.description || '—'}
                            </td>
                            <td className="video-download">
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => handleDownloadVideo(video)}
                                disabled={downloading || status?.status === 'complete'}
                              >
                                {downloading ? 'Downloading...' : status?.status === 'complete' ? 'Downloaded' : '📥 Download'}
                              </button>
                              {status && status.status !== 'downloading' && (
                                <div className={`video-download-message ${status.status}`}>
                                  {status.message}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!channelLoading && !channelError && channelVideos.length === 0 && (
                <div className="alert alert-info">No videos found for this channel.</div>
              )}

              {channelNextPageToken && (
                <button
                  className="btn btn-secondary btn-block"
                  onClick={() => fetchChannelVideos(selectedChannel, channelNextPageToken)}
                  disabled={channelLoading}
                >
                  {channelLoading ? 'Loading...' : 'Load Next 50'}
                </button>
              )}

              {channelLoading && channelVideos.length === 0 && (
                <div className="alert alert-info">Loading videos...</div>
              )}
            </div>
          )}

          {filteredSubscriptions.length > 0 ? (
            <div className="subscriptions-table-container">
              <table className="subscriptions-table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => handleSort('channel_title')}>
                      Channel Name{sortIndicator('channel_title')}
                    </th>
                    <th className="sortable" onClick={() => handleSort('handle')}>
                      Handle{sortIndicator('handle')}
                    </th>
                    <th className="sortable" onClick={() => handleSort('channel_id')}>
                      Channel ID{sortIndicator('channel_id')}
                    </th>
                    <th className="sortable" onClick={() => handleSort('subscribed_at')}>
                      Subscription Date{sortIndicator('subscribed_at')}
                    </th>
                    <th className="sortable" onClick={() => handleSort('video_count')}>
                      Count of Videos{sortIndicator('video_count')}
                    </th>
                    <th className="sortable" onClick={() => handleSort('last_published_at')}>
                      Last Published Date{sortIndicator('last_published_at')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSubscriptions.map((sub, idx) => (
                    <tr key={sub.channel_id || idx}>
                      <td className="channel-title">
                        <button
                          type="button"
                          className="channel-title-link"
                          onClick={() => openChannel(sub)}
                          title={`Show all videos from ${sub.channel_title}`}
                        >
                          {sub.channel_title}
                        </button>
                      </td>
                      <td className="handle">
                        <a
                          href={`https://www.youtube.com/${sub.handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Visit ${sub.channel_title}`}
                        >
                          {sub.handle}
                        </a>
                      </td>
                      <td className="channel-id">{sub.channel_id}</td>
                      <td className="subscribed-at">{sub.subscribed_at || '—'}</td>
                      <td className="video-count">{formatCount(sub.video_count)}</td>
                      <td className="last-published">{sub.last_published_at || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="alert alert-info">
              No channels match your search.
            </div>
          )}
        </div>
      )}

      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
    </div>
  );
}
