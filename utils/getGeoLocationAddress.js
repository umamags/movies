#!/usr/bin/env node

const https = require('https');

const LOCATIONIQ_API_BASE = 'https://us1.locationiq.com/v1/reverse.json';

async function getGeoLocationAddress(latitude, longitude) {
  const accessToken = process.env.LOCATIONIQ_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('LOCATIONIQ_ACCESS_TOKEN environment variable is not set');
  }

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new Error('Latitude and longitude must be numbers');
  }

  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      key: accessToken,
      lat: latitude,
      lon: longitude,
      format: 'json'
    });

    const url = `${LOCATIONIQ_API_BASE}?${params.toString()}`;

    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);

          if (res.statusCode !== 200) {
            reject(new Error(`LocationIQ API error: ${response.error || response.message || 'Unknown error'}`));
            return;
          }

          if (!response.address) {
            reject(new Error('No address found in LocationIQ response'));
            return;
          }

          resolve(response.address.name || '');
        } catch (err) {
          reject(new Error(`Failed to parse LocationIQ response: ${err.message}`));
        }
      });
    }).on('error', (err) => {
      reject(new Error(`LocationIQ API request failed: ${err.message}`));
    });
  });
}

// Command line interface
function validateCoordinate(value, name) {
  const num = parseFloat(value);

  if (isNaN(num)) {
    throw new Error(`${name} must be a valid number`);
  }

  if (!/^-?\d+(\.\d{1,4})?$/.test(value)) {
    throw new Error(`${name} must have up to 4 decimal points`);
  }

  if (name === 'Latitude' && (num < -90 || num > 90)) {
    throw new Error('Latitude must be between -90 and 90');
  }

  if (name === 'Longitude' && (num < -180 || num > 180)) {
    throw new Error('Longitude must be between -180 and 180');
  }

  return num;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node getGeoLocationAddress.js <latitude> <longitude>');
    console.error('');
    console.error('Examples:');
    console.error('  node getGeoLocationAddress.js 20.6834 -88.5685');
    console.error('  node getGeoLocationAddress.js 13.1234 76.4567');
    console.error('');
    console.error('Note: Set LOCATIONIQ_ACCESS_TOKEN environment variable');
    process.exit(1);
  }

  try {
    const latitude = validateCoordinate(args[0], 'Latitude');
    const longitude = validateCoordinate(args[1], 'Longitude');

    const address = await getGeoLocationAddress(latitude, longitude);
    console.log(address);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { getGeoLocationAddress };

// Run CLI if invoked directly
if (require.main === module) {
  main();
}
