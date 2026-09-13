#!/usr/bin/env python3
"""
caption_single_photo.py

Adds a text caption onto a single JPG/HEIC photo and saves it with "_labelled" suffix.

Usage:
    python3 caption_single_photo.py --photo /path/to/photo.heic --caption "Your caption text"
    python3 caption_single_photo.py --photo /path/to/photo.jpg --caption "Your caption text"

Notes:
- Input file is never modified.
- Output is saved in the same folder as the original with "_labelled" suffix.
- HEIC/HEIF inputs are read via pillow-heif; outputs are written as JPEG
  (quality=95, no chroma subsampling) for broad compatibility.
- EXIF orientation is applied to the pixels and other EXIF metadata is preserved.
"""

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps
import pillow_heif
import piexif

pillow_heif.register_heif_opener()

SUPPORTED_EXTS = {".heic", ".jpg", ".jpeg"}


def get_font(size: int) -> ImageFont.FreeTypeFont:
    """Try common bold truetype fonts; fall back to PIL's default."""
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
    """Clear orientation tag since we've already rotated the pixels."""
    if "0th" in exif_dict and piexif.ImageIFD.Orientation in exif_dict["0th"]:
        del exif_dict["0th"][piexif.ImageIFD.Orientation]
    try:
        return piexif.dump(exif_dict)
    except Exception:
        return b""


def add_caption(img: Image.Image, text: str) -> Image.Image:
    """Add caption text to bottom of image with semi-transparent background."""
    img = img.convert("RGB")
    w, h = img.size

    # Scale font with image width for consistent appearance
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


def process_photo(src: Path, caption: str) -> Path:
    """Add caption to photo and save with '_labelled' suffix."""
    if not src.exists():
        raise FileNotFoundError(f"Photo not found: {src}")

    if src.suffix.lower() not in SUPPORTED_EXTS:
        raise ValueError(f"Unsupported file type: {src.suffix}. Supported: {SUPPORTED_EXTS}")

    img = Image.open(src)

    # Grab EXIF before any transform
    exif_bytes = b""
    exif_dict = None
    raw_exif = img.info.get("exif")
    if raw_exif:
        try:
            exif_dict = piexif.load(raw_exif)
        except Exception:
            exif_dict = None

    # Apply EXIF orientation as pixel rotation
    img = ImageOps.exif_transpose(img)

    # Add caption
    img = add_caption(img, caption)

    if exif_dict is not None:
        exif_bytes = clean_exif_bytes(exif_dict)

    # Save with '_labelled' suffix, always as JPEG
    out_path = src.parent / (src.stem + "_labelled.jpg")
    save_kwargs = {"quality": 95, "subsampling": 0, "optimize": True}
    if exif_bytes:
        save_kwargs["exif"] = exif_bytes

    img.save(out_path, "JPEG", **save_kwargs)
    return out_path


def main():
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--photo", required=True, help="Path to the photo file (JPG or HEIC)")
    ap.add_argument("--caption", required=True, help="Caption text to add to the photo")
    args = ap.parse_args()

    try:
        src = Path(args.photo)
        out_path = process_photo(src, args.caption)
        print(f"✅ Success!")
        print(f"   Original: {src}")
        print(f"   Captioned: {out_path}")
        print(f"   Resolution: {Image.open(out_path).size[0]}×{Image.open(out_path).size[1]}")
    except FileNotFoundError as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)
    except ValueError as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error processing photo: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
