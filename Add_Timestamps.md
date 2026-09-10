# Add Timestamps Feature - Implementation Notes

## Prompt 1: Feature Requirements

Add a tab "Timestamps" before "Combine videos". It should allow the user to specify a folder (full path in text field or folder picker - design this as a common component). Once folder is specified, user clicks on list files button and it will list all files in the folder. When the user clicks on the "Add timestamp" button, it will use the metadata present in the metadata json and append it to the beginning of the file names. Use the logic in timestamps_google_takeout.js under <root>/utils. There should also buttons for "Remove timestamp" which will remove the timestamp from the filename, if it exists.

### Clarifying Questions Asked:

1. **File selection**: Should the UI show list of all files with checkboxes, or apply operations to all files?
2. **Preview**: Should it show preview of new filename before applying changes?
3. **File operations**: Should it actually rename files immediately or show preview with "Apply" button?
4. **Missing metadata**: If file doesn't have .supplemental-metadata.json, what to do?
5. **Timestamp format**: Should format be fixed or user-configurable?
6. **Remove timestamp**: How to handle various timestamp formats?
7. **Bulk operations**: Show progress bar, success/failure for each file, summary at end?

### User Responses:

1. Apply operations to all files
2. Yes, show preview with filenames side-by-side
3. Show preview with apply button (don't rename immediately)
4. Use created date and timestamp from metadata
5. Configurable timestamp format
6. Use same timestamp format as step 5, show preview
7. Show summary at end

---

## Response: Initial Frontend Implementation

### Components Created:

#### 1. Timestamps.jsx
- Folder selector (using FileSelector component)
- "List Files" button to show files in folder
- Preview mode showing before/after filenames
- "Add Timestamps" and "Remove Timestamps" buttons
- "Apply Changes" button to confirm operations
- Progress bar and status messages
- Summary at the end

#### 2. Timestamps.css
- Styling for folder selection
- Files preview list with scrolling
- Side-by-side preview of original vs new filenames
- Color-coded indicators (yellow for before, green for after)
- Action buttons and alerts

#### 3. App.jsx Updates
- Imported Timestamps component
- Added "Timestamps" tab before "Combine Videos"
- Rendered component in tab content

### Key Features Implemented:
- ✅ Folder path input (text field using FileSelector)
- ✅ List Files button to fetch files from folder
- ✅ Preview mode showing before/after filenames
- ✅ Separate buttons for Add/Remove operations
- ✅ Side-by-side filename comparison
- ✅ Apply/Cancel buttons to control changes
- ✅ Progress bar during processing
- ✅ Error and success alerts

### Backend Implementation Still Needed:

#### GraphQL Types:
- `FileInfo` - contains name, timestamp, hasTimestampPrefix
- `FileListResult` - contains success, message, files array
- `FilePairInput` - contains original, new filenames
- `TimestampsResult` - contains success, message, processedCount, failedCount, results

#### GraphQL Queries:
- `listFilesInFolder(folderPath: String!)` - lists all media files in folder

#### GraphQL Mutations:
- `processTimestamps(folderPath, mode, filePairs)` - applies add/remove timestamp operations

#### Backend Helper Functions:
- Extract timestamp from `.supplemental-metadata.json` or file creation date
- Format timestamp as YYYYMMDD_HHMMSS
- Check if file has timestamp prefix pattern `^\d{8}_\d{6}_`
- Rename files (add/remove timestamps)
- Handle associated `.supplemental-metadata.json` files

### Reference Implementation:
The logic should be based on `utils/timestamps_google_takeout.js`:
- `formatTimestamp(dateMs)` - converts milliseconds to YYYYMMDD_HHMMSS format
- `getGoogleTakeoutCreationTime(filePath)` - reads photoTakenTime from metadata JSON
- `getImageCreationTime(filePath)` - extracts EXIF date from images
- `getVideoCreationTime(filePath)` - uses ffprobe to get video creation time
- `hasTimestampPrefix(filename)` - checks pattern `^\d{8}_\d{6}_`
- Fallback to file system creation time if metadata not available

### File Operations:
- **Add mode**: Creates files with `{timestamp}_{originalFilename}` format
- **Remove mode**: Strips `\d{8}_\d{6}_` prefix from filenames
- Also handles associated `.supplemental-metadata.json` files during rename
