import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import fs from 'fs';
import { readdir, stat, writeFile, mkdir as mkdirFs } from 'fs/promises';
import { execSync, spawn } from 'child_process';
import { extname, join, resolve, normalize } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import os from 'os';
import { readFile } from 'fs/promises';
import heicConvert from 'heic-convert';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPPORTED_VIDEO_FORMATS = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
const SUPPORTED_IMAGE_FORMATS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'];
const THUMBNAIL_DIR = join(__dirname, '../thumbnails');
const OUTPUT_BASE = process.env.HOME || '/Users/maheshnatarajan';

// Ensure thumbnail directory exists
await mkdirFs(THUMBNAIL_DIR, { recursive: true });

// GraphQL Schema
const typeDefs = `
  type Video {
    id: String!
    filename: String!
    path: String!
    duration: Float!
    size: Int!
    thumbnail: String
    format: String!
  }

  type Media {
    id: String!
    filename: String!
    path: String!
    type: String!
    duration: Float
    size: Int!
    thumbnail: String
    format: String!
  }

  type CombineResult {
    id: String!
    outputPath: String!
    duration: Float!
    status: String!
  }

  type ProgressUpdate {
    operationId: String!
    progress: Float!
    message: String!
    currentFrame: Int
    totalFrames: Int
    speed: String
    eta: String
  }

  type Settings {
    defaultFolder: String!
    outputQuality: String!
    lastOutputName: String!
  }

  input CombineInput {
    inputFolder: String!
    filePaths: [String!]!
    outputName: String!
    quality: String!
  }

  type Query {
    listVideos(folder: String!): [Video!]!
    listMedia(folder: String!): [Media!]!
    getSettings: Settings!
    getThumbnail(videoPath: String!): String!
    getMediaLocation(mediaPath: String!): String
    getVideoDuration(filePath: String!): Float
    fetchChannelVideos(channelUrl: String!, pageToken: String, searchQuery: String): YoutubeChannelVideosResult!
    listFilesInFolder(folderPath: String!): FileListResult!
    listImagesInFolder(folderPath: String!): ImagesListResult!
  }

  type SplitResult {
    success: Boolean!
    message: String!
    parts: Int!
  }

  type ExtractAudioResult {
    success: Boolean!
    message: String!
    audioFile: String
  }

  type DeleteAudioResult {
    success: Boolean!
    message: String!
    outputFile: String
  }

  type EditVideoResult {
    success: Boolean!
    message: String!
    outputFile: String
  }

  type YoutubeDownloadResult {
    success: Boolean!
    message: String!
    filename: String
  }

  type YoutubeVideo {
    id: String!
    title: String!
    duration: String!
    views: Int!
    published: String!
    thumbnail: String!
  }

  type YoutubeChannelVideosResult {
    success: Boolean!
    message: String!
    videos: [YoutubeVideo!]
    nextPageToken: String
    totalCount: Int
  }

  type YoutubeDownloadMultipleResult {
    success: Boolean!
    message: String!
    downloadedCount: Int!
    failedCount: Int!
    downloadedVideos: [String!]
    failedVideos: [String!]
  }

  type FileInfo {
    name: String!
    timestamp: String
    hasTimestampPrefix: Boolean!
  }

  type FileListResult {
    success: Boolean!
    message: String!
    files: [FileInfo!]
  }

  type TimestampResult {
    originalFile: String!
    newFile: String!
    status: String!
    error: String
  }

  type TimestampsResult {
    success: Boolean!
    message: String!
    processedCount: Int!
    failedCount: Int!
    results: [TimestampResult!]
  }

  input SplitVideoInput {
    filePath: String!
    mode: String!
    sizeValue: Float
    timeValue: Float
  }

  input ExtractAudioInput {
    filePath: String!
  }

  input DeleteAudioInput {
    filePath: String!
  }

  input DeletionRangeInput {
    startTime: String!
    endTime: String!
  }

  input EditVideoInput {
    filePath: String!
    deletionRanges: [DeletionRangeInput!]!
  }

  input CombineMediaInput {
    inputFolder: String!
    mediaPaths: [String!]!
    outputName: String!
    quality: String!
    photoDuration: Float!
    chunkSize: String
  }

  input FilePairInput {
    original: String!
    new: String!
  }

  input ProcessTimestampsInput {
    folderPath: String!
    mode: String!
    filePairs: [FilePairInput!]!
  }

  type PhotoInfo {
    filename: String!
    path: String!
    latitude: Float
    longitude: Float
    address: String
  }

  type ImagesListResult {
    success: Boolean!
    message: String!
    photos: [PhotoInfo!]
  }

  input PhotoLocationInput {
    filename: String!
    latitude: Float!
    longitude: Float!
  }

  type GeoLocationResult {
    filename: String!
    address: String!
  }

  type GetGeoLocationsResult {
    success: Boolean!
    message: String!
    results: [GeoLocationResult!]
  }

  type Mutation {
    combineVideos(input: CombineInput!): CombineResult!
    combineMedia(input: CombineMediaInput!): CombineResult!
    saveSettings(defaultFolder: String!, outputQuality: String!, lastOutputName: String!): Settings!
    splitVideo(input: SplitVideoInput!): SplitResult!
    extractAudio(input: ExtractAudioInput!): ExtractAudioResult!
    deleteAudio(input: DeleteAudioInput!): DeleteAudioResult!
    editVideo(input: EditVideoInput!): EditVideoResult!
    downloadYoutube(url: String!): YoutubeDownloadResult!
    downloadMultipleYoutube(urls: [String!]!): YoutubeDownloadMultipleResult!
    processTimestamps(input: ProcessTimestampsInput!): TimestampsResult!
    getGeoLocations(photos: [PhotoLocationInput!]!): GetGeoLocationsResult!
  }

  type Subscription {
    combineProgress(operationId: String!): ProgressUpdate!
  }
`;

