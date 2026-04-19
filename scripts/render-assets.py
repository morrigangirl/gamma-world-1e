#!/usr/bin/env python3
"""
Rasterize base PNGs (from generate-art.py) into the final Foundry assets.

Two shapes supported:
    portrait-token : emits a 1024² portrait + a 512² circle-masked token,
                     matching the existing monster asset layout. Used by
                     the `monsters` and `robots` categories.
    square-icon    : emits a single 512² square PNG with the subject
                     trimmed + centered. Used by `weapons` and
                     `mutations` categories.

Usage:
    python3 scripts/render-assets.py --category monsters --shape portrait-token
    python3 scripts/render-assets.py --category weapons --shape square-icon
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


REPO_ROOT = Path(__file__).resolve().parent.parent

PORTRAIT_SIZE = 1024
TOKEN_SIZE = 512
SQUARE_ICON_SIZE = 512


def category_paths(category: str) -> dict:
    if category in ("monsters", "robots"):
        return {
            "base":         REPO_ROOT / "output" / "imagegen" / "monsters" / "base",
            "portrait_dir": REPO_ROOT / "assets" / "monsters" / "portraits",
            "token_dir":    REPO_ROOT / "assets" / "monsters" / "tokens",
        }
    if category == "weapons":
        return {
            "base":        REPO_ROOT / "output" / "imagegen" / "weapons" / "base",
            "square_dir":  REPO_ROOT / "assets" / "weapons",
        }
    if category == "mutations":
        return {
            "base":        REPO_ROOT / "output" / "imagegen" / "mutations" / "base",
            "square_dir":  REPO_ROOT / "assets" / "mutations",
        }
    raise SystemExit(f"Unknown category: {category!r}")


def trimmed_bounds(image: Image.Image):
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        return bbox
    return (0, 0, image.width, image.height)


def fit_image(image: Image.Image, box_width: int, box_height: int) -> Image.Image:
    scaled = image.copy()
    scaled.thumbnail((box_width, box_height), Image.Resampling.LANCZOS)
    return scaled


def radial_background(size: int, inner_rgb, outer_rgb) -> Image.Image:
    bg = Image.new("RGBA", (size, size))
    cx = cy = size / 2
    max_dist = math.sqrt((cx ** 2) + (cy ** 2))
    pixels = []
    for y in range(size):
        for x in range(size):
            dist = math.sqrt(((x - cx) ** 2) + ((y - cy) ** 2)) / max_dist
            dist = min(1.0, max(0.0, dist))
            r = int(inner_rgb[0] + (outer_rgb[0] - inner_rgb[0]) * dist)
            g = int(inner_rgb[1] + (outer_rgb[1] - inner_rgb[1]) * dist)
            b = int(inner_rgb[2] + (outer_rgb[2] - inner_rgb[2]) * dist)
            pixels.append((r, g, b, 255))
    bg.putdata(pixels)
    return bg


def add_shadow(base: Image.Image, subject: Image.Image, x: int, y: int,
               blur: int = 24, opacity: int = 110):
    alpha = subject.getchannel("A")
    shadow = Image.new("RGBA", subject.size, (0, 0, 0, 0))
    shadow.putalpha(alpha.point(lambda value: min(opacity, value // 2)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=blur))
    base.alpha_composite(shadow, (x, y + 16))


def render_portrait(source: Path, target: Path):
    image = Image.open(source).convert("RGBA")
    cropped = image.crop(trimmed_bounds(image))
    fitted = fit_image(cropped, 760, 760)

    canvas = radial_background(PORTRAIT_SIZE, (120, 110, 90), (54, 47, 38))
    vignette = Image.new("RGBA", (PORTRAIT_SIZE, PORTRAIT_SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(vignette).ellipse(
        (96, 96, PORTRAIT_SIZE - 96, PORTRAIT_SIZE - 96),
        fill=(232, 218, 176, 40)
    )
    vignette = vignette.filter(ImageFilter.GaussianBlur(radius=48))
    canvas.alpha_composite(vignette)

    x = (PORTRAIT_SIZE - fitted.width) // 2
    y = PORTRAIT_SIZE - fitted.height - 120
    add_shadow(canvas, fitted, x, y)
    canvas.alpha_composite(fitted, (x, y))

    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(target)


def render_token(source: Path, target: Path):
    image = Image.open(source).convert("RGBA")
    cropped = image.crop(trimmed_bounds(image))
    fitted = fit_image(cropped, 360, 360)

    canvas = Image.new("RGBA", (TOKEN_SIZE, TOKEN_SIZE), (0, 0, 0, 0))
    circle_bg = radial_background(TOKEN_SIZE, (102, 118, 96), (33, 38, 35))
    mask = Image.new("L", (TOKEN_SIZE, TOKEN_SIZE), 0)
    draw_mask = ImageDraw.Draw(mask)
    draw_mask.ellipse((26, 26, TOKEN_SIZE - 26, TOKEN_SIZE - 26), fill=255)

    clipped_bg = Image.new("RGBA", (TOKEN_SIZE, TOKEN_SIZE), (0, 0, 0, 0))
    clipped_bg.paste(circle_bg, (0, 0), mask)
    canvas.alpha_composite(clipped_bg)

    x = (TOKEN_SIZE - fitted.width) // 2
    y = TOKEN_SIZE - fitted.height - 54
    add_shadow(canvas, fitted, x, y, blur=14, opacity=96)

    subject_layer = Image.new("RGBA", (TOKEN_SIZE, TOKEN_SIZE), (0, 0, 0, 0))
    subject_layer.alpha_composite(fitted, (x, y))
    subject_layer.putalpha(ImageChops.multiply(subject_layer.getchannel("A"), mask))
    canvas.alpha_composite(subject_layer)

    ring = ImageDraw.Draw(canvas)
    ring.ellipse((18, 18, TOKEN_SIZE - 18, TOKEN_SIZE - 18),
                 outline=(188, 154, 88, 255), width=14)
    ring.ellipse((32, 32, TOKEN_SIZE - 32, TOKEN_SIZE - 32),
                 outline=(77, 59, 33, 220), width=4)

    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(target)


def render_square_icon(source: Path, target: Path):
    """Emit a single 512² transparent PNG: subject trimmed, centered,
    no decorative background or token ring. Leaves the alpha channel
    intact so the icon reads against any Foundry panel shade."""
    image = Image.open(source).convert("RGBA")
    cropped = image.crop(trimmed_bounds(image))
    # Fit with a small margin so the silhouette doesn't kiss the edges.
    fitted = fit_image(cropped, SQUARE_ICON_SIZE - 24, SQUARE_ICON_SIZE - 24)
    canvas = Image.new("RGBA", (SQUARE_ICON_SIZE, SQUARE_ICON_SIZE), (0, 0, 0, 0))
    x = (SQUARE_ICON_SIZE - fitted.width) // 2
    y = (SQUARE_ICON_SIZE - fitted.height) // 2
    canvas.alpha_composite(fitted, (x, y))
    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(target)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--category", required=True,
                        choices=["monsters", "weapons", "mutations", "robots"])
    parser.add_argument("--shape", required=True,
                        choices=["portrait-token", "square-icon"])
    args = parser.parse_args()

    paths = category_paths(args.category)
    base_dir = paths["base"]
    if not base_dir.exists():
        print(f"Base art directory not found: {base_dir}", file=sys.stderr)
        return 1

    generated = 0
    for source in sorted(base_dir.glob("*.png")):
        if args.shape == "portrait-token":
            render_portrait(source, paths["portrait_dir"] / source.name)
            render_token(source, paths["token_dir"] / source.name)
        elif args.shape == "square-icon":
            render_square_icon(source, paths["square_dir"] / source.name)
        generated += 1
        print(f"Rendered {source.name}")

    suffix = " (portrait + token)" if args.shape == "portrait-token" else " (square icon)"
    print(f"Generated {generated} asset{'' if generated == 1 else 's'}{suffix}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
