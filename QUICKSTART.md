# Quick Start Guide - Video Editor

## Prerequisites
- Node.js 16+ and npm
- FFmpeg installed: `brew install ffmpeg` (macOS)

## Installation (One-time)

```bash
# From the root movies directory
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..
```

## Running the Application

### Option 1: Run Both Servers Together
```bash
npm run dev
```
This will start both the backend (port 4000) and frontend (port 3000) concurrently.

### Option 2: Run Servers Separately
**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

## Access the App

Open your browser and go to: **http://localhost:3000**

## First Time Usage

1. **Backend** will start on `http://localhost:4000/graphql`
2. **Frontend** will start on `http://localhost:3000`
3. On first load, the app defaults to `~/home_movies` folder
4. Browse videos and select ones to combine
5. Reorder by dragging
6. Choose quality and output filename
7. Click "Combine Videos"
8. Output appears in `~/home_movies/output/`

## Troubleshooting

**Port 4000 already in use?**
```bash
# Kill process using port 4000
lsof -ti:4000 | xargs kill -9
```

**FFmpeg not found?**
```bash
brew install ffmpeg
which ffmpeg  # Should show /opt/homebrew/bin/ffmpeg
```

**Node modules issues?**
```bash
# Clean reinstall
rm -rf node_modules package-lock.json
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

## Project Structure

```
movies/
├── backend/           # Node.js + GraphQL API
├── frontend/          # React + Vite UI
├── home_movies/       # Video storage
│   └── output/        # Combined videos go here
└── package.json       # Root package for easy setup
```

## Features Available

✅ **Combine Videos** - Select multiple videos, reorder, set quality, combine
🔄 Drag-and-drop reordering
📺 Video thumbnails and duration display
⚙️ Quality settings (auto, high, medium, low)
💾 Remembers your preferences
📊 Progress tracking during processing

## Coming Soon

- Split Videos
- Extract Audio
- Remove Audio
- Create Movies from Photos + Audio

For detailed documentation, see [VIDEO_EDITOR.md](VIDEO_EDITOR.md)
