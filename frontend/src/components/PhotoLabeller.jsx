import React, { useState, useEffect } from 'react';
import FileSelector from './FileSelector';
import ProgressBar from './ProgressBar';
import MapModal from './MapModal';
import './PhotoLabeller.css';

const BACKEND_URL = 'http://localhost:4000';
const STORAGE_KEY = 'photoLabeller_folderPath';

export default function PhotoLabeller() {
  const [folderPath, setFolderPath] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || '';
  });
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, folderPath);
  }, [folderPath]);

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

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 10) / 10 + ' ' + sizes[i];
  };

  const openImageViewer = (photo) => {
    const viewerUrl = `/image-viewer.html?path=${encodeURIComponent(photo.path)}&filename=${encodeURIComponent(photo.filename)}&width=${photo.width || 'Unknown'}&height=${photo.height || 'Unknown'}&size=${encodeURIComponent(formatFileSize(photo.size))}`;
    window.open(viewerUrl, '_blank');
  };

  const handleDeletePhoto = async (photoIndex) => {
    const photo = photos[photoIndex];
    const confirmed = window.confirm(`Delete "${photo.filename}"? This cannot be undone.`);

    if (!confirmed) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const mutation = `
        mutation DeletePhoto($filePath: String!) {
          deletePhoto(filePath: $filePath) {
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
          variables: { filePath: photo.path }
        }),
      });

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const result = data.data.deletePhoto;
      if (result.success) {
        // Remove photo from grid
        const updatedPhotos = photos.filter((_, idx) => idx !== photoIndex);
        setPhotos(updatedPhotos);
        setSuccess(`✅ ${result.message}`);
      } else {
        setError(`Failed to delete: ${result.message}`);
      }
    } catch (err) {
      setError(`Error deleting photo: ${err.message}`);
    } finally {
      setLoading(false);
    }
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
    setSuccess('');

    try {
      // Step 1: Add label to photo metadata
      const labelMutation = `
        mutation AddLabelToPhoto($filePath: String!, $label: String!) {
          addLabelToPhoto(filePath: $filePath, label: $label) {
            success
            message
          }
        }
      `;

      const labelResponse = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: labelMutation,
          variables: {
            filePath: photo.path,
            label: labelEditing.text,
          }
        }),
      });

      const labelData = await labelResponse.json();
      if (labelData.errors) {
        throw new Error(labelData.errors[0].message);
      }

      const labelResult = labelData.data.addLabelToPhoto;
      if (!labelResult.success) {
        throw new Error(labelResult.message);
      }

      // Step 2: Create captioned version of the photo
      const captionMutation = `
        mutation AddCaptionToPhoto($filePath: String!, $caption: String!) {
          addCaptionToPhoto(filePath: $filePath, caption: $caption) {
            success
            message
            captionedFilePath
          }
        }
      `;

      const captionResponse = await fetch(`${BACKEND_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: captionMutation,
          variables: {
            filePath: photo.path,
            caption: labelEditing.text,
          }
        }),
      });

      const captionData = await captionResponse.json();
      if (captionData.errors) {
        throw new Error(captionData.errors[0].message);
      }

      const captionResult = captionData.data.addCaptionToPhoto;

      // Update photo with label in UI
      const updatedPhotos = [...photos];
      updatedPhotos[labelEditing.photoIndex].label = labelEditing.text;
      setPhotos(updatedPhotos);

      if (captionResult.success) {
        setSuccess('✅ Label updated and captioned image created');
      } else {
        setSuccess('✅ Label updated (caption creation failed, but label was saved)');
        setError(`Caption warning: ${captionResult.message}`);
      }

      setLabelEditing({ photoIndex: null, text: '', isUpdating: false });
    } catch (err) {
      setError(`Error updating label: ${err.message}`);
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
              width
              height
              size
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
    const photosWithValidLocation = photos.filter(p => p.latitude && p.longitude && !p.address);

    if (photosWithValidLocation.length === 0) {
      setError('No photos with geolocation data to fetch');
      return;
    }

    setFetching(true);
    setProgress(0);
    setProgressMessage(`Fetching addresses for ${photosWithValidLocation.length} photo(s)...`);
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
            photos: photosWithValidLocation.map(p => ({
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

  const photosWithValidLocation = photos.filter(p => p.hasValidLocation);

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

      {photos.length > 0 && (
        <>
          <div className="section">
            <h3>Photos ({photos.length})</h3>

            {photosWithValidLocation.length > 1 && !fetching && (
              <button
                className="btn btn-primary btn-wide"
                onClick={handleGetAllAddresses}
                disabled={fetching}
              >
                📍 Get All Addresses ({photosWithValidLocation.filter(p => !p.address).length} remaining)
              </button>
            )}

            <div className="photos-grid">
              {photos.map((photo, idx) => {
                return (
                  <div key={idx} className="photo-card">
                    <div className="photo-thumbnail">
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          openImageViewer(photo);
                        }}
                        className="photo-thumbnail-link"
                        title="Click to open in new tab"
                      >
                        <img
                          src={`${BACKEND_URL}/image?path=${encodeURIComponent(photo.path)}`}
                          alt={photo.filename}
                          onError={(e) => {
                            e.target.alt = '❌ Image failed to load';
                            e.target.style.padding = '20px';
                            e.target.style.color = '#999';
                          }}
                        />
                      </a>
                    </div>
                    <div className="photo-metadata">
                      {photo.width && photo.height && (
                        <div className="photo-resolution">
                          {photo.width}×{photo.height}
                        </div>
                      )}
                      {photo.size && (
                        <div className="photo-size">
                          {formatFileSize(photo.size)}
                        </div>
                      )}
                    </div>
                    <div className="photo-info">
                      <div className="photo-filename">{photo.filename}</div>
                      {photo.hasValidLocation ? (
                        <button
                          className="photo-coords-link"
                          onClick={() => handleAddressClick(photo.latitude, photo.longitude, photo.address)}
                          title="Click to view map"
                        >
                          📍 {photo.latitude.toFixed(4)}, {photo.longitude.toFixed(4)}
                        </button>
                      ) : (
                        <div className="photo-coords-disabled">
                          📍 No location data
                        </div>
                      )}
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
                              title="Updates label and creates captioned image"
                            >
                              {labelEditing.isUpdating ? 'Creating caption...' : '✓ Update & Caption'}
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
                      {!photo.address && photo.hasValidLocation && (
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleGetAddress(idx)}
                          disabled={fetching}
                        >
                          Get Address
                        </button>
                      )}
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDeletePhoto(idx)}
                        disabled={loading || fetching || labelEditing.photoIndex === idx}
                        title="Delete this photo permanently"
                      >
                        🗑️ Delete
                      </button>
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

      {photos.length > 0 && photosWithValidLocation.length === 0 && (
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
