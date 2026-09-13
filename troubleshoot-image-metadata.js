#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const folderPath = args[0];

if (!folderPath) {
  console.error('Usage: node troubleshoot-image-metadata.js <folder-path>');
  console.error('Example: node troubleshoot-image-metadata.js ~/Pictures');
  process.exit(1);
}

const expandedPath = folderPath.startsWith('~')
  ? folderPath.replace('~', process.env.HOME)
  : folderPath;

console.log(`📁 Scanning folder: ${expandedPath}\n`);

if (!fs.existsSync(expandedPath)) {
  console.error(`❌ Folder not found: ${expandedPath}`);
  process.exit(1);
}

// Check if exiftool is installed first
try {
  execSync('exiftool -ver', { encoding: 'utf-8', stdio: 'pipe' });
} catch (err) {
  console.error(`❌ exiftool is not installed!`);
  console.error(`   Install with: brew install exiftool`);
  process.exit(1);
}

const files = fs.readdirSync(expandedPath);
const imageFormats = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'];
const imageFiles = files.filter(f => imageFormats.includes(path.extname(f).toLowerCase()));

if (imageFiles.length === 0) {
  console.error(`❌ No image files found in ${expandedPath}`);
  process.exit(1);
}

console.log(`Found ${imageFiles.length} image file(s)\n`);

for (const filename of imageFiles.slice(0, 5)) { // Test first 5 files
  const filePath = path.join(expandedPath, filename);
  console.log(`\n📸 ${filename}`);
  console.log(`   Path: ${filePath}`);

  // Check file size
  try {
    const fileStats = fs.statSync(filePath);
    const sizeKB = (fileStats.size / 1024).toFixed(2);
    console.log(`   ✅ File Size: ${fileStats.size} bytes (${sizeKB} KB)`);
  } catch (err) {
    console.log(`   ❌ File Size Error: ${err.message}`);
  }

  // Check exiftool
  try {
    const exifOutput = execSync(`exiftool "${filePath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Look for various width/height field names
    let width = null;
    let height = null;

    const widthMatch = exifOutput.match(/Image Width\s*:\s*(\d+)/);
    const heightMatch = exifOutput.match(/Image Height\s*:\s*(\d+)/);

    // Alternative field names
    const widthMatch2 = exifOutput.match(/ImageWidth\s*:\s*(\d+)/);
    const heightMatch2 = exifOutput.match(/ImageHeight\s*:\s*(\d+)/);

    // For some formats
    const widthMatch3 = exifOutput.match(/Exif Image Width\s*:\s*(\d+)/);
    const heightMatch3 = exifOutput.match(/Exif Image Height\s*:\s*(\d+)/);

    width = widthMatch?.[1] || widthMatch2?.[1] || widthMatch3?.[1];
    height = heightMatch?.[1] || heightMatch2?.[1] || heightMatch3?.[1];

    if (width && height) {
      console.log(`   ✅ Dimensions: ${width}×${height}`);
    } else {
      console.log(`   ⚠️  No standard dimensions found`);

      // Show what we got
      const lines = exifOutput.split('\n').slice(0, 15);
      console.log(`   First metadata fields:`);
      lines.forEach(line => {
        if (line.trim()) console.log(`      ${line}`);
      });
    }
  } catch (err) {
    console.log(`   ❌ Exiftool Error: ${err.message}`);
  }
}

// System info
console.log(`\n\n🔧 System Information:`);
console.log(`   Node Version: ${process.version}`);

try {
  const version = execSync('exiftool -ver', { encoding: 'utf-8', stdio: 'pipe' }).trim();
  console.log(`   ✅ exiftool installed: ${version}`);
} catch (err) {
  console.log(`   ❌ exiftool not found`);
}

console.log(`\n✅ Troubleshooting complete`);
