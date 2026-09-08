#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let ExifParser;
try {
  ExifParser = require('exif-parser');
} catch (err) {
  console.error('⚠️  exif-parser not installed. Run: npm install');
  process.exit(1);
}

const config = require('./config.json');

// Check for command line arguments
const args = process.argv.slice(2);
const updateMode = args.includes('--update');
const removeMode = args.includes('--remove');
const helpMode = args.includes('--help') || args.includes('-h');
const allMode = args.includes('--all');
const selectedTitle = args.find(arg => !arg.startsWith('--'));

// Format timestamp as YYYYMMDD_HHMMSS
function formatTimestamp(dateMs) {
  const date = new Date(dateMs);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

// Extract creation time from Google Takeout metadata JSON
function getGoogleTakeoutCreationTime(filePath) {
  const metadataPath = `${filePath}.supplemental-metadata.json`;

  if (!fs.existsSync(metadataPath)) {
    return null;
  }

  try {
    const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    // Extract photoTakenTime.timestamp
    if (metadata.photoTakenTime && metadata.photoTakenTime.timestamp) {
      const timestamp = metadata.photoTakenTime.timestamp;

      // Google Takeout returns timestamp in seconds, convert to milliseconds
      const dateMs = typeof timestamp === 'string' ? parseInt(timestamp) * 1000 : timestamp * 1000;

      if (!isNaN(dateMs) && dateMs > 0) {
        return dateMs;
      }
    }
  } catch (err) {
    // Metadata file exists but couldn't be parsed, will fall back to existing logic
  }

  return null;
}

// Extract creation time from image EXIF data
function getImageCreationTime(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  // HEIC files need special handling on macOS - use exiftool (most reliable)
  if (ext === '.heic') {
    try {
      const output = execSync(`exiftool -DateTimeOriginal -CreateDate -ModifyDate "${filePath}" 2>/dev/null`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();

      // exiftool output format: "Date/Time Original              : 2026:08:13 06:20:23"
      // Try DateTimeOriginal first
      let match = output.match(/Date\/Time Original\s+:\s+(.+)/);
      if (match && match[1]) {
        const exifDate = match[1].trim();
        // Convert "2026:08:13 06:20:23" to ISO format "2026-08-13T06:20:23"
        const isoDate = exifDate.replace(/^(\d{4}):(\d{2}):(\d{2}) /, '$1-$2-$3T');
        const date = new Date(isoDate);
        if (!isNaN(date.getTime())) {
          return date.getTime();
        }
      }

      // Fallback to Create Date
      match = output.match(/Create Date\s+:\s+(.+)/);
      if (match && match[1]) {
        const exifDate = match[1].trim();
        const isoDate = exifDate.replace(/^(\d{4}):(\d{2}):(\d{2}) /, '$1-$2-$3T');
        const date = new Date(isoDate);
        if (!isNaN(date.getTime())) {
          return date.getTime();
        }
      }

      // Fallback to Modify Date
      match = output.match(/Modify Date\s+:\s+(.+)/);
      if (match && match[1]) {
        const exifDate = match[1].trim();
        const isoDate = exifDate.replace(/^(\d{4}):(\d{2}):(\d{2}) /, '$1-$2-$3T');
        const date = new Date(isoDate);
        if (!isNaN(date.getTime())) {
          return date.getTime();
        }
      }
    } catch (err) {
      // exiftool failed, fall through to file system time
    }
  } else {
    // For JPG, PNG, and other formats, use EXIF parser
    try {
      const buffer = fs.readFileSync(filePath);
      const parser = ExifParser.create(buffer);
      const result = parser.parse();

      // Try DateTimeOriginal first (photo capture time on iPhone/Android)
      if (result.tags && result.tags.DateTimeOriginal !== undefined) {
        const exifDate = result.tags.DateTimeOriginal;
        const timestamp = parseExifTimestamp(exifDate);
        if (timestamp !== null) {
          return timestamp;
        }
      }

      // Fallback to CreateDate
      if (result.tags && result.tags.CreateDate !== undefined) {
        const exifDate = result.tags.CreateDate;
        const timestamp = parseExifTimestamp(exifDate);
        if (timestamp !== null) {
          return timestamp;
        }
      }

      // Fallback to DateTime
      if (result.tags && result.tags.DateTime !== undefined) {
        const exifDate = result.tags.DateTime;
        const timestamp = parseExifTimestamp(exifDate);
        if (timestamp !== null) {
          return timestamp;
        }
      }

      // Fallback to ModifyDate
      if (result.tags && result.tags.ModifyDate !== undefined) {
        const exifDate = result.tags.ModifyDate;
        const timestamp = parseExifTimestamp(exifDate);
        if (timestamp !== null) {
          return timestamp;
        }
      }
    } catch (err) {
      // If EXIF parsing fails, continue to fallback
    }
  }

  // Fallback to file creation time (used if metadata extraction failed)
  const stats = fs.statSync(filePath);
  return stats.birthtime.getTime();
}

// Parse EXIF timestamp (can be Unix timestamp number or EXIF DateTime string)
function parseExifTimestamp(exifValue) {
  if (typeof exifValue === 'number') {
    // Unix timestamp (in seconds) - convert to milliseconds
    return exifValue * 1000;
  }

  if (typeof exifValue === 'string') {
    // EXIF DateTime format: "YYYY:MM:DD HH:MM:SS"
    const date = new Date(exifValue.replace(/:/g, '-').replace(' ', 'T'));
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  return null;
}

// Extract creation time from video metadata using ffprobe
function getVideoCreationTime(filePath) {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format_tags=creation_time -of json "${filePath}" 2>/dev/null`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (output) {
      try {
        const json = JSON.parse(output);
        const creationTime = json?.format?.tags?.creation_time;
        if (creationTime) {
          // FFprobe returns ISO 8601 format: "YYYY-MM-DDTHH:MM:SS.000000Z" or similar
          const date = new Date(creationTime);
          if (!isNaN(date.getTime())) {
            return date.getTime();
          }
        }
      } catch (e) {
        // JSON parse failed, continue to fallback
      }
    }
  } catch (err) {
    // If ffprobe fails, continue to fallback
  }

  // Fallback to file creation time
  const stats = fs.statSync(filePath);
  return stats.birthtime.getTime();
}

// Get creation time based on file type
// First tries Google Takeout metadata, then falls back to existing metadata extraction
function getCreationTime(filePath, isImage) {
  // Check for Google Takeout metadata first
  const googleTakeoutTime = getGoogleTakeoutCreationTime(filePath);
  if (googleTakeoutTime !== null) {
    return googleTakeoutTime;
  }

  // Fall back to existing metadata extraction logic
  if (isImage) {
    return getImageCreationTime(filePath);
  } else {
    return getVideoCreationTime(filePath);
  }
}

// Check if filename already has timestamp prefix (pattern: YYYYMMDD_HHMMSS)
function hasTimestampPrefix(filename) {
  const pattern = /^\d{8}_\d{6}_/;
  return pattern.test(filename);
}

// Process a single folder
function processFolder(folderConfig) {
  const folderPath = folderConfig.folder;
  const title = folderConfig.title;

  // Validate folder exists
  if (!fs.existsSync(folderPath)) {
    console.error(`❌ Error: Folder does not exist: ${folderPath}`);
    return { success: false, processedCount: 0, skippedCount: 0 };
  }

  try {
    const files = fs.readdirSync(folderPath);
    const supportedFormats = config.supportedFormats.map(f => f.toLowerCase());
    const imageFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'];

    let processedCount = 0;
    let skippedCount = 0;
    const results = [];

    files.forEach(filename => {
      const fileExt = path.extname(filename).substring(1).toLowerCase();

      // Skip supplemental-metadata.json files
      if (filename.endsWith('.supplemental-metadata.json')) {
        return;
      }

      // Check if file is a supported format
      if (!supportedFormats.includes(fileExt)) {
        return;
      }

      const filePath = path.join(folderPath, filename);
      const isImage = imageFormats.includes(fileExt);

      try {
        // In remove mode, strip existing timestamp prefix
        if (removeMode) {
          const cleanFilename = filename.replace(/^\d{8}_\d{6}_/, '');
          if (cleanFilename !== filename) {
            // File has timestamp prefix, remove it
            const newFilePath = path.join(folderPath, cleanFilename);
            try {
              fs.renameSync(filePath, newFilePath);

              // Also rename associated Google Takeout metadata JSON file if it exists
              const metadataFilename = `${filename}.supplemental-metadata.json`;
              const metadataPath = path.join(folderPath, metadataFilename);
              if (fs.existsSync(metadataPath)) {
                const cleanMetadataFilename = `${cleanFilename}.supplemental-metadata.json`;
                const newMetadataPath = path.join(folderPath, cleanMetadataFilename);
                try {
                  fs.renameSync(metadataPath, newMetadataPath);
                } catch (err) {
                  // If metadata file rename fails, don't fail the entire operation
                  console.warn(`⚠️  Warning: Could not rename metadata file ${metadataFilename}: ${err.message}`);
                }
              }

              results.push({
                status: '✂️  REMOVED',
                filename: filename,
                newFilename: cleanFilename,
              });
              processedCount++;
            } catch (err) {
              results.push({
                status: '❌ ERROR',
                filename: filename,
                error: err.message,
              });
            }
          } else {
            // File doesn't have timestamp prefix
            results.push({
              status: '⏭️  SKIPPED',
              filename: filename,
              reason: 'no timestamp prefix found',
            });
            skippedCount++;
          }
          return;
        }

        // Get creation time from metadata (Google Takeout or fallback)
        const timestamp = formatTimestamp(getCreationTime(filePath, isImage));

        // Check if file already has timestamp prefix
        const hasPrefix = hasTimestampPrefix(filename);

        // In update mode, rename the file (even if it already has a timestamp)
        if (updateMode) {
          let fileNameWithoutExt = path.parse(filename).name;

          // If file already has timestamp prefix and we're updating, remove it first
          if (hasPrefix) {
            fileNameWithoutExt = fileNameWithoutExt.replace(/^\d{8}_\d{6}_/, '');
          }

          const newFilename = `${timestamp}_${fileNameWithoutExt}.${fileExt}`;
          const newFilePath = path.join(folderPath, newFilename);

          // Only rename if the new filename is different
          if (newFilename !== filename) {
            try {
              fs.renameSync(filePath, newFilePath);

              // Also rename associated Google Takeout metadata JSON file if it exists
              const metadataFilename = `${filename}.supplemental-metadata.json`;
              const metadataPath = path.join(folderPath, metadataFilename);
              if (fs.existsSync(metadataPath)) {
                const newMetadataFilename = `${newFilename}.supplemental-metadata.json`;
                const newMetadataPath = path.join(folderPath, newMetadataFilename);
                try {
                  fs.renameSync(metadataPath, newMetadataPath);
                } catch (err) {
                  // If metadata file rename fails, don't fail the entire operation
                  console.warn(`⚠️  Warning: Could not rename metadata file ${metadataFilename}: ${err.message}`);
                }
              }

              const status = hasPrefix ? '🔄 UPDATED' : '✅ ADDED';
              results.push({
                status: status,
                filename: filename,
                newFilename: newFilename,
                timestamp: timestamp,
              });
              processedCount++;
            } catch (err) {
              results.push({
                status: '❌ ERROR',
                filename: filename,
                error: err.message,
              });
            }
          } else {
            results.push({
              status: '⏭️  SKIPPED',
              filename: filename,
              reason: 'filename unchanged',
            });
            skippedCount++;
          }
        } else {
          // Just list the timestamp
          results.push({
            status: '📋 LIST',
            filename: filename,
            timestamp: timestamp,
            type: isImage ? '🖼️  Image' : '🎥 Video',
            hasPrefix: hasPrefix ? '(already timestamped)' : '',
          });
          processedCount++;
        }
      } catch (err) {
        results.push({
          status: '❌ ERROR',
          filename: filename,
          error: `Failed to read metadata: ${err.message}`,
        });
      }
    });

    // Display results
    console.log('\n' + '='.repeat(80));
    console.log(`📁 Folder: ${title} (${folderPath})`);
    console.log(`Mode: ${updateMode ? 'UPDATE' : removeMode ? 'REMOVE' : 'LIST'}`);
    console.log('Metadata Source: Google Takeout (with fallback to EXIF/FFprobe)');
    console.log('='.repeat(80) + '\n');

    if (results.length === 0) {
      console.log('No media files found in this folder.\n');
      return { success: true, processedCount: 0, skippedCount: 0 };
    }

    // Display results in a table format
    results.forEach(result => {
      if (result.status === '⏭️  SKIPPED') {
        console.log(`${result.status} ${result.filename}`);
        console.log(`         └─ ${result.reason || 'Skipped'}\n`);
      } else if (result.status === '❌ ERROR') {
        console.log(`${result.status} ${result.filename}`);
        console.log(`         └─ Error: ${result.error}\n`);
      } else if (result.status === '✂️  REMOVED') {
        console.log(`${result.status} ${result.filename}`);
        console.log(`         └─ Renamed to: ${result.newFilename}\n`);
      } else if (result.status === '✅ ADDED' || result.status === '🔄 UPDATED') {
        console.log(`${result.status} ${result.filename}`);
        console.log(`         └─ Renamed to: ${result.newFilename}\n`);
      } else {
        console.log(`${result.status} ${result.filename}`);
        console.log(`         └─ Created: ${result.timestamp} (${result.type}) ${result.hasPrefix || ''}\n`);
      }
    });

    // Summary
    console.log('='.repeat(80));
    console.log(`Summary: ${processedCount} processed, ${skippedCount} skipped, ${results.length} total`);
    console.log('='.repeat(80) + '\n');

    return { success: true, processedCount, skippedCount };

  } catch (err) {
    console.error(`❌ Error reading folder: ${err.message}`);
    return { success: false, processedCount: 0, skippedCount: 0 };
  }
}

// Display usage info
function showUsage() {
  console.log('\n📋 Timestamp Utility (Using Google Takeout Metadata)');
  console.log('====================================================\n');
  console.log('Usage: node utils/timestamps_google_takeout.js [<folder-title>] [--update|--remove] [--all]\n');
  console.log('Options:');
  console.log('  (no arguments)     - Process all folders with run=yes');
  console.log('  <folder-title>     - Process specific folder (e.g., "Cancun")');
  console.log('  --update           - Prepend/update timestamps on filenames');
  console.log('                       • Adds timestamp if missing');
  console.log('                       • Updates timestamp if already present');
  console.log('  --remove           - Strip timestamp prefix from filenames');
  console.log('                       • Removes YYYYMMDD_HHMMSS_ prefix if found');
  console.log('  --all              - Process all folders, ignore run setting\n');
  console.log('Available folders:');
  config.folders.forEach((folder, index) => {
    const status = folder.run === 'yes' ? '✅' : '⏸️';
    console.log(`  ${index + 1}. ${status} ${folder.title}`);
    console.log(`     Path: ${folder.folder}`);
  });
  console.log('\nMetadata extraction (in priority order):');
  console.log('  1. Google Takeout: {filename}.supplemental-metadata.json → photoTakenTime.timestamp');
  console.log('  2. JPG/PNG: EXIF DateTimeOriginal (photo capture time)');
  console.log('  3. HEIC: exiftool DateTimeOriginal, then Spotlight metadata');
  console.log('  4. Videos: ffprobe creation_time from video metadata');
  console.log('  5. Fallback: File system creation time\n');
  console.log('Examples:');
  console.log('  node utils/timestamps_google_takeout.js                    # List timestamps, all enabled folders');
  console.log('  node utils/timestamps_google_takeout.js Cancun             # List timestamps for "Cancun"');
  console.log('  node utils/timestamps_google_takeout.js Cancun --update    # Add/update timestamps on "Cancun" files');
  console.log('  node utils/timestamps_google_takeout.js Cancun --remove    # Strip timestamps from "Cancun" files');
  console.log('  node utils/timestamps_google_takeout.js --all --update     # Update timestamps on all folders\n');
}

// Main function
function main() {
  if (helpMode) {
    showUsage();
    return;
  }

  // Determine which folders to process
  let foldersToProcess = [];

  if (selectedTitle) {
    // Process specific folder
    const folder = config.folders.find(f => f.title.toLowerCase() === selectedTitle.toLowerCase());
    if (!folder) {
      console.error(`❌ Error: Folder "${selectedTitle}" not found in config.json`);
      console.log('\nAvailable folders:');
      config.folders.forEach(f => console.log(`  - ${f.title}`));
      process.exit(1);
    }
    foldersToProcess = [folder];
  } else if (allMode) {
    // Process all folders
    foldersToProcess = config.folders;
  } else {
    // Process only folders with run=yes
    foldersToProcess = config.folders.filter(f => f.run === 'yes');
  }

  if (foldersToProcess.length === 0) {
    console.log('⚠️  No folders configured to process.');
    console.log('Use --all flag to process all folders, or specify a folder by title.\n');
    showUsage();
    return;
  }

  // Process each folder
  console.log(`\n🔍 Processing ${foldersToProcess.length} folder(s)...\n`);

  let totalProcessed = 0;
  let totalSkipped = 0;

  foldersToProcess.forEach(folderConfig => {
    const result = processFolder(folderConfig);
    if (result.success) {
      totalProcessed += result.processedCount;
      totalSkipped += result.skippedCount;
    }
  });

  // Final summary
  if (foldersToProcess.length > 1) {
    console.log('╔' + '═'.repeat(78) + '╗');
    console.log(`║ TOTAL: ${totalProcessed} processed, ${totalSkipped} skipped`.padEnd(79) + '║');
    console.log('╚' + '═'.repeat(78) + '╝\n');
  }

  if (updateMode && totalProcessed > 0) {
    console.log('✅ Files have been successfully renamed with their creation timestamps!\n');
  }

  if (removeMode && totalProcessed > 0) {
    console.log('✅ Timestamp prefixes have been successfully removed from filenames!\n');
  }
}

// Run the script
main();
