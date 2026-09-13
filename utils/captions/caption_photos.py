#!/usr/bin/env python3
"""
caption_photos.py

Batch-adds a per-photo text caption onto JPG/HEIC photos while preserving
resolution and EXIF metadata as closely as possible.

Usage:
    python3 caption_photos.py --input /path/to/photos --csv captions.csv --output /path/to/captioned

captions.csv format (one row per photo):
    filename,caption
    20260322_124455_photo-3855_singular_display_fullPicture.heic,"Sunset at the pier"
    20260323_151805_IMG_0753.HEIC,"Grandma's birthday"
    20260323_122709_PXL_20260323_162709236.MP.jpg,"Morning hike"

Notes:
- Input files are never modified; outputs go to --output.
- HEIC/HEIF inputs are read via pillow-heif; outputs are written as
  high-quality JPEG (quality=95, no chroma subsampling) since that is the
  most broadly compatible/reliable path for burning text into an image and
  re-uploading to Google Photos. This means HEIC sources get one JPEG
  re-encode -- unavoidable if you want visible text baked into the pixels --
  but no resizing/downscaling is ever done, and quality=95/subsampling=0
  keeps that single re-encode visually lossless for virtually all viewing.
- EXIF orientation is applied to the pixels (so the image is stored
  "right side up") and the orientation tag is then cleared, so viewers
  don't double-rotate it. Other EXIF (date/time, camera model, GPS if
  present) is preserved and copied to the output.
"""

import argparse
import csv
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps
import pillow_heif
import piexif

pillow_heif.register_heif_opener()

SUPPORTED_EXTS = {".heic", ".jpg", ".jpeg"}


def load_captions(csv_path: Path) -> dict:
    captions = {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            fname = row["filename"].strip()
            caption = row["caption"].strip()
            if fname:
                captions[fname] = caption
    return captions


def get_font(size: int) -> ImageFont.FreeTypeFont:
    # Try a few common bold truetype fonts; fall back to PIL's default bitmap font.
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "C:\\Windows\\Fonts\\arialbd.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def clean_exif_bytes(exif_dict: dict) -> bytes:
    # Clear orientation (tag 274) since we've already physically rotated
    # the pixels via exif_transpose -- leaving it in would cause viewers
    # to rotate an already-correct image a second time.
    if "0th" in exif_dict and piexif.ImageIFD.Orientation in exif_dict["0th"]:
        del exif_dict["0th"][piexif.ImageIFD.Orientation]
    try:
        return piexif.dump(exif_dict)
    except Exception:
        return b""


def add_caption(img: Image.Image, text: str) -> Image.Image:
    img = img.convert("RGB")
    w, h = img.size

    # Font size scales with image width so it reads consistently whether
    # the source is an iPhone 17 Pro Max shot or a lower-res glasses photo.
    font_size = max(28, int(w * 0.028))
    font = get_font(font_size)

    draw = ImageDraw.Draw(img, "RGBA")
    margin = int(w * 0.02)
    padding = int(font_size * 0.4)

    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    box_x0 = margin
    box_y0 = h - margin - text_h - 2 * padding
    box_x1 = margin + text_w + 2 * padding
    box_y1 = h - margin

    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    odraw.rounded_rectangle(
        [box_x0, box_y0, box_x1, box_y1], radius=int(padding * 0.6), fill=(0, 0, 0, 140)
    )
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")

    draw = ImageDraw.Draw(img)
    draw.text(
        (box_x0 + padding - bbox[0], box_y0 + padding - bbox[1]),
        text,
        font=font,
        fill=(255, 255, 255, 255),
    )
    return img


def process_file(src: Path, caption: str, out_dir: Path) -> None:
    img = Image.open(src)

    # Grab EXIF before any transform, if present.
    exif_bytes = b""
    exif_dict = None
    raw_exif = img.info.get("exif")
    if raw_exif:
        try:
            exif_dict = piexif.load(raw_exif)
        except Exception:
            exif_dict = None

    # Bake in EXIF orientation as actual pixel rotation so the caption is
    # drawn the right way up, matching what you see in Google Photos.
    img = ImageOps.exif_transpose(img)

    img = add_caption(img, caption)

    if exif_dict is not None:
        exif_bytes = clean_exif_bytes(exif_dict)

    out_path = out_dir / (src.stem + ".jpg")
    save_kwargs = {"quality": 95, "subsampling": 0, "optimize": True}
    if exif_bytes:
        save_kwargs["exif"] = exif_bytes
    img.save(out_path, "JPEG", **save_kwargs)
    print(f"  {src.name} -> {out_path.name}  ({img.size[0]}x{img.size[1]})")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", required=True, help="Folder containing source photos")
    ap.add_argument("--csv", required=True, help="CSV with filename,caption columns")
    ap.add_argument("--output", required=True, help="Folder to write captioned JPEGs into")
    args = ap.parse_args()

    in_dir = Path(args.input)
    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    captions = load_captions(Path(args.csv))
    if not captions:
        print("No captions found in CSV.", file=sys.stderr)
        sys.exit(1)

    missing = []
    print(f"Processing {len(captions)} photo(s)...")
    for fname, caption in captions.items():
        src = in_dir / fname
        if not src.exists():
            missing.append(fname)
            continue
        if src.suffix.lower() not in SUPPORTED_EXTS:
            print(f"  Skipping unsupported file type: {fname}")
            continue
        process_file(src, caption, out_dir)

    if missing:
        print("\nNot found in input folder:", file=sys.stderr)
        for m in missing:
            print(f"  {m}", file=sys.stderr)

    print(f"\nDone. Captioned photos are in: {out_dir}")


if __name__ == "__main__":
    main()