// Resolvers
const resolvers = {
  Query: {
    listVideos: async (_, { folder }) => {
      try {
        const expandedFolder = expandPath(folder);
        const files = await readdir(expandedFolder);
        const videos = [];

        for (const file of files) {
          const ext = extname(file).toLowerCase();
          if (!SUPPORTED_VIDEO_FORMATS.includes(ext)) continue;

          const filePath = join(expandedFolder, file);
          const fileStats = await stat(filePath);

          try {
            const duration = getVideoDuration(filePath);
            videos.push({
              id: uuidv4(),
              filename: file,
              path: filePath,
              duration,
              size: fileStats.size,
              format: ext.substring(1),
            });
          } catch (e) {
            console.error(`Failed to get duration for ${file}:`, e.message);
          }
        }

        return videos;
      } catch (error) {
        throw new Error(`Failed to list videos: ${error.message}`);
      }
    },

    listMedia: async (_, { folder }) => {
      try {
        const expandedFolder = expandPath(folder);
        const files = await readdir(expandedFolder);
        const media = [];

        for (const file of files) {
          const ext = extname(file).toLowerCase();
          const filePath = join(expandedFolder, file);
          const fileStats = await stat(filePath);

          if (SUPPORTED_VIDEO_FORMATS.includes(ext)) {
            try {
              const duration = getVideoDuration(filePath);
              media.push({
                id: uuidv4(),
                filename: file,
                path: filePath,
                type: 'video',
                duration,
                size: fileStats.size,
                format: ext.substring(1),
              });
            } catch (e) {
              console.error(`Failed to get duration for video ${file}:`, e.message);
            }
          } else if (SUPPORTED_IMAGE_FORMATS.includes(ext)) {
            media.push({
              id: uuidv4(),
              filename: file,
              path: filePath,
              type: 'image',
              duration: null,
              size: fileStats.size,
              format: ext.substring(1),
            });
          }
        }

        // Sort chronologically by filename
        media.sort((a, b) => a.filename.localeCompare(b.filename));
        return media;
      } catch (error) {
        throw new Error(`Failed to list media: ${error.message}`);
      }
    },

    getSettings: () => {
      const settings = {
        defaultFolder: `${OUTPUT_BASE}/home_movies`,
        outputQuality: 'auto-detect',
        lastOutputName: '',
      };
      // In production, read from localStorage equivalent or database
      return settings;
    },

    getThumbnail: async (_, { videoPath }) => {
      return generateThumbnail(videoPath);
    },

    getMediaLocation: async (_, { mediaPath }) => {
      try {
        return await getMediaLocationAddress(mediaPath);
      } catch (error) {
        console.error('Failed to get media location:', error.message);
        return null;
      }
    },

    getVideoDuration: async (_, { filePath }) => {
      try {
        const expandedPath = expandPath(filePath);
        return getVideoDuration(expandedPath);
      } catch (error) {
        console.error('Error getting video duration:', error.message);
        return 0;
      }
    },

    fetchChannelVideos: async (_, { channelUrl, pageToken, searchQuery }) => {
      try {
        const result = await fetchChannelVideos(channelUrl, pageToken, searchQuery || '');
        return {
          success: true,
          message: 'Videos fetched successfully',
          ...result,
        };
      } catch (error) {
        console.error('Error fetching channel videos:', error.message);
        return {
          success: false,
          message: error.message,
          videos: [],
          nextPageToken: null,
          totalCount: 0,
        };
      }
    },

    listFilesInFolder: async (_, { folderPath }) => {
      try {
        const expandedPath = expandPath(folderPath);
        const files = await listFilesInFolder(expandedPath);
        return {
          success: true,
          message: 'Files listed successfully',
          files,
        };
      } catch (error) {
        console.error('Error listing files:', error.message);
        return {
          success: false,
          message: error.message,
          files: [],
        };
      }
    },

    listImagesInFolder: async (_, { folderPath }) => {
      try {
        const expandedPath = expandPath(folderPath);
        const photos = await listImagesInFolder(expandedPath);
        return {
          success: true,
          message: 'Images listed successfully',
          photos,
        };
      } catch (error) {
        console.error('Error listing images:', error.message);
        return {
          success: false,
          message: error.message,
          photos: [],
        };
      }
    },
  },

  Mutation: {
    combineVideos: async (_, { input }) => {
      const operationId = uuidv4();

      // Create output folder in the same parent directory as the input folder
      const expandedInputFolder = expandPath(input.inputFolder);
      const parentDir = expandedInputFolder.substring(0, expandedInputFolder.lastIndexOf('/'));
      const outputFolder = join(parentDir, 'output');

      try {
        await mkdirFs(outputFolder, { recursive: true });

        const outputPath = join(outputFolder, `${input.outputName}.mp4`);
        const concatFile = join(THUMBNAIL_DIR, `concat_${operationId}.txt`);

        // Create concat demuxer file
        const concatContent = input.filePaths
          .map(fp => `file '${fp.replace(/'/g, "'\\''")}'`)
          .join('\n');

        await writeFileAsync(concatFile, concatContent);

        // Build ffmpeg command
        const bitrateMap = {
          'auto-detect': '',
          'high': '-b:v 5000k -b:a 192k',
          'medium': '-b:v 2500k -b:a 128k',
          'low': '-b:v 1000k -b:a 96k',
        };

        const bitrate = bitrateMap[input.quality] || '';
        const ffmpegCmd = `ffmpeg -f concat -safe 0 -i "${concatFile}" -c:v libx264 ${bitrate} -c:a aac -y "${outputPath}"`;

        // Execute ffmpeg
        execSync(ffmpegCmd, { stdio: 'inherit' });

        // Get output duration
        const duration = getVideoDuration(outputPath);

        return {
          id: operationId,
          outputPath,
          duration,
          status: 'completed',
        };
      } catch (error) {
        throw new Error(`Failed to combine videos: ${error.message}`);
      }
    },

    combineMedia: async (_, { input }) => {
      const operationId = uuidv4();
      const expandedInputFolder = expandPath(input.inputFolder);
      const parentDir = expandedInputFolder.substring(0, expandedInputFolder.lastIndexOf('/'));
      const outputFolder = join(parentDir, 'output');

      try {
        await mkdirFs(outputFolder, { recursive: true });
        const outputPath = join(outputFolder, `${input.outputName}.mp4`);
        const tempDir = join(THUMBNAIL_DIR, `temp_${operationId}`);
        await mkdirFs(tempDir, { recursive: true });

        // Process media files and create standardized intermediate video files
        const mediaFiles = input.mediaPaths.map(p => expandPath(p));
        const intermediateFiles = [];

        for (let i = 0; i < mediaFiles.length; i++) {
          let mediaFile = mediaFiles[i];
          const ext = extname(mediaFile).toLowerCase();
          const standardizedFile = join(tempDir, `media_${i}.mp4`);

          if (SUPPORTED_IMAGE_FORMATS.includes(ext)) {
            // Handle HEIC images by converting to JPG first
            let inputFile = mediaFile;
            if (ext === '.heic') {
              const jpgFile = join(tempDir, `converted_${i}.jpg`);
              try {
                // Use macOS native sips command to convert HEIC to JPG
                console.log(`Converting HEIC: ${mediaFile}`);
                const sipsOutput = execSync(`sips -s format jpeg "${mediaFile}" --out "${jpgFile}" 2>&1`, { encoding: 'utf-8' });
                console.log(`Sips output: ${sipsOutput}`);
                inputFile = jpgFile;
                console.log(`Converted HEIC to JPG: ${jpgFile}`);
              } catch (e) {
                console.error(`Failed to convert HEIC file with sips: ${e.message}`);
                console.error(`Stderr: ${e.stderr}`);
                console.error(`Stdout: ${e.stdout}`);
                throw new Error(`Failed to convert HEIC image: ${mediaFile}. Error: ${e.message}`);
              }
            }

            // Convert image to standardized video with duration
            const duration = input.photoDuration || 1;
            // Scale image to even dimensions (required by h264) and convert to video
            // Using scale filter to ensure width and height are divisible by 2
            const ffmpegCmd = `ffmpeg -loop 1 -i "${inputFile}" -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -t ${duration} -pix_fmt yuv420p -r 30 -an -y "${standardizedFile}"`;
            try {
              console.log(`Running FFmpeg: ${ffmpegCmd}`);
              execSync(ffmpegCmd, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' });
              console.log(`Successfully converted image to video: ${standardizedFile}`);
              intermediateFiles.push(standardizedFile);
            } catch (e) {
              // Get the error output
              const errorMsg = e.stdout ? e.stdout.toString() : e.message;
              console.error(`FFmpeg failed:`);
              console.error(`Input file: ${inputFile}`);
              console.error(`Output file: ${standardizedFile}`);
              console.error(`Error: ${errorMsg}`);
              throw new Error(`Failed to convert image to video: ${mediaFile}. Error: ${errorMsg}`);
            }
          } else if (SUPPORTED_VIDEO_FORMATS.includes(ext)) {
            // Re-encode video to standardized format for compatibility
            const ffmpegCmd = `ffmpeg -i "${mediaFile}" -c:v libx264 -c:a aac -pix_fmt yuv420p -r 30 -y "${standardizedFile}"`;
            execSync(ffmpegCmd, { stdio: 'ignore' });
            intermediateFiles.push(standardizedFile);
          }
        }

        // Create concat demuxer file
        const concatFile = join(tempDir, 'concat.txt');
        const concatContent = intermediateFiles.map(fp => `file '${fp.replace(/'/g, "'\\''")}'`).join('\n');
        await writeFileAsync(concatFile, concatContent);

        // Build ffmpeg command to concatenate all standardized files
        const bitrateMap = {
          'auto-detect': '',
          'high': '-b:v 5000k -b:a 192k',
          'medium': '-b:v 2500k -b:a 128k',
          'low': '-b:v 1000k -b:a 96k',
        };
        const bitrate = bitrateMap[input.quality] || '';
        const ffmpegCmd = `ffmpeg -f concat -safe 0 -i "${concatFile}" -c:v libx264 ${bitrate} -c:a aac -y "${outputPath}"`;

        execSync(ffmpegCmd, { stdio: 'inherit' });

        // Cleanup temp files
        execSync(`rm -rf "${tempDir}"`, { stdio: 'ignore' });

        const duration = getVideoDuration(outputPath);
        return {
          id: operationId,
          outputPath,
          duration,
          status: 'completed',
        };
      } catch (error) {
        throw new Error(`Failed to combine media: ${error.message}`);
      }
    },

    saveSettings: (_, { defaultFolder, outputQuality, lastOutputName }) => {
      // In production, save to database or localStorage equivalent
      return {
        defaultFolder,
        outputQuality,
        lastOutputName,
      };
    },

    splitVideo: async (_, { input }) => {
      try {
        const expandedFilePath = expandPath(input.filePath);
        const result = await splitVideoFile(expandedFilePath, input.mode, input.sizeValue, input.timeValue);
        return result;
      } catch (error) {
        return {
          success: false,
          message: error.message,
          parts: 0,
        };
      }
    },

    extractAudio: async (_, { input }) => {
      try {
        const expandedFilePath = expandPath(input.filePath);
        const result = await extractAudioFile(expandedFilePath);
        return result;
      } catch (error) {
        return {
          success: false,
          message: error.message,
          audioFile: null,
        };
      }
    },

    deleteAudio: async (_, { input }) => {
      try {
        const expandedFilePath = expandPath(input.filePath);
        const result = await deleteAudioFile(expandedFilePath);
        return result;
      } catch (error) {
        return {
          success: false,
          message: error.message,
          outputFile: null,
        };
      }
    },

    editVideo: async (_, { input }) => {
      try {
        const expandedFilePath = expandPath(input.filePath);
        const result = await editVideoFile(expandedFilePath, input.deletionRanges);
        return result;
      } catch (error) {
        return {
          success: false,
          message: error.message,
          outputFile: null,
        };
      }
    },

    downloadYoutube: async (_, { url }) => {
      try {
        const result = await downloadYoutubeVideo(url);
        return result;
      } catch (error) {
        return {
          success: false,
          message: error.message,
          filename: null,
        };
      }
    },

    downloadMultipleYoutube: async (_, { urls }) => {
      try {
        const result = await downloadMultipleYoutubeVideos(urls);
        return result;
      } catch (error) {
        return {
          success: false,
          message: error.message,
          downloadedCount: 0,
          failedCount: urls.length,
          downloadedVideos: [],
          failedVideos: urls,
        };
      }
    },

    processTimestamps: async (_, { input }) => {
      try {
        const expandedPath = expandPath(input.folderPath);
        const result = await processTimestamps(expandedPath, input.mode, input.filePairs);
        return result;
      } catch (error) {
        return {
          success: false,
          message: error.message,
          processedCount: 0,
          failedCount: input.filePairs.length,
          results: [],
        };
      }
    },

    getGeoLocations: async (_, { photos }) => {
      try {
        const result = await getGeoLocationAddresses(photos);
        return result;
      } catch (error) {
        return {
          success: false,
          message: error.message,
          results: [],
        };
      }
    },
  },
};

// Helper functions
function expandPath(filePath) {
  if (filePath.startsWith('~')) {
    // Remove ~ and any leading slash: ~/path -> path or ~path -> path
    const relativePath = filePath.slice(1).replace(/^\//, '');
    return resolve(os.homedir(), relativePath);
  }
  return resolve(filePath);
}

function getVideoDuration(filePath) {
  try {
    console.log(`[ffprobe] Getting duration for: ${filePath}`);

    // Use JSON output for most reliable parsing
    const cmd = `ffprobe -v error -show_entries format=duration -of json "${filePath}"`;
    console.log(`[ffprobe] Running: ${cmd}`);

    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024
    });

    console.log(`[ffprobe] Raw output: "${output}"`);
    console.log(`[ffprobe] Output length: ${output.length}`);

    try {
      const json = JSON.parse(output);
      console.log(`[ffprobe] Parsed JSON:`, json);
      const duration = parseFloat(json.format?.duration);
      console.log(`[ffprobe] Extracted duration: ${duration}`);
      if (!isNaN(duration) && duration > 0) {
        return duration;
      }
    } catch (parseErr) {
      console.warn(`[ffprobe] Failed to parse JSON output: ${parseErr.message}`);
    }

    // Fallback: try with alternative parameters
    const altCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=duration "${filePath}"`;
    console.log(`[ffprobe] Trying alternative: ${altCmd}`);

    const altOutput = execSync(altCmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    console.log(`[ffprobe] Alt output: "${altOutput}"`);
    const altMatch = altOutput.match(/duration=([\d.]+)/);
    if (altMatch) {
      const duration = parseFloat(altMatch[1]);
      console.log(`[ffprobe] Got duration from alt method: ${duration}`);
      return duration;
    }

    console.warn(`[ffprobe] Could not extract duration from ffprobe output for ${filePath}`);
    return 0;
  } catch (error) {
    console.error(`[ffprobe] Error running ffprobe for ${filePath}:`, error.message);
    console.error(`[ffprobe] Stderr: ${error.stderr}`);
    console.error(`[ffprobe] Stdout: ${error.stdout}`);
    return 0;
  }
}

async function generateThumbnail(videoPath) {
  try {
    const fileName = `${uuidv4()}.jpg`;
    const thumbPath = join(THUMBNAIL_DIR, fileName);

    execSync(
      `ffmpeg -i "${videoPath}" -ss 00:00:05 -vframes 1 -vf "scale=200:-1" "${thumbPath}" -y`,
      { stdio: 'ignore' }
    );

    return `/thumbnails/${fileName}`;
  } catch (error) {
    console.error('Failed to generate thumbnail:', error.message);
    return null;
  }
}

async function writeFileAsync(filePath, content) {
  return writeFile(filePath, content);
}

async function getMediaLocationAddress(mediaPath) {
  try {
    const metadataPath = `${mediaPath}.supplemental-metadata.json`;
    const metadataContent = await readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    if (!metadata.geoData || metadata.geoData.latitude === undefined || metadata.geoData.longitude === undefined) {
      return null;
    }

    const { latitude, longitude } = metadata.geoData;

    // Skip invalid coordinates (0,0)
    if (latitude === 0 && longitude === 0) {
      return null;
    }

    // Call LocationIQ API
    const accessToken = process.env.LOCATIONIQ_ACCESS_TOKEN;
    if (!accessToken) {
      console.warn('LOCATIONIQ_ACCESS_TOKEN not set');
      return null;
    }

    const apiUrl = `https://us1.locationiq.com/v1/reverse?key=${accessToken}&lat=${latitude}&lon=${longitude}&format=json`;

    const response = await fetch(apiUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Node.js)' }
    });

    if (!response.ok) {
      throw new Error(`LocationIQ API returned status ${response.status()}`);
    }

    const data = await response.json();

    if (!data.address) {
      return null;
    }

    return data.address.name || null;
  } catch (error) {
    console.error('Failed to get media location:', error.message);
    return null;
  }
}

