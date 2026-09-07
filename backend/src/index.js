import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import { readdir, stat, writeFile, mkdir as mkdirFs } from 'fs/promises';
import { execSync } from 'child_process';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPPORTED_FORMATS = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
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
    getSettings: Settings!
    getThumbnail(videoPath: String!): String!
  }

  type Mutation {
    combineVideos(input: CombineInput!): CombineResult!
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
        const files = await readdir(folder);
        const videos = [];

        for (const file of files) {
          const ext = extname(file).toLowerCase();
          if (!SUPPORTED_FORMATS.includes(ext)) continue;

          const filePath = join(folder, file);
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
      const outputFolder = `${OUTPUT_BASE}/home_movies/output`;

      try {
        await mkdirAsync(outputFolder, { recursive: true });

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
const server = new ApolloServer({ typeDefs, resolvers });

await server.start();
server.applyMiddleware({ app });

// Serve thumbnails
app.use('/thumbnails', express.static(THUMBNAIL_DIR));

const PORT = process.env.PORT || 4000;
const httpServer = app.listen(PORT, () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}${server.graphqlPath}`);
});
