#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const folderPath = args[0];

if (!folderPath) {
  console.error('Usage: node inspect-metadata.js <folder-path>');
  console.error('Example: node inspect-metadata.js ~/Downloads/Takeout/Google\\ Photos/2026-mar-brazil');
  process.exit(1);
}

const expandedPath = folderPath.startsWith('~')
  ? folderPath.replace('~', process.env.HOME)
  : folderPath;

console.log(`📁 Inspecting folder: ${expandedPath}\n`);

if (!fs.existsSync(expandedPath)) {
  console.error(`❌ Folder not found: ${expandedPath}`);
  process.exit(1);
}

const files = fs.readdirSync(expandedPath);

// Find image files
const imageFormats = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'];
const imageFiles = files.filter(f => imageFormats.includes(path.extname(f).toLowerCase()));

console.log(`Found ${imageFiles.length} image file(s)\n`);

// Find metadata files
const metadataFiles = files.filter(f => f.endsWith('.json'));
console.log(`Found ${metadataFiles.length} JSON metadata file(s)\n`);

console.log('📄 Sample metadata files:');
metadataFiles.slice(0, 5).forEach(f => console.log(`   ${f}`));

console.log('\n\n🔍 Analyzing metadata structure...\n');

// Check first few images
for (const imageName of imageFiles.slice(0, 3)) {
  console.log(`\n📸 ${imageName}`);
  const imagePath = path.join(expandedPath, imageName);

  // Look for metadata files
  let metadataPath = `${imagePath}.json`;
  let foundPath = null;

  if (fs.existsSync(metadataPath)) {
    foundPath = metadataPath;
    console.log(`   ✅ Found metadata: ${path.basename(metadataPath)}`);
  } else {
    // Try alternative naming
    const baseName = imageName.substring(0, imageName.lastIndexOf('.'));
    const related = files.find(f =>
      f.startsWith(baseName) && f.endsWith('.json')
    );

    if (related) {
      foundPath = path.join(expandedPath, related);
      console.log(`   ✅ Found related metadata: ${related}`);
    } else {
      console.log(`   ❌ No metadata file found`);
    }
  }

  // Read and inspect metadata
  if (foundPath && fs.existsSync(foundPath)) {
    try {
      const metadataContent = fs.readFileSync(foundPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);

      // Check for location data in various formats
      console.log(`   Checking for location data...`);

      if (metadata.geoData) {
        console.log(`   ✅ geoData found:`);
        console.log(`      lat: ${metadata.geoData.latitude}`);
        console.log(`      lon: ${metadata.geoData.longitude}`);
      }

      if (metadata.geoDataExif) {
        console.log(`   ✅ geoDataExif found:`, metadata.geoDataExif);
      }

      if (metadata.photoTakenTime) {
        console.log(`   📅 photoTakenTime found:`, metadata.photoTakenTime);
      }

      // Show top-level keys
      const keys = Object.keys(metadata);
      console.log(`   Available keys: ${keys.join(', ')}`);

      // Look for anything containing 'geo', 'location', 'lat', 'lon'
      const locationKeys = keys.filter(k =>
        k.toLowerCase().includes('geo') ||
        k.toLowerCase().includes('location') ||
        k.toLowerCase().includes('lat') ||
        k.toLowerCase().includes('lon')
      );

      if (locationKeys.length > 0) {
        console.log(`   📍 Location-related keys found: ${locationKeys.join(', ')}`);
        locationKeys.forEach(key => {
          console.log(`      ${key}: ${JSON.stringify(metadata[key])}`);
        });
      }

      // Show full structure for first image
      if (imageFiles.indexOf(imageName) === 0) {
        console.log(`\n   📋 Full metadata structure:`);
        console.log(JSON.stringify(metadata, null, 2).split('\n').slice(0, 30).join('\n'));
        if (Object.keys(metadata).length > 20) {
          console.log(`      ... (${Object.keys(metadata).length} total keys)`);
        }
      }
    } catch (err) {
      console.log(`   ❌ Error reading metadata: ${err.message}`);
    }
  }
}

console.log(`\n\n✅ Inspection complete\n`);
