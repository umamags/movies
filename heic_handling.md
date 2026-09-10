
Short version: HEIC isn't the problem with your code — it's that Chrome, Firefox, and Edge simply cannot decode/render HEIC in an `<img>` tag (only Safari on Apple platforms can). So the browser silently fails to paint the thumbnail while JPGs work fine. You need to convert HEIC to JPEG/PNG somewhere in the pipeline before it hits an `<img src>`.

Here's how to fix it, depending on where the conversion should happen:

**Option A — Convert on a Node/server backend (best if you have one)**

- Use `sharp` (with libheif support) to generate a JPEG thumbnail from the HEIC file when the folder is scanned or on first request, then cache it (e.g., `thumbnails/photo.heic.jpg`).
- Note: the standard `sharp` npm build often does **not** include HEIC input support out of the box (licensing reasons) — you may need `sharp` built against `libheif`, or use the `heic-convert` package (pure JS, uses libheif via WASM) instead: `npm install heic-convert`.
- Flow: on server, detect `.heic`/`.heif` extension → run `heic-convert` or `sharp` → write a `.jpg` thumbnail → serve that JPG's URL to React instead of the raw HEIC path.
- This is the most reliable approach and keeps your React component completely unaware of HEIC — it just always gets a JPG URL.

**Option B — Convert client-side in the browser (no backend, or static hosting)**

- Use `heic2any` (npm package, WASM-based): `npm install heic2any`.
- In your thumbnail component, detect the `.heic` extension, fetch the file as a `Blob`, run it through `heic2any({ blob, toType: "image/jpeg" })`, then `URL.createObjectURL()` the result and use that as the `<img src>`.
- Downsides: heavier bundle (WASM), slower per-image, and you're doing full-resolution decoding client-side just to show a thumbnail — fine for a handful of images, painful for a large folder.

**Option C — Convert once, offline/at ingest time**

- If the folder is something you control (e.g., a photos directory synced from your iPhone), just batch-convert with `sips` (macOS built-in), `ImageMagick` (`magick photo.heic photo.jpg`), or a small script, and store JPG thumbnails alongside the HEIC originals. Simplest fix if this isn't a live upload pipeline.

**Which one fits you** depends on your setup — is this a Node/Express (or Next.js API route) backend reading the folder off disk, a purely client-side app (browser File System Access API or `<input type="file">`), or something like Electron? If you tell me that, I can give you the exact code to drop into your thumbnail component/server route.
