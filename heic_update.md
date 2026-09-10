
For a free-text location label baked into the HEIC file, the right home for it is metadata, not a filename or database-only field — that way it survives if the file gets copied, backed up, or opened in Photos/Lightroom/Finder elsewhere. The standard field for exactly this is IPTC/XMP location metadata, and the best tool to write it into HEIC reliably is **ExifTool**.

- **Why ExifTool specifically**: HEIC's metadata is trickier than JPEG's (it's a nested ISO-BMFF/HEIF container), and most lightweight JS EXIF libraries (`piexifjs`, etc.) don't support HEIC at all. ExifTool is the one tool with mature, well-tested HEIC read/write support, including IPTC and XMP blocks.
- **Which field to write**: use `XMP-iptcExt:LocationShown` (or the simpler legacy `IPTC:Sub-location` / `IPTC:City`) rather than jamming text into `Description` — Location fields are what Lightroom, Photos, Bridge, and most DAM tools already show as "location," so your label stays interoperable. If you don't care about interoperability and just want *your* app to read it back, `XMP-dc:Description` is simpler and still universally supported.
- **Node integration**: install `exiftool-vendored` (`npm install exiftool-vendored`) — it bundles the ExifTool binary and keeps a persistent process pool so repeated writes are fast, rather than spawning a new process per file.
- **Write example**:
  ```js
  import { exiftool } from "exiftool-vendored";
  await exiftool.write("photo.heic", {
    "XMP-iptcExt:LocationShown": "Golden Gate Bridge, San Francisco",
  });
  ```
- **Read it back** (e.g. to show in your React UI without re-parsing the whole file client-side):
  ```js
  const tags = await exiftool.read("photo.heic");
  console.log(tags["XMP-iptcExt:LocationShown"]);
  ```
- **Where this runs**: this has to happen server-side (Node script/API route) — ExifTool is a native binary, not something you can run in the browser. Your React thumbnail component stays unaffected; it just calls an API endpoint like `PATCH /photos/:id/label` that does the ExifTool write, then optionally re-reads and returns the updated value.
- **In-place vs copy**: ExifTool by default writes a `_original` backup file alongside the source before modifying it in place (safe default). You can pass `-overwrite_original` (or the `exiftool-vendored` equivalent option) once you're confident, to skip the backup and edit the HEIC directly.
- **One gotcha**: HEIC files are sometimes read-only-mounted (e.g. iCloud/Photos-managed libraries) or the OS may re-sync/overwrite them after you edit — if these files live inside something like a Photos.app library or an iCloud Drive sync folder, editing them in place can get silently reverted or cause sync conflicts. Safer pattern there: keep the location label in your own database/sidecar file, and only write it into a copy of the HEIC if you truly need it portable.

If you also eventually want actual GPS coordinates (not just a text label), that's a separate EXIF field (`GPSLatitude`/`GPSLongitude`) and ExifTool handles that the same way — happy to add that if you need it.