async function splitVideoFile(filePath, mode, sizeValue, timeValue) {
  try {
    // Get video duration in seconds
    console.log(`Getting duration for: ${filePath}`);
    const duration = getVideoDuration(filePath);
    console.log(`Duration: ${duration} seconds`);

    if (duration === 0) {
      throw new Error(`Could not determine video duration for ${filePath}. Make sure ffprobe is installed and the file is a valid video file.`);
    }

    const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));
    const fileNameFull = filePath.substring(filePath.lastIndexOf('/') + 1);
    const fileExt = extname(fileNameFull);
    const fileNameWithoutExt = fileNameFull.substring(0, fileNameFull.length - fileExt.length);

    let segmentDuration; // in seconds
    let numParts;

    if (mode === 'time') {
      // Split by time
      segmentDuration = timeValue * 60; // Convert minutes to seconds
      numParts = Math.ceil(duration / segmentDuration);
    } else {
      // Split by file size
      // Get file size in bytes
      const fileStats = await stat(filePath);
      const fileSizeBytes = fileStats.size;
      const targetSizeBytes = sizeValue * 1024 * 1024;

      // Estimate segment duration based on bitrate
      const bitrateBytes = fileSizeBytes / duration; // bytes per second
      segmentDuration = Math.floor(targetSizeBytes / bitrateBytes);
      numParts = Math.ceil(duration / segmentDuration);
    }

    console.log(`Splitting video: ${numParts} parts, ${segmentDuration}s each`);

    // Create output parts using ffmpeg segment filter
    const outputPattern = join(fileDir, `${fileNameWithoutExt}_PART%03d${fileExt}`);
    const ffmpegCmd = `ffmpeg -i "${filePath}" -c copy -segment_time ${segmentDuration} -f segment "${outputPattern}" -y`;

    console.log(`Running: ${ffmpegCmd}`);
    execSync(ffmpegCmd, { stdio: 'pipe' });

    return {
      success: true,
      message: `Video split into ${numParts} parts`,
      parts: numParts,
    };
  } catch (error) {
    console.error('Failed to split video:', error.message);
    throw new Error(`Failed to split video: ${error.message}`);
  }
}

