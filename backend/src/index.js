import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import { readdir, stat, writeFile, mkdir as mkdirFs } from 'fs/promises';
import { execSync, spawn } from 'child_process';
import { extname, join, resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import os from 'os';
import { readFile } from 'fs/promises';

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

// Serve thumbnails
app.use('/thumbnails', express.static(THUMBNAIL_DIR));

const PORT = process.env.PORT || 4000;
const httpServer = app.listen(PORT, () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}${server.graphqlPath}`);
});
