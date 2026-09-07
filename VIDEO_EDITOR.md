# Video Editor

A modern React + Node.js/GraphQL application for manipulating videos. Currently supports combining multiple videos, with support for splitting, audio extraction, audio removal, and mixed media creation coming soon.

## Features

### Current
- **Combine Videos**: Merge multiple videos into a single file with customizable quality settings
  - Drag-and-drop reordering
  - Video thumbnails and duration display
  - Quality presets (auto-detect, high, medium, low)
  - Real-time progress tracking
  - Remembers user preferences

### Coming Soon
- Split Videos: Cut videos into multiple segments
- Extract Audio: Extract audio tracks from videos
- Delete Audio: Remove audio from videos while keeping video
- Create Movie: Combine videos, photos, and audio into a single movie

## Architecture

```
movies/
├── backend/          # Node.js + Express + GraphQL server
│   ├── src/
│   │   └── index.js  # GraphQL schema and resolvers
│   └── package.json
├── frontend/         # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   └── package.json
└── home_movies/      # Video storage directory
    └── output/       # Combined video output folder
```

## Requirements

- **Node.js** 16+ and npm/yarn
- **FFmpeg** and **FFprobe** must be installed and available in PATH
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt-get install ffmpeg`
  - Windows: Download from https://ffmpeg.org/download.html

## Installation & Setup

### 1. Install Dependencies

**Backend:**
```bash
cd backend
npm install
```

**Frontend:**
```bash
cd frontend
npm install
```

### 2. Verify FFmpeg Installation

```bash
ffmpeg -version
ffprobe -version
```

Both should output version information.

## Running the Application

### Start the Backend Server

```bash
cd backend
npm run dev
```

The GraphQL server will start on `http://localhost:4000`

### Start the Frontend Development Server

In a new terminal:

```bash
cd frontend
npm run dev
```

The React frontend will start on `http://localhost:3000`

Open your browser to `http://localhost:3000` to access the application.

## Usage

### Combine Videos

1. **Select Folder**: Choose the directory containing your videos (defaults to `~/home_movies`)
2. **Select Videos**: Click checkboxes to select videos to combine
3. **Reorder**: Drag videos to change their order in the final output
4. **Configure Output**: 
   - Enter a filename for the combined video
   - Choose quality (auto-detect, high, medium, low)
5. **Combine**: Click "Combine Videos" to start processing
6. **Output**: Combined video is saved to `~/home_movies/output/`

## API Endpoints

### GraphQL

**Endpoint:** `http://localhost:4000/graphql`

#### Queries

```graphql
query {
  listVideos(folder: "/path/to/folder") {
    id
    filename
    path
    duration
    size
    format
  }
  
  getSettings {
    defaultFolder
    outputQuality
    lastOutputName
  }
  
  getThumbnail(videoPath: "/path/to/video.mp4")
}
```

#### Mutations

```graphql
mutation {
  combineVideos(input: {
    inputFolder: "/path/to/folder"
    filePaths: ["/path/file1.mp4", "/path/file2.mp4"]
    outputName: "combined"
    quality: "auto-detect"
  }) {
    id
    outputPath
    duration
    status
  }
  
  saveSettings(
    defaultFolder: "/path/to/folder"
    outputQuality: "auto-detect"
    lastOutputName: "combined"
  ) {
    defaultFolder
    outputQuality
    lastOutputName
  }
}
```

## Video Quality Settings

- **Auto-detect**: Maintains original video bitrate and audio quality
- **High**: 5000k video bitrate, 192k audio bitrate (highest quality)
- **Medium**: 2500k video bitrate, 128k audio bitrate (balanced)
- **Low**: 1000k video bitrate, 96k audio bitrate (smallest file size)

## Supported Video Formats

- MP4 (.mp4)
- MOV (.mov)
- AVI (.avi)
- Matroska (.mkv)
- WebM (.webm)

## File Storage

- **Default Input Folder**: `~/home_movies`
- **Output Folder**: `~/home_movies/output/`
- **Thumbnails**: Cached in `backend/thumbnails/`

## Development

### Backend Development

The backend uses:
- **Express.js** for HTTP server
- **Apollo Server** for GraphQL API
- **ffmpeg-static** or system FFmpeg for video processing
- **Sharp** for image processing (thumbnails)

### Frontend Development

The frontend uses:
- **React 18** for UI components
- **Vite** for fast development and bundling
- **Fetch API** for GraphQL queries

### Build for Production

**Frontend:**
```bash
cd frontend
npm run build
```

Output is generated in `frontend/dist/`

## Troubleshooting

### FFmpeg Not Found
Ensure FFmpeg is installed and available in your PATH:
```bash
which ffmpeg
which ffprobe
```

### Port Already in Use
Change the port in respective configuration files:
- Backend: Edit `backend/src/index.js` (PORT variable)
- Frontend: Edit `frontend/vite.config.js` (server.port)

### Video Processing Fails
- Check that input files are not corrupted
- Verify FFmpeg can process the files: `ffmpeg -i /path/to/video.mp4`
- Ensure output folder has write permissions

### Thumbnails Not Showing
- Check `backend/thumbnails/` directory exists and is writable
- Verify FFmpeg thumbnail generation: `ffmpeg -i video.mp4 -ss 00:00:05 -vframes 1 -vf "scale=200:-1" thumb.jpg`

## Future Features

- Progress streaming via WebSocket subscriptions
- Video preview in browser
- Timeline editor for precise cutting
- Multiple subtitle track handling
- Batch processing queue
- Video format conversion presets
- Frame-by-frame preview
- Keyframe detection for optimal split points

## License

MIT

## Support

For issues and feature requests, refer to the project repository.
