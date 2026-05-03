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
    if category == "armor":
        return {
            "base":        REPO_ROOT / "output" / "imagegen" / "armor" / "base",
            "square_dir":  REPO_ROOT / "assets" / "armor",
        }
    if category == "gear":
        return {
            "base":        REPO_ROOT / "output" / "imagegen" / "gear" / "base",
            "square_dir":  REPO_ROOT / "assets" / "gear",
        }
    if category == "mutations":
        return {
            "base":        REPO_ROOT / "output" / "imagegen" / "mutations" / "base",
            "square_dir":  REPO_ROOT / "assets" / "mutations",
        }
    if category == "sample-actors":
        # 0.14.x — sample-actors render to portrait+token like monsters
        # but write to assets/actors/ to keep them separate.
        return {
            "base":         REPO_ROOT / "output" / "imagegen" / "actors" / "base",
            "portrait_dir": REPO_ROOT / "assets" / "actors" / "portraits",
            "token_dir":    REPO_ROOT / "assets" / "actors" / "tokens",
        }
    if category == "cryptic-alliances":
        # 0.14.19 — alliance banners render as a single full-frame square
        # image (no transparent trim, no token mask). Use the
        # `banner-square` shape (added below).
        return {
            "base":        REPO_ROOT / "output" / "imagegen" / "cryptic-alliances" / "base",
            "square_dir":  REPO_ROOT / "assets" / "cryptic-alliances",
        }
    raise SystemExit(f"Unknown category: {category!r}")


def trimmed_bounds(image: Image.Image):
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        return bbox
    return (0, 0, image.width, image.height)


def has_meaningful_alpha(image: Image.Image) -> bool:
    """0.14.19 — return True when the source PNG carries a real alpha
    channel with transparent pixels (gpt-image-1.5 + transparent flow).
    Returns False for opaque RGB-or-RGBA-with-all-255-alpha sources
    (gpt-image-2 default), which routes through the new opaque flow
    that does a center-crop + circular mask instead of an alpha-trim."""
    if image.mode not in ("RGBA", "LA"):
        return False
    extrema = image.getchannel("A").getextrema()
    if not extrema:
        return False
    return extrema[0] < 250  # tolerate a few near-opaque edge pixels


def _corner_samples(image: Image.Image, inset: int = 4):
    """Return RGB tuples sampled from the four corners (slightly inset
    so we don't pick up JPEG artefacts on the very edge)."""
    w, h = image.size
    coords = [
        (inset, inset),
        (w - inset - 1, inset),
        (inset, h - inset - 1),
        (w - inset - 1, h - inset - 1)
    ]
    return [image.getpixel(c)[:3] for c in coords]


def _color_distance(a, b) -> float:
    """Euclidean RGB distance, returning 0..~441 (3-channel max)."""
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


def detect_flat_backdrop(image: Image.Image, max_corner_spread: float = 22.0):
    """0.14.19 — return the average RGB of the source's four corners
    when they're consistent (within `max_corner_spread` Euclidean
    distance of each other), or None when the corners disagree (true
    scene image, e.g., an alliance banner). The opaque-source robot
    prompt asks the model for a flat medium-gray backdrop, so the
    corners should match closely; banners explicitly show different
    content in each corner and won't pass this gate."""
    rgb = image.convert("RGB")
    samples = _corner_samples(rgb)
    avg = (
        sum(s[0] for s in samples) / 4,
        sum(s[1] for s in samples) / 4,
        sum(s[2] for s in samples) / 4
    )
    spread = max(_color_distance(s, avg) for s in samples)
    if spread > max_corner_spread:
        return None
    return tuple(round(c) for c in avg)


def extract_subject_from_flat_bg(image: Image.Image, bg_rgb,
                                  tolerance: float = 36.0,
                                  feather_falloff: float = 18.0) -> Image.Image:
    """0.14.19 — turn a flat-bg opaque source into RGBA with the
    backdrop pixels alpha-zeroed, so the result can flow through the
    same alpha-aware renderer the existing assets use.

    Uses a soft band: pixels within `tolerance` of the backdrop go
    fully transparent; pixels within `tolerance + feather_falloff`
    fade linearly. Anything farther stays fully opaque. Keeps subject
    edges clean without halos.
    """
    rgb = image.convert("RGB")
    pixels = list(rgb.getdata())
    alpha = bytearray(len(pixels))
    bg_r, bg_g, bg_b = bg_rgb
    for idx, (r, g, b) in enumerate(pixels):
        dist = ((r - bg_r) ** 2 + (g - bg_g) ** 2 + (b - bg_b) ** 2) ** 0.5
        if dist <= tolerance:
            alpha[idx] = 0
        elif dist >= tolerance + feather_falloff:
            alpha[idx] = 255
        else:
            t = (dist - tolerance) / feather_falloff
            alpha[idx] = int(round(t * 255))
    rgba = rgb.convert("RGBA")
    alpha_band = Image.frombytes("L", rgb.size, bytes(alpha))
    rgba.putalpha(alpha_band)
    return rgba


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
    """Dispatch path:
      1. Source already has real transparency (gpt-image-1.5 + alpha
         flag) → existing _render_portrait_alpha.
      2. Source is opaque BUT has a flat uniform backdrop (gpt-image-2
         + the new flat-gray prompt) → extract backdrop to alpha →
         _render_portrait_alpha for the same warm-tan radial
         composition the existing monsters use.
      3. Source is opaque with mixed corners (true scene, e.g., an
         alliance banner) → _render_portrait_opaque, full source as-is.
    """
    image = Image.open(source).convert("RGBA")
    if has_meaningful_alpha(image):
        _render_portrait_alpha(image, target)
        return
    bg = detect_flat_backdrop(image)
    if bg is not None:
        _render_portrait_alpha(extract_subject_from_flat_bg(image, bg), target)
        return
    _render_portrait_opaque(image, target)


