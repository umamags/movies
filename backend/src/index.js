import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import { readdir, stat, writeFile, mkdir as mkdirFs } from 'fs/promises';
import { execSync } from 'child_process';
import { extname, join, resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import os from 'os';

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
  }

  input CombineMediaInput {
    inputFolder: String!
    mediaPaths: [String!]!
    outputName: String!
    quality: String!
    photoDuration: Float!
  }

  type Mutation {
    combineVideos(input: CombineInput!): CombineResult!
    combineMedia(input: CombineMediaInput!): CombineResult!
    saveSettings(defaultFolder: String!, outputQuality: String!, lastOutputName: String!): Settings!
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
          const mediaFile = mediaFiles[i];
          const ext = extname(mediaFile).toLowerCase();
          const standardizedFile = join(tempDir, `media_${i}.mp4`);

          if (SUPPORTED_IMAGE_FORMATS.includes(ext)) {
            // Convert image to standardized video with duration
            const duration = input.photoDuration || 1;
            const ffmpegCmd = `ffmpeg -loop 1 -i "${mediaFile}" -c:v libx264 -c:a aac -t ${duration} -pix_fmt yuv420p -r 30 -y "${standardizedFile}"`;
            execSync(ffmpegCmd, { stdio: 'ignore' });
            intermediateFiles.push(standardizedFile);
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
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1:noprint_indexes=1 "${filePath}"`,
      { encoding: 'utf-8' }
    );
    return parseFloat(output.trim());
  } catch (error) {
    console.error(`Error getting duration for ${filePath}:`, error.message);
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
