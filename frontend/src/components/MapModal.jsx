import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapModal.css';

// Fix default marker icon issue in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export default function MapModal({ isOpen, onClose, latitude, longitude, address }) {
  const mapContainer = useRef(null);
  const mapInstance = useRef(null);

  useEffect(() => {
    if (!isOpen || !mapContainer.current) return;

    // Initialize map only once
    if (!mapInstance.current) {
      mapInstance.current = L.map(mapContainer.current).setView(
        [latitude, longitude],
        13
      );

      // Add OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(mapInstance.current);
    }

    // Update map view and marker
    mapInstance.current.setView([latitude, longitude], 13);

    // Remove existing markers
    mapInstance.current.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        mapInstance.current.removeLayer(layer);
      }
    });

    // Add marker
    L.marker([latitude, longitude])
      .bindPopup(address || 'Location')
      .addTo(mapInstance.current)
      .openPopup();

    // Trigger resize to properly render the map
    setTimeout(() => {
      if (mapInstance.current) {
        mapInstance.current.invalidateSize();
      }
    }, 100);
  }, [isOpen, latitude, longitude, address]);

  if (!isOpen) return null;

  return (
    <div className="map-modal-overlay" onClick={onClose}>
      <div className="map-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="map-modal-header">
          <h2>📍 Location Map</h2>
          <button className="map-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="map-modal-address">
          {address && <p>{address}</p>}
          {latitude && longitude && (
            <p className="map-coords">{latitude.toFixed(4)}, {longitude.toFixed(4)}</p>
          )}
        </div>
        <div ref={mapContainer} className="map-container" />
      </div>
    </div>
  );
}
