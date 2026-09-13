# Troubleshooting Photo Metadata (Resolution & Size)

If photo resolution and file size are showing as "Unknown", follow these steps:

## Step 1: Check Backend Logs

When you list photos, check the backend console output (where the server is running). You should see lines like:

```
[Photo] image.jpg - size: 2456789 bytes
[Photo] image.jpg - exif data read: { ImageWidth: 3840, ImageHeight: 2160, ... }
[Photo] image.jpg - dimensions: 3840x2160
```

If you see `⚠️ no ImageWidth/ImageHeight in exif data`, that's the issue.

## Step 2: Run the Troubleshooting Script

```bash
cd /Users/maheshnatarajan/workspace/movies
node troubleshoot-image-metadata.js ~/path/to/your/photos
```

Example:
```bash
node troubleshoot-image-metadata.js ~/Pictures
```

This will:
- ✅ Check file sizes for each image
- ✅ Check if exiftool can read dimensions
- ✅ Verify exiftool is installed
- ✅ Show what metadata is available

## Step 3: Verify exiftool Installation

Check if exiftool is installed:
```bash
exiftool -ver
```

If not installed, install it:
```bash
brew install exiftool
```

## Step 4: Test Individual Files

For a specific file, you can check what exiftool returns:

```bash
exiftool -ImageWidth -ImageHeight ~/path/to/image.jpg
```

Or get all metadata:
```bash
exiftool ~/path/to/image.jpg
```

## Step 5: Check for HEIC Images

HEIC files may need special handling. Test with:
```bash
exiftool ~/path/to/image.heic
```

If dimensions aren't in standard fields, we may need to use ImageMagick or a different approach.

## Step 6: Verify Backend Can Read Files

Try reading an image directly:
```bash
# Test file size
ls -lh ~/path/to/image.jpg

# Test exiftool on that specific file
exiftool ~/path/to/image.jpg | grep -i "image.*size\|image.*width\|image.*height"
```

## Common Issues & Solutions

### Issue: "No ImageWidth/ImageHeight in exif data"
**Solution**: The image might be stored without EXIF data. We need to use an alternative method:

Run this to see all available dimensions fields:
```bash
exiftool -s ~/path/to/image.jpg | grep -i width
```

### Issue: exiftool returns wrong dimensions
**Solution**: This is usually fine - the backend will still return *some* dimensions. Check if the image itself displays correctly in your browser.

### Issue: File size shows but resolution doesn't
**Solution**: File size is working fine. Dimensions issue is separate. Run step 2 (troubleshooting script) to diagnose.

### Issue: HEIC images aren't showing dimensions
**Solution**: HEIC files store dimensions differently. We may need to update the backend to use the `SourceFile` field or use a different metadata library.

## Check Backend Startup

Restart the backend and watch the logs when loading photos:
```bash
# Terminal 1: Start backend
cd /Users/maheshnatarajan/workspace/movies/backend
npm start

# Terminal 2: Run the troubleshooting script
cd /Users/maheshnatarajan/workspace/movies
node troubleshoot-image-metadata.js ~/path/to/photos
```

Watch Terminal 1 for the `[Photo]` log messages.

## If All Else Fails

Share the output of:
```bash
node troubleshoot-image-metadata.js ~/path/to/your/photos
```

This will help diagnose exactly what's happening.
