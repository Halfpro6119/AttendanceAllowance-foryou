"""
Regenerate favicon PNGs and favicon.ico from the same source as the site header logo
(supabase/Public/AA-foryou logo.jpeg) so Google Search favicons match the brand.

Run from repo root: python scripts/generate-favicons-from-logo.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "supabase" / "Public" / "AA-foryou logo.jpeg"
# Match site background cream (--bg-cream)
BG = (242, 249, 245)


def letterbox_square(src: Image.Image, size: int) -> Image.Image:
    src = src.convert("RGBA")
    w, h = src.size
    scale = min(size / w, size / h)
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (size, size), BG)
    x = (size - nw) // 2
    y = (size - nh) // 2
    if resized.mode == "RGBA":
        canvas.paste(resized, (x, y), resized)
    else:
        canvas.paste(resized, (x, y))
    return canvas


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"Missing source logo: {SRC}")

    img = Image.open(SRC)

    # Sizes used by HTML + Google
    letterbox_square(img, 48).save(ROOT / "favicon-48.png", optimize=True)
    letterbox_square(img, 192).save(ROOT / "favicon.png", optimize=True)
    letterbox_square(img, 180).save(ROOT / "apple-touch-icon.png", optimize=True)

    # Multi-size ICO for crawlers that request /favicon.ico
    ico_sizes = [16, 32, 48]
    ico_images = [letterbox_square(img, s) for s in ico_sizes]
    ico_images[0].save(
        ROOT / "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=ico_images[1:],
    )

    print(f"Wrote favicon-48.png, favicon.png, apple-touch-icon.png, favicon.ico from {SRC.name}")


if __name__ == "__main__":
    main()
