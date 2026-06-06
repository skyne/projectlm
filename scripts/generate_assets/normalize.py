"""Post-process generated images: resize, trim, hash filename."""

from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image


def content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:8]


def _is_checker(pixels, x: int, y: int, w: int, h: int) -> bool:
    """Detect grey/white checkerboard fake-transparency from image models."""
    if x + 1 >= w or y + 1 >= h:
        return False
    a = pixels[x, y][:3]
    b = pixels[x + 1, y][:3]
    c = pixels[x, y + 1][:3]
    vals = [a, b, c]
    lights = sum(1 for r, g, bl in vals if r > 200 and g > 200 and bl > 200)
    darks = sum(1 for r, g, bl in vals if r < 80 and g < 80 and bl < 80)
    return lights >= 1 and darks >= 1


def _key_background(pixels, x: int, y: int) -> bool:
    r, g, b, a = pixels[x, y]
    if a < 8:
        return True
    if r < 24 and g < 24 and b < 32:
        return True
    if r > 210 and g > 210 and b > 210:
        return True
    if abs(r - g) < 12 and abs(g - b) < 12 and 80 < r < 200:
        return True
    return False


def remove_keyed_background(img: Image.Image) -> Image.Image:
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            if _key_background(pixels, x, y) or _is_checker(pixels, x, y, w, h):
                r, g, b, _ = pixels[x, y]
                pixels[x, y] = (r, g, b, 0)
    return img


def fit_on_canvas(
    img: Image.Image,
    width: int,
    height: int,
    *,
    bg: tuple[int, int, int, int] = (0, 0, 0, 0),
) -> Image.Image:
    """Scale to fit inside width×height without distortion; center on canvas."""
    src_w, src_h = img.size
    scale = min(width / src_w, height / src_h)
    new_w = max(1, round(src_w * scale))
    new_h = max(1, round(src_h * scale))
    resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (width, height), bg)
    ox = (width - new_w) // 2
    oy = (height - new_h) // 2
    canvas.paste(resized, (ox, oy), resized)
    return canvas


def normalize_image(
    src: Path,
    dst: Path,
    *,
    width: int,
    height: int,
    remove_background: bool = False,
    stretch: bool = False,
    mode: str = "fit",
) -> str:
    """Fit, stretch, or sprite-tight resize. Returns content hash."""
    raw = src.read_bytes()
    digest = content_hash(raw)

    img = Image.open(src).convert("RGBA")
    if remove_background:
        img = remove_keyed_background(img)

    if mode == "sprite":
        img = img.resize((width, height), Image.Resampling.LANCZOS)
    elif stretch:
        img = img.resize((width, height), Image.Resampling.LANCZOS)
    else:
        img = fit_on_canvas(img, width, height)

    dst.parent.mkdir(parents=True, exist_ok=True)
    stem = dst.stem.split(".")[0] if "." in dst.stem else dst.stem
    out = dst.parent / f"{stem}.{digest}.png"
    img.save(out, format="PNG", optimize=True)
    return digest