async function extractAudioFile(filePath) {
  try {
    console.log(`Extracting audio from: ${filePath}`);

    const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));
    const fileNameFull = filePath.substring(filePath.lastIndexOf('/') + 1);
    const fileExt = extname(fileNameFull);
    const fileNameWithoutExt = fileNameFull.substring(0, fileNameFull.length - fileExt.length);

    const audioOutputPath = join(fileDir, `${fileNameWithoutExt}.mp3`);

    // Extract audio using ffmpeg
    const ffmpegCmd = `ffmpeg -i "${filePath}" -vn -codec:a libmp3lame -q:a 2 "${audioOutputPath}" -y`;

    console.log(`Running: ${ffmpegCmd}`);
    execSync(ffmpegCmd, { stdio: 'pipe' });

    console.log(`Audio extracted to: ${audioOutputPath}`);

    return {
      success: true,
      message: `Audio extracted successfully`,
      audioFile: audioOutputPath,
    };
  } catch (error) {
    console.error('Failed to extract audio:', error.message);
    throw new Error(`Failed to extract audio: ${error.message}`);
  }
}

async function deleteAudioFile(filePath) {
  try {
    console.log(`Deleting audio from: ${filePath}`);

    const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));
    const fileNameFull = filePath.substring(filePath.lastIndexOf('/') + 1);
    const fileExt = extname(fileNameFull);
    const fileNameWithoutExt = fileNameFull.substring(0, fileNameFull.length - fileExt.length);

    const videoOutputPath = join(fileDir, `${fileNameWithoutExt}-modified${fileExt}`);

    // Delete audio using ffmpeg (copy video codec, remove audio)
    const ffmpegCmd = `ffmpeg -i "${filePath}" -c:v copy -an "${videoOutputPath}" -y`;

    console.log(`Running: ${ffmpegCmd}`);
    execSync(ffmpegCmd, { stdio: 'pipe' });

    console.log(`Audio deleted from: ${videoOutputPath}`);

    return {
      success: true,
      message: `Audio deleted successfully`,
      outputFile: videoOutputPath,
    };
  } catch (error) {
    console.error('Failed to delete audio:', error.message);
    throw new Error(`Failed to delete audio: ${error.message}`);
  }
}

