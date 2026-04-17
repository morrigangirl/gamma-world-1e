#!/usr/bin/env python3
from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


REPO_ROOT = Path(__file__).resolve().parent.parent
BASE_DIR = REPO_ROOT / "output" / "imagegen" / "monsters" / "base"
PORTRAIT_DIR = REPO_ROOT / "assets" / "monsters" / "portraits"
TOKEN_DIR = REPO_ROOT / "assets" / "monsters" / "tokens"

PORTRAIT_SIZE = 1024
TOKEN_SIZE = 512


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


def add_shadow(base: Image.Image, subject: Image.Image, x: int, y: int, blur: int = 24, opacity: int = 110):
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
    ImageDraw.Draw(vignette).ellipse((96, 96, PORTRAIT_SIZE - 96, PORTRAIT_SIZE - 96), fill=(232, 218, 176, 40))
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
    ring.ellipse((18, 18, TOKEN_SIZE - 18, TOKEN_SIZE - 18), outline=(188, 154, 88, 255), width=14)
    ring.ellipse((32, 32, TOKEN_SIZE - 32, TOKEN_SIZE - 32), outline=(77, 59, 33, 220), width=4)

    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(target)


def main():
    if not BASE_DIR.exists():
        print(f"Base art directory not found: {BASE_DIR}", file=sys.stderr)
        return 1

    generated = 0
    for source in sorted(BASE_DIR.glob("*.png")):
        portrait_target = PORTRAIT_DIR / source.name
        token_target = TOKEN_DIR / source.name
        render_portrait(source, portrait_target)
        render_token(source, token_target)
        generated += 1
        print(f"Rendered {source.name}")

    print(f"Generated {generated} portrait(s) and token(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
