
The exact tag depends on the tool you use, but here's the rundown — HEIC files from an iPhone 17 Pro Max store creation time as standard EXIF metadata (mainly `DateTimeOriginal`, sometimes also `CreateDate` and `ModifyDate`) inside the HEIF container, so any EXIF-capable tool can pull it.

**Fastest / most reliable: ExifTool**

- Install: `brew install exiftool` (Mac), `apt install libimage-exiftool-perl` (Linux), or download the Windows binary from exiftool.org
- Single file: `exiftool -DateTimeOriginal photo.heic`
- Batch, just the timestamp: `exiftool -DateTimeOriginal -T *.heic`
- Full metadata dump (useful for spotting the exact tag names on your files): `exiftool -a -G1 photo.heic`
- Export to CSV for a folder: `exiftool -csv -DateTimeOriginal -r /path/to/folder > timestamps.csv`
- ExifTool handles HEIC natively (no plugin needed) and is generally considered the most accurate for Apple's metadata quirks, including sub-second time and timezone offset tags (`OffsetTimeOriginal`) that iPhones write.

**Python (if you want it scripted/integrated)**

- `pip install pillow-heif exifread --break-system-packages`
- With Pillow:
  ```python
  from PIL import Image
  import pillow_heif
  pillow_heif.register_heif_opener()
  img = Image.open("photo.heic")
  exif = img.getexif()
  print(exif.get(36867))  # 36867 = DateTimeOriginal tag ID
  ```
- Alternative: `exifread` or `pyexiv2` also work once `pillow-heif` registers the HEIF opener with Pillow, since raw EXIF parsing is otherwise a pain with HEIC's box structure.
- For batch processing, calling ExifTool as a subprocess (`exiftool -j -DateTimeOriginal *.heic`) is usually less error-prone than pure-Python HEIC parsing.

**macOS built-in options (no install needed)**

- `mdls -name kMDItemContentCreationDate photo.heic` — reads Spotlight's cached metadata
- `sips -g all photo.heic` — Apple's own image tool, prints creation date among other EXIF fields
- These are handy for a quick check but less complete than ExifTool for edge cases (e.g., burst photos, edited/duplicate HEICs).

**Things specific to iPhone 17 Pro Max / recent iOS HEICs to watch for**

- If the photo was edited in the Photos app, `DateTimeOriginal` should still reflect the original capture time — `ModifyDate` changes, `DateTimeOriginal` doesn't.
- Screenshots and screen recordings converted to HEIC won't have a real `DateTimeOriginal` — you'd fall back to filesystem timestamps.
- If photos were AirDropped, emailed, or passed through an app that re-encodes them, EXIF can get stripped entirely — worth spot-checking a few files first.
- iCloud-synced photos opened via Photos.app rather than the Finder can report a different "date" (added-to-library vs. capture date) — `mdls`/Photos.app metadata isn't always the same as the EXIF `DateTimeOriginal`.

If you've got a folder of these HEICs you want processed right now (e.g., renamed by date, or dumped to a spreadsheet), let me know where they live and I can write a script to do it in bulk rather than you running commands one by one.