function timeStringToSeconds(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length !== 3) return 0;
  const hours = parseInt(parts[0]) || 0;
  const minutes = parseInt(parts[1]) || 0;
  const seconds = parseInt(parts[2]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .substring(0, 200);
}

async function fetchChannelVideos(channelUrl, pageToken, searchQuery) {
  try {
    console.log(`Fetching channel videos: ${channelUrl}`);

    const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'youtube_helper.py');
    const pageTokenArg = pageToken || 'null';
    const pythonPath = '/opt/anaconda3/bin/python3';

    const cmd = `${pythonPath} "${scriptPath}" "${channelUrl}" "${pageTokenArg}" "${searchQuery || ''}"`;

    console.log(`Running: ${cmd}`);
    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
      cwd: dirname(fileURLToPath(import.meta.url))
    });

    const result = JSON.parse(output);

    if (result.error) {
      throw new Error(result.error);
    }

    return result;
  } catch (error) {
    console.error('Failed to fetch channel videos:', error.message);
    throw new Error(`Failed to fetch channel videos: ${error.message}`);
  }
}

async function downloadYoutubeVideo(url) {
  try {
    console.log(`Downloading from YouTube: ${url}`);

    // Validate YouTube URL
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|youtube\.com\/playlist|youtube\.com\/channel|youtube\.com\/@)\S+$/i;
    if (!youtubeRegex.test(url)) {
      throw new Error('Invalid YouTube URL format');
    }

    // Detect URL type
    let urlType = 'video';
    if (url.includes('/playlist')) {
      urlType = 'playlist';
    } else if (url.includes('/channel/') || url.includes('/@')) {
      urlType = 'channel';
    }

    if (urlType === 'playlist') {
      throw new Error('This is a playlist URL. Multiple videos will be downloaded to your Downloads folder.');
    }

    if (urlType === 'channel') {
      throw new Error('This is a channel URL. All videos from this channel will be downloaded to your Downloads folder.');
    }

    const downloadsPath = expandPath('~/Downloads');

    // Run yt-dlp command with output template
    const cmd = `yt-dlp -P "${downloadsPath}" -o "%(title)s.%(ext)s" "${url}"`;

    console.log(`Running: ${cmd}`);
    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024
    });

    console.log(`Download output: ${output}`);

    // Extract filename from yt-dlp output or generate one
    let filename = 'Downloaded video';

    // Try to parse the output for the downloaded filename
    const filenameMatch = output.match(/\[download\].*?"([^"]+)"/);
    if (filenameMatch) {
      filename = filenameMatch[1];
    } else {
      // Fallback: use generic name with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      filename = `youtube_download_${timestamp}`;
    }

    return {
      success: true,
      message: `Video downloaded successfully to Downloads folder`,
      filename: sanitizeFilename(filename),
    };
  } catch (error) {
    console.error('Failed to download from YouTube:', error.message);

    // Check for specific error conditions
    if (error.message.includes('This is a playlist URL')) {
      return {
        success: false,
        message: error.message,
        filename: null,
      };
    }

    if (error.message.includes('This is a channel URL')) {
      return {
        success: false,
        message: error.message,
        filename: null,
      };
    }

    throw new Error(`YouTube download failed: ${error.message}`);
  }
}

