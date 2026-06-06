"""Post-process generated images: resize, trim, hash filename."""

from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image


def content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:8]


def normalize_image(
    src: Path,
    dst: Path,
    *,
    width: int,
    height: int,
    remove_near_black_bg: bool = False,
) -> str:
    """Resize to target dimensions. Returns content hash used in filename."""
    raw = src.read_bytes()
    digest = content_hash(raw)

    img = Image.open(src).convert("RGBA")
    img = img.resize((width, height), Image.Resampling.LANCZOS)

    if remove_near_black_bg:
        pixels = img.load()
        w, h = img.size
        for y in range(h):
            for x in range(w):
                r, g, b, a = pixels[x, y]
                if r < 24 and g < 24 and b < 32:
                    pixels[x, y] = (r, g, b, 0)

    dst.parent.mkdir(parents=True, exist_ok=True)
    stem = dst.stem.split(".")[0] if "." in dst.stem else dst.stem
    out = dst.parent / f"{stem}.{digest}.png"
    img.save(out, format="PNG", optimize=True)
    return digest
