import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import { readdir, stat, writeFile, mkdir as mkdirFs } from 'fs/promises';
import { execSync } from 'child_process';
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
  }

  type SplitResult {
    success: Boolean!
    message: String!
    parts: Int!
  }

  input SplitVideoInput {
    filePath: String!
    mode: String!
    sizeValue: Float
    timeValue: Float
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