async function downloadMultipleYoutubeVideos(urls) {
  const downloadsPath = expandPath('~/Downloads');
  const downloadedVideos = [];
  const failedVideos = [];
  const MAX_CONCURRENT = 3;

  // Process downloads with concurrency limit
  for (let i = 0; i < urls.length; i += MAX_CONCURRENT) {
    const batch = urls.slice(i, i + MAX_CONCURRENT);
    const promises = batch.map(async (url) => {
      try {
        console.log(`Downloading: ${url}`);
        const cmd = `yt-dlp -P "${downloadsPath}" -o "%(title)s.%(ext)s" "${url}"`;
        const output = execSync(cmd, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          maxBuffer: 10 * 1024 * 1024
        });

        const filenameMatch = output.match(/\[download\].*?"([^"]+)"/);
        const filename = filenameMatch ? filenameMatch[1] : 'Downloaded video';

        downloadedVideos.push(sanitizeFilename(filename));
        return { success: true };
      } catch (err) {
        console.error(`Failed to download ${url}:`, err.message);
        failedVideos.push(url);
        return { success: false };
      }
    });

    await Promise.all(promises);
  }

  return {
    success: failedVideos.length === 0,
    message: `Downloaded ${downloadedVideos.length}/${urls.length} videos`,
    downloadedCount: downloadedVideos.length,
    failedCount: failedVideos.length,
    downloadedVideos,
    failedVideos,
  };
}

async function editVideoFile(filePath, deletionRanges) {
  try {
    console.log(`Editing video: ${filePath}`);
    console.log(`Deletion ranges: ${JSON.stringify(deletionRanges)}`);

    const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));
    const fileNameFull = filePath.substring(filePath.lastIndexOf('/') + 1);
    const fileExt = extname(fileNameFull);
    const fileNameWithoutExt = fileNameFull.substring(0, fileNameFull.length - fileExt.length);

    const videoDuration = getVideoDuration(filePath);
    console.log(`Video duration: ${videoDuration} seconds`);

    // Convert deletion ranges to seconds and sort them
    const deletionSegments = deletionRanges
      .map(r => ({
        start: timeStringToSeconds(r.startTime),
        end: timeStringToSeconds(r.endTime)
      }))
      .sort((a, b) => a.start - b.start);

    // Calculate portions to keep
    const keepSegments = [];
    let currentPos = 0;

    deletionSegments.forEach(range => {
      if (currentPos < range.start) {
        keepSegments.push({ start: currentPos, end: range.start });
      }
      currentPos = Math.max(currentPos, range.end);
    });

    if (currentPos < videoDuration) {
      keepSegments.push({ start: currentPos, end: videoDuration });
    }

    console.log(`Keep segments: ${JSON.stringify(keepSegments)}`);

    if (keepSegments.length === 0) {
      throw new Error('No video content to keep after deletion ranges');
    }

    // Create temporary directory for segments
    const tempDir = join(fileDir, `.edit_${uuidv4()}`);
    await mkdirFs(tempDir, { recursive: true });

    try {
      // Extract each keep segment
      const segmentFiles = [];

      for (let i = 0; i < keepSegments.length; i++) {
        const segment = keepSegments[i];
        const segmentFile = join(tempDir, `segment_${i}${fileExt}`);

        const duration = segment.end - segment.start;
        const ffmpegCmd = `ffmpeg -i "${filePath}" -ss ${segment.start} -t ${duration} -c copy "${segmentFile}" -y`;

        console.log(`Extracting segment ${i}: ${ffmpegCmd}`);
        execSync(ffmpegCmd, { stdio: 'pipe' });

        segmentFiles.push(segmentFile);
      }

      // Create concat demuxer file
      const concatFile = join(tempDir, 'concat.txt');
      const concatContent = segmentFiles.map(f => `file '${f}'`).join('\n');
      await writeFile(concatFile, concatContent);

      console.log(`Concat file created with ${segmentFiles.length} segments`);

      // Combine segments using concat demuxer
      const outputPath = join(fileDir, `${fileNameWithoutExt}-edited${fileExt}`);
      const ffmpegCombineCmd = `ffmpeg -f concat -safe 0 -i "${concatFile}" -c copy "${outputPath}" -y`;

      console.log(`Combining segments: ${ffmpegCombineCmd}`);
      execSync(ffmpegCombineCmd, { stdio: 'pipe' });

      console.log(`Video edited and saved to: ${outputPath}`);

      return {
        success: true,
        message: `Video edited successfully (${keepSegments.length} segment(s) kept)`,
        outputFile: outputPath,
      };
    } finally {
      // Cleanup temporary directory
      try {
        execSync(`rm -rf "${tempDir}"`, { stdio: 'pipe' });
      } catch (e) {
        console.warn(`Failed to cleanup temp directory: ${e.message}`);
      }
    }
  } catch (error) {
    console.error('Failed to edit video:', error.message);
    throw new Error(`Failed to edit video: ${error.message}`);
  }
}

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

