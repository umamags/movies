import React, { useState } from 'react';
import FileSelector from './FileSelector';
import ProgressBar from './ProgressBar';
import MapModal from './MapModal';
import './PhotoLabeller.css';

const BACKEND_URL = 'http://localhost:4000';

export default function PhotoLabeller() {
  const [folderPath, setFolderPath] = useState('');
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [mapModal, setMapModal] = useState({
    isOpen: false,
    latitude: null,
    longitude: null,
    address: '',
  });
  const [labelEditing, setLabelEditing] = useState({
    photoIndex: null,
    text: '',
    isUpdating: false,
  });

  const handleFolderSelect = (folder) => {
    setFolderPath(folder.path || folder.name);
    setPhotos([]);
    setError('');
    setSuccess('');
  };

  const handleAddressClick = (latitude, longitude, address) => {
    setMapModal({
      isOpen: true,
      latitude,
      longitude,
      address,
    });
  };

  const handleCloseMap = () => {
    setMapModal({ ...mapModal, isOpen: false });
  };

  const handleEditLabel = (photoIndex, currentAddress) => {
    setLabelEditing({
      photoIndex,
      text: currentAddress || '',
      isUpdating: false,
    });
  };

  const handleUpdateLabel = async () => {
    if (labelEditing.photoIndex === null) return;

    const photo = photos[labelEditing.photoIndex];
    setLabelEditing({ ...labelEditing, isUpdating: true });
    setError('');

    try {
      const mutation = `
        mutation AddLabelToPhoto($filePath: String!, $label: String!) {
          addLabelToPhoto(filePath: $filePath, label: $label) {
            success
            message
          }
        }
      `;

      const response = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: mutation,
          variables: {
            filePath: photo.path,
            label: labelEditing.text,
          }
        }),
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const result = data.data.addLabelToPhoto;
      if (result.success) {
        // Update photo with label in UI
        const updatedPhotos = [...photos];
        updatedPhotos[labelEditing.photoIndex].label = labelEditing.text;
        setPhotos(updatedPhotos);
        setSuccess('Label added to photo');
        setLabelEditing({ photoIndex: null, text: '', isUpdating: false });
      } else {
        setError(`Failed: ${result.message}`);
      }
    } catch (err) {
      setError(`Error updating label: ${err.message}`);
    } finally {
      setLabelEditing({ ...labelEditing, isUpdating: false });
    }
  };

  const handleListPhotos = async () => {
    if (!folderPath.trim()) {
      setError('Please enter a folder path');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const query = `
        query ListImagesInFolder($folderPath: String!) {
          listImagesInFolder(folderPath: $folderPath) {
            success
            message
            photos {
              filename
              path
              latitude
              longitude
              address
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

      const result = data.data.listImagesInFolder;
      if (result.success) {
        setPhotos(result.photos);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(`Error listing photos: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGetAddress = async (photoIndex) => {
    const photo = photos[photoIndex];
    if (!photo.latitude || !photo.longitude) {
      setError('No geolocation data for this photo');
      return;
    }

    setFetching(true);
    setProgress(0);
    setProgressMessage(`Fetching address for ${photo.filename}...`);
    setError('');

    try {
      const mutation = `
        mutation GetGeoLocations($photos: [PhotoLocationInput!]!) {
          getGeoLocations(photos: $photos) {
            success
            message
            results {
              filename
              address
            }
          }
        }
      `;

      const response = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: mutation,
          variables: {
            photos: [{
              filename: photo.filename,
              latitude: photo.latitude,
              longitude: photo.longitude,
            }]
          }
        }),
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const result = data.data.getGeoLocations;
      if (result.success && result.results.length > 0) {
        const updatedPhotos = [...photos];
        updatedPhotos[photoIndex].address = result.results[0].address;
        setPhotos(updatedPhotos);
        setProgress(100);
        setProgressMessage('Address fetched!');
      } else {
        setError('Failed to fetch address');
      }
    } catch (err) {
      setError(`Error fetching address: ${err.message}`);
    } finally {
      setFetching(false);
    }
  };

  const handleGetAllAddresses = async () => {
    const photosWithLocation = photos.filter(p => p.latitude && p.longitude && !p.address);

    if (photosWithLocation.length === 0) {
      setError('No photos with geolocation data to fetch');
      return;
    }

    setFetching(true);
    setProgress(0);
    setProgressMessage(`Fetching addresses for ${photosWithLocation.length} photo(s)...`);
    setError('');
    setSuccess('');

    try {
      const mutation = `
        mutation GetGeoLocations($photos: [PhotoLocationInput!]!) {
          getGeoLocations(photos: $photos) {
            success
            message
            results {
              filename
              address
            }
          }
        }
      `;

      const response = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: mutation,
          variables: {
            photos: photosWithLocation.map(p => ({
              filename: p.filename,
              latitude: p.latitude,
              longitude: p.longitude,
            }))
          }
        }),
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const result = data.data.getGeoLocations;
      if (result.success) {
        const updatedPhotos = [...photos];
        result.results.forEach(res => {
          const idx = updatedPhotos.findIndex(p => p.filename === res.filename);
          if (idx !== -1) {
            updatedPhotos[idx].address = res.address;
          }
        });
        setPhotos(updatedPhotos);
        setProgress(100);
        setProgressMessage(`Fetched addresses for ${result.results.length} photo(s)!`);
        setSuccess(`✅ Fetched addresses for ${result.results.length} photo(s)`);
      } else {
        setError(`Failed: ${result.message}`);
      }
    } catch (err) {
      setError(`Error fetching addresses: ${err.message}`);
    } finally {
      setFetching(false);
    }
  };

  const photosWithLocation = photos.filter(p => p.latitude && p.longitude);

  return (
    <div className="photo-labeller">
      <div className="section">
        <h2>Photo Labeller</h2>
        <p className="description">
          View photos with their geolocation data and fetch addresses from LocationIQ service.
        </p>

        <FileSelector
          selectedFile={folderPath ? { name: folderPath, path: folderPath } : null}
          onFileSelect={handleFolderSelect}
          disabled={loading || fetching}
          title="Folder Path"
        />

        <div className="controls">
          <button
            className="btn btn-secondary"
            onClick={handleListPhotos}
            disabled={loading || fetching || !folderPath.trim()}
          >
            {loading ? 'Loading...' : '📁 List Photos'}
          </button>
        </div>
      </div>

      {photosWithLocation.length > 0 && (
        <>
          <div className="section">
            <h3>Photos with Geolocation ({photosWithLocation.length})</h3>

            {photosWithLocation.length > 1 && !fetching && (
              <button
                className="btn btn-primary btn-wide"
                onClick={handleGetAllAddresses}
                disabled={fetching}
              >
                📍 Get All Addresses ({photosWithLocation.filter(p => !p.address).length} remaining)
              </button>
            )}

            <div className="photos-grid">
              {photos.map((photo, idx) => {
                // Only show photos with geolocation data
                if (!photo.latitude || !photo.longitude) {
                  return null;
                }

                return (
                  <div key={idx} className="photo-card">
                    <div className="photo-thumbnail">
                      <img
                        src={`${BACKEND_URL}/image?path=${encodeURIComponent(photo.path)}`}
                        alt={photo.filename}
                        onError={(e) => {
                          e.target.alt = '❌ Image failed to load';
                          e.target.style.padding = '20px';
                          e.target.style.color = '#999';
                        }}
                      />
                    </div>
                    <div className="photo-info">
                      <div className="photo-filename">{photo.filename}</div>
                      <button
                        className="photo-coords-link"
                        onClick={() => handleAddressClick(photo.latitude, photo.longitude, photo.address)}
                        title="Click to view map"
                      >
                        📍 {photo.latitude.toFixed(4)}, {photo.longitude.toFixed(4)}
                      </button>
                      {photo.address && (
                        <div className="photo-address">
                          🏠 {photo.address}
                        </div>
                      )}
                      {labelEditing.photoIndex === idx ? (
                        <div className="label-editing">
                          <input
                            type="text"
                            className="label-input"
                            value={labelEditing.text}
                            onChange={(e) =>
                              setLabelEditing({ ...labelEditing, text: e.target.value })
                            }
                            placeholder="Add label..."
                          />
                          <div className="label-buttons">
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={handleUpdateLabel}
                              disabled={labelEditing.isUpdating || !labelEditing.text.trim()}
                            >
                              {labelEditing.isUpdating ? 'Updating...' : '✓ Update'}
                            </button>
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => setLabelEditing({ photoIndex: null, text: '', isUpdating: false })}
                              disabled={labelEditing.isUpdating}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleEditLabel(idx, photo.address)}
                          disabled={fetching}
                        >
                          {photo.label ? '✏️ Edit Label' : '+ Add Label'}
                        </button>
                      )}
                      {photo.label && labelEditing.photoIndex !== idx && (
                        <div className="photo-label">
                          {photo.label}
                        </div>
                      )}
                      {!photo.address && (
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleGetAddress(idx)}
                          disabled={fetching}
                        >
                          Get Address
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {fetching && (
            <div className="section">
              <ProgressBar progress={progress} message={progressMessage} />
            </div>
          )}
        </>
      )}

      {photos.length > 0 && photosWithLocation.length === 0 && (
        <div className="alert alert-info">
          No photos with valid geolocation data found (all have lat=0, lon=0, or no metadata)
        </div>
      )}

      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <MapModal
        isOpen={mapModal.isOpen}
        onClose={handleCloseMap}
        latitude={mapModal.latitude}
        longitude={mapModal.longitude}
        address={mapModal.address}
      />
    </div>
  );
}
