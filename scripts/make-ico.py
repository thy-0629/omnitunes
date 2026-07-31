#!/usr/bin/env python3
"""Create a proper multi-size Windows ICO from a PNG with alpha.

The Pillow ICO writer only stores one frame; this script writes PNG-compressed
frames for each requested size using the standard ICO container format.
"""

from __future__ import annotations

import struct
from io import BytesIO
from pathlib import Path

from PIL import Image


def make_ico(png_path: Path, ico_path: Path, sizes: list[int]) -> None:
    master = Image.open(png_path).convert("RGBA")

    frames: list[bytes] = []
    for size in sizes:
        im = master.resize((size, size), Image.Resampling.LANCZOS)
        # Save each frame as a PNG in memory
        buf = BytesIO()
        im.save(buf, format="PNG")
        frames.append(buf.getvalue())

    count = len(frames)
    # ICO header: reserved=0, type=1, count
    header = struct.pack("<HHH", 0, 1, count)

    # Directory offset starts after header + entries
    offset = 6 + 16 * count
    entries = bytearray()
    data_blocks = bytearray()

    for size, frame_bytes in zip(sizes, frames):
        # Width/height are bytes; 0 means 256
        w = size if size < 256 else 0
        h = size if size < 256 else 0
        # Color count 0, reserved 0, planes 1, bpp 32, size, offset
        entry = struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(frame_bytes), offset)
        entries.extend(entry)
        data_blocks.extend(frame_bytes)
        offset += len(frame_bytes)

    ico_path.write_bytes(header + entries + data_blocks)


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python make-ico.py <input.png> <output.ico>")
        sys.exit(1)
    make_ico(Path(sys.argv[1]), Path(sys.argv[2]), [16, 24, 32, 48, 64, 128, 256])
    print(f"Created {sys.argv[2]} with {7} frames")