function getGoogleTakeoutCreationTime(filePath) {
  // First, try to get metadata for the file itself
  let metadataPath = `${filePath}.supplemental-metadata.json`;

  if (!fs.existsSync(metadataPath)) {
    // If not found, try to find metadata for a related file with the same base name
    const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));
    const fileNameFull = filePath.substring(filePath.lastIndexOf('/') + 1);
    const fileNameWithoutExt = fileNameFull.substring(0, fileNameFull.lastIndexOf('.'));

    // Search for any metadata file matching the base filename
    try {
      const files = fs.readdirSync(fileDir);
      const relatedMetadata = files.find(f =>
        f.startsWith(fileNameWithoutExt) && f.endsWith('.supplemental-metadata.json')
      );

      if (relatedMetadata) {
        metadataPath = join(fileDir, relatedMetadata);
      } else {
        return null;
      }
    } catch (err) {
      return null;
    }
  }

  if (!fs.existsSync(metadataPath)) {
    return null;
  }

  try {
    const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);
    if (metadata.photoTakenTime && metadata.photoTakenTime.timestamp) {
      const timestamp = metadata.photoTakenTime.timestamp;
      const dateMs = typeof timestamp === 'string' ? parseInt(timestamp) * 1000 : timestamp * 1000;
      if (!isNaN(dateMs) && dateMs > 0) {
        return dateMs;
      }
    }
  } catch (err) {
    // Metadata file exists but couldn't be parsed
  }
  return null;
}

function hasTimestampPrefix(filename) {
  const pattern = /^\d{8}_\d{6}_/;
  return pattern.test(filename);
}

async function listFilesInFolder(folderPath) {
  try {
    const supportedFormats = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.mp4', '.mov', '.avi', '.mkv', '.webm'];
    const files = fs.readdirSync(folderPath);
    const fileInfos = [];

    for (const filename of files) {
      // Skip metadata files and hidden files
      if (filename.endsWith('.supplemental-metadata.json') || filename.startsWith('.')) {
        continue;
      }

      const ext = extname(filename).toLowerCase();
      if (!supportedFormats.includes(ext)) {
        continue;
      }

      const filePath = join(folderPath, filename);
      const googleTakeoutTime = getGoogleTakeoutCreationTime(filePath);

      let timestamp = 'N/A';
      if (googleTakeoutTime !== null) {
        timestamp = formatTimestamp(googleTakeoutTime);
      }

      fileInfos.push({
        name: filename,
        timestamp: timestamp === 'N/A' ? null : timestamp,
        hasTimestampPrefix: hasTimestampPrefix(filename),
      });
    }

    return fileInfos;
  } catch (error) {
    throw new Error(`Failed to list files: ${error.message}`);
  }
}

