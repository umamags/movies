import React, { useState } from 'react';
import './YoutubeSubscriptions.css';

const BACKEND_URL = 'http://localhost:4000';

export default function YoutubeSubscriptions() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [filteredSubscriptions, setFilteredSubscriptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const handleFetchSubscriptions = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    setSubscriptions([]);
    setFilteredSubscriptions([]);
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
        setSubscriptions(result.subscriptions);
        setFilteredSubscriptions(result.subscriptions);
        setSuccess(`✅ ${result.message}`);
      } else {
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

  return (
    <div className="youtube-subscriptions">
      <div className="section">
        <h2>YouTube Subscriptions</h2>
        <p className="description">
          Fetch and view all your YouTube channel subscriptions.
        </p>

        <div className="fetch-controls">
          <button
            className="btn btn-primary"
            onClick={handleFetchSubscriptions}
            disabled={loading}
          >
            {loading ? 'Fetching subscriptions...' : '📺 Fetch Subscriptions'}
          </button>
        </div>
      </div>

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

          {filteredSubscriptions.length > 0 ? (
            <div className="subscriptions-table-container">
              <table className="subscriptions-table">
                <thead>
                  <tr>
                    <th>Channel Name</th>
                    <th>Handle</th>
                    <th>Channel ID</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubscriptions.map((sub, idx) => (
                    <tr key={idx}>
                      <td className="channel-title">{sub.channel_title}</td>
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
