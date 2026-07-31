#!/usr/bin/env python3
"""Process an external generated icon into Omnitunes app icon assets.

Usage:
  python scripts/process-icon.py "C:\path\to\generated.png"

Outputs:
  build/icon.png
  build/icon.ico
  web/public/favicon-32x32.png
  web/public/apple-touch-icon.png
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "build"
PUBLIC = ROOT / "web" / "public"
OUT.mkdir(exist_ok=True)
PUBLIC.mkdir(exist_ok=True)

CANVAS = 1024
RADIUS = 220


def squircle_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def process(source_path: Path) -> Image.Image:
    img = Image.open(source_path).convert("RGBA")
    # Ensure square canvas
    img = img.resize((CANVAS, CANVAS), Image.Resampling.LANCZOS)

    # Apply a squircle mask so corners become transparent (clean on any background)
    masked = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    mask = squircle_mask(CANVAS, RADIUS)
    masked.paste(img, (0, 0), mask)
    return masked


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python scripts/process-icon.py <path-to-generated-icon.png>")
        sys.exit(1)

    source = Path(sys.argv[1]).resolve()
    if not source.exists():
        print(f"Source not found: {source}")
        sys.exit(1)

    master = process(source)
    master.save(OUT / "icon.png", "PNG")

    # Windows ICO with standard sizes (Pillow resizes the master internally)
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    master.save(OUT / "icon.ico", "ICO", sizes=[(s, s) for s in ico_sizes])

    # Web icons
    master.resize((32, 32), Image.Resampling.LANCZOS).save(PUBLIC / "favicon-32x32.png", "PNG")
    master.resize((180, 180), Image.Resampling.LANCZOS).save(PUBLIC / "apple-touch-icon.png", "PNG")

    print("Processed icon assets:")
    for f in [OUT / "icon.png", OUT / "icon.ico", PUBLIC / "favicon-32x32.png", PUBLIC / "apple-touch-icon.png"]:
        print(f"  {f.relative_to(ROOT)} ({f.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