async function processTimestamps(folderPath, mode, filePairs) {
  const results = [];
  let processedCount = 0;
  let failedCount = 0;

  for (const pair of filePairs) {
    try {
      const oldPath = join(folderPath, pair.original);
      const newPath = join(folderPath, pair.new);

      // Check if file exists
      if (!fs.existsSync(oldPath)) {
        results.push({
          originalFile: pair.original,
          newFile: pair.new,
          status: 'error',
          error: 'File not found',
        });
        failedCount++;
        continue;
      }

      // Only rename if names are different
      if (pair.original !== pair.new) {
        fs.renameSync(oldPath, newPath);

        // Also rename associated metadata JSON file if it exists
        const metadataOldPath = `${oldPath}.supplemental-metadata.json`;
        const metadataNewPath = `${newPath}.supplemental-metadata.json`;
        if (fs.existsSync(metadataOldPath)) {
          try {
            fs.renameSync(metadataOldPath, metadataNewPath);
          } catch (err) {
            console.warn(`Warning: Could not rename metadata file: ${err.message}`);
          }
        }

        results.push({
          originalFile: pair.original,
          newFile: pair.new,
          status: 'success',
        });
        processedCount++;
      } else {
        results.push({
          originalFile: pair.original,
          newFile: pair.new,
          status: 'skipped',
          error: 'Filename unchanged',
        });
      }
    } catch (error) {
      results.push({
        originalFile: pair.original,
        newFile: pair.new,
        status: 'error',
        error: error.message,
      });
      failedCount++;
    }
  }

  return {
    success: failedCount === 0,
    message: `Processed ${processedCount} file(s)${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
    processedCount,
    failedCount,
    results,
  };
}

async function listImagesInFolder(folderPath) {
  try {
    const imageFormats = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'];
    const files = fs.readdirSync(folderPath);
    const photoInfos = [];

    for (const filename of files) {
      // Skip metadata files and hidden files
      if (filename.endsWith('.supplemental-metadata.json') || filename.startsWith('.')) {
        continue;
      }

      const ext = extname(filename).toLowerCase();
      if (!imageFormats.includes(ext)) {
        continue;
      }

      const filePath = join(folderPath, filename);
      let latitude = null;
      let longitude = null;

      // Try to get geolocation from metadata
      const metadataPath = `${filePath}.supplemental-metadata.json`;
      let metadataFilePath = metadataPath;

      // If file's own metadata doesn't exist, try to find related metadata
      if (!fs.existsSync(metadataPath)) {
        const fileNameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
        const relatedMetadata = files.find(f =>
          f.startsWith(fileNameWithoutExt) && f.endsWith('.supplemental-metadata.json')
        );
        if (relatedMetadata) {
          metadataFilePath = join(folderPath, relatedMetadata);
        }
      }

      if (fs.existsSync(metadataFilePath)) {
        try {
          const metadataContent = fs.readFileSync(metadataFilePath, 'utf-8');
          const metadata = JSON.parse(metadataContent);
          if (metadata.geoData && metadata.geoData.latitude !== undefined && metadata.geoData.longitude !== undefined) {
            latitude = metadata.geoData.latitude;
            longitude = metadata.geoData.longitude;
          }
        } catch (err) {
          // Metadata parsing failed, continue without geolocation
        }
      }

      // Only include if there's valid geolocation data (not 0,0)
      if (latitude !== null && longitude !== null && !(latitude === 0 && longitude === 0)) {
        photoInfos.push({
          filename: filename,
          path: filePath,
          latitude: latitude,
          longitude: longitude,
          address: null,
        });
      }
    }

    return photoInfos;
  } catch (error) {
    throw new Error(`Failed to list images: ${error.message}`);
  }
}

const geoLocationCache = {};

async function getGeoLocationAddresses(photos) {
  const results = [];
  const accessToken = process.env.LOCATIONIQ_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('LOCATIONIQ_ACCESS_TOKEN environment variable is not set');
  }

  for (const photo of photos) {
    try {
      const cacheKey = `${photo.latitude},${photo.longitude}`;

      // Check cache first
      if (geoLocationCache[cacheKey]) {
        results.push({
          filename: photo.filename,
          address: geoLocationCache[cacheKey],
        });
        continue;
      }

      // Fetch from LocationIQ API
      const apiUrl = `https://us1.locationiq.com/v1/reverse?key=${accessToken}&lat=${photo.latitude}&lon=${photo.longitude}&format=json`;

      console.log(`[LocationIQ] Fetching address for ${photo.filename}`);
      console.log(`[LocationIQ] API URL: ${apiUrl.replace(accessToken, 'HIDDEN_TOKEN')}`);
      console.log(`[LocationIQ] Coordinates: lat=${photo.latitude}, lon=${photo.longitude}`);

      try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        console.log(`[LocationIQ] Response status: ${response.status}`);
        console.log(`[LocationIQ] Response body:`, JSON.stringify(data, null, 2));

        if (!response.ok) {
          throw new Error(`LocationIQ API returned status ${response.status}`);
        }

        if (data.display_name) {
          // Extract first 3 parts from comma-separated string
          const parts = data.display_name.split(',').slice(0, 3);
          const address = parts.map(p => p.trim()).join(', ');
          geoLocationCache[cacheKey] = address;
          console.log(`[LocationIQ] Success - Address: ${address}`);

          results.push({
            filename: photo.filename,
            address: address,
          });
        } else {
          console.log(`[LocationIQ] No display_name found in response`);
          console.log(`[LocationIQ] Response keys:`, Object.keys(data));
          results.push({
            filename: photo.filename,
            address: 'Address not found',
          });
        }
      } catch (err) {
        console.error(`[LocationIQ] Error fetching address for ${photo.filename}:`, err.message);
        results.push({
          filename: photo.filename,
          address: 'Error fetching address',
        });
      }
    } catch (error) {
      console.error(`Error processing photo ${photo.filename}:`, error.message);
    }
  }

  return {
    success: true,
    message: `Fetched addresses for ${results.length} photo(s)`,
    results,
  };
}

// Server setup
const app = express();

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

const server = new ApolloServer({ typeDefs, resolvers });

await server.start();
server.applyMiddleware({ app });

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve image by file path (with HEIC conversion support)
app.get('/image', async (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  try {
    const expandedPath = filePath.startsWith('~')
      ? filePath.replace('~', os.homedir())
      : filePath;

    // Prevent directory traversal attacks
    const normalizedPath = normalize(expandedPath);
    if (normalizedPath.includes('..')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    if (!fs.existsSync(normalizedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileExt = extname(normalizedPath).toLowerCase();
    const isHeic = fileExt === '.heic' || fileExt === '.heif';

    if (isHeic) {
      // Generate cache path for JPEG version
      const fileName = normalizedPath.split('/').pop();
      const cachedJpgPath = join(THUMBNAIL_DIR, `${fileName}.jpg`);

      // Check if cached version exists
      if (fs.existsSync(cachedJpgPath)) {
        console.log(`[Image] Serving cached JPEG for ${fileName}`);
        return res.sendFile(cachedJpgPath);
      }

      // Convert HEIC to JPEG using ffmpeg
      console.log(`[Image] Converting HEIC to JPEG: ${fileName}`);
      try {
        execSync(`ffmpeg -i "${normalizedPath}" -q:v 2 "${cachedJpgPath}" -y 2>/dev/null`, {
          stdio: 'pipe',
        });
        console.log(`[Image] Cached JPEG saved: ${cachedJpgPath}`);
        return res.sendFile(cachedJpgPath);
      } catch (ffmpegErr) {
        console.error(`[Image] ffmpeg conversion failed: ${ffmpegErr.message}`);
        // Fallback: serve original HEIC (Safari will display it)
        return res.sendFile(normalizedPath);
      }
    } else {
      res.sendFile(normalizedPath);
    }
  } catch (err) {
    console.error(`Error serving image: ${err.message}`);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

const PORT = process.env.PORT || 4000;
const httpServer = app.listen(PORT, () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}${server.graphqlPath}`);
});