def _render_portrait_alpha(image: Image.Image, target: Path):
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


def _render_portrait_opaque(image: Image.Image, target: Path):
    """0.14.19 — opaque-source portrait flow: the gpt-image-2 source IS
    a portrait. Resize to PORTRAIT_SIZE square and save. The model's
    framing (subject centered, full-frame composition) carries through
    untouched."""
    rgb = image.convert("RGB")
    resized = rgb.resize((PORTRAIT_SIZE, PORTRAIT_SIZE), Image.Resampling.LANCZOS)
    target.parent.mkdir(parents=True, exist_ok=True)
    resized.save(target, format="PNG", optimize=True)


def render_token(source: Path, target: Path):
    """Same dispatch tree as render_portrait but for tokens.
    Flat-bg gpt-image-2 sources flow through extraction so they hit
    the green-disc alpha flow used by the existing tokens, keeping the
    visual identity consistent across new and old monster art."""
    image = Image.open(source).convert("RGBA")
    if has_meaningful_alpha(image):
        _render_token_alpha(image, target)
        return
    bg = detect_flat_backdrop(image)
    if bg is not None:
        _render_token_alpha(extract_subject_from_flat_bg(image, bg), target)
        return
    _render_token_opaque(image, target)


def _render_token_alpha(image: Image.Image, target: Path):
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


def _render_token_opaque(image: Image.Image, target: Path):
    """0.14.19 — opaque-source token flow: take a filled-frame source,
    resize to TOKEN_SIZE, mask to a circle (alpha=0 outside), and
    overlay the same gold/brown ring used by the alpha flow so the
    visual identity stays consistent. The model's centered-subject
    composition does the work the alpha-trim used to do."""
    rgb = image.convert("RGB").resize((TOKEN_SIZE, TOKEN_SIZE),
                                       Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (TOKEN_SIZE, TOKEN_SIZE), (0, 0, 0, 0))

    mask = Image.new("L", (TOKEN_SIZE, TOKEN_SIZE), 0)
    draw_mask = ImageDraw.Draw(mask)
    draw_mask.ellipse((26, 26, TOKEN_SIZE - 26, TOKEN_SIZE - 26), fill=255)

    rgba = rgb.convert("RGBA")
    rgba.putalpha(mask)
    canvas.alpha_composite(rgba)

    ring = ImageDraw.Draw(canvas)
    ring.ellipse((18, 18, TOKEN_SIZE - 18, TOKEN_SIZE - 18),
                 outline=(188, 154, 88, 255), width=14)
    ring.ellipse((32, 32, TOKEN_SIZE - 32, TOKEN_SIZE - 32),
                 outline=(77, 59, 33, 220), width=4)

    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(target, format="PNG", optimize=True)


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


BANNER_SQUARE_SIZE = 768


def render_banner_square(source: Path, target: Path):
    """0.14.19 — emit a single 768² PNG suitable for a JournalEntry
    page header. Unlike `render_square_icon`, this preserves the full
    composed scene: no transparency trim, no centering — just resize
    the original to 768x768 with high-quality resampling. Used by the
    cryptic-alliances category where each image IS the banner."""
    image = Image.open(source).convert("RGB")
    resized = image.resize((BANNER_SQUARE_SIZE, BANNER_SQUARE_SIZE),
                           Image.Resampling.LANCZOS)
    target.parent.mkdir(parents=True, exist_ok=True)
    resized.save(target, format="PNG", optimize=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--category", required=True,
                        choices=["monsters", "weapons", "armor", "gear",
                                 "mutations", "robots", "sample-actors",
                                 "cryptic-alliances"])
    parser.add_argument("--shape", required=True,
                        choices=["portrait-token", "square-icon",
                                 "banner-square"])
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
        elif args.shape == "banner-square":
            render_banner_square(source, paths["square_dir"] / source.name)
        generated += 1
        print(f"Rendered {source.name}")

    suffix = {
        "portrait-token": " (portrait + token)",
        "square-icon":    " (square icon)",
        "banner-square":  " (banner square)"
    }.get(args.shape, "")
    print(f"Generated {generated} asset{'' if generated == 1 else 's'}{suffix}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
