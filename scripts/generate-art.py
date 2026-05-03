#!/usr/bin/env python3
"""
Generate base art via OpenAI's image endpoint for one of four asset
categories: monsters, weapons, mutations, robots. Skips any slug whose
final asset is already on disk so re-runs are free.

Pipeline per category:
    1. Read prompts JSONL from `tmp/imagegen/<category>-prompts.jsonl`
       (produced by `npm run build:<category>-prompts`).
    2. Write a 1024x1024 PNG via the per-category model
       (icon categories use gpt-image-1.5 + transparent background;
       banner categories use gpt-image-2 + opaque background)
       to `output/imagegen/<category>/base/<slug>.png`.
    3. Skip any slug whose FINAL asset (portrait+token for
       monsters/robots, single square for weapons/mutations,
       banner-square for cryptic-alliances) already exists under
       `assets/`.

After this runs, the companion `render-assets.py` script rasterizes the
base PNGs into the final Foundry assets.

Env:
    OPENAI_API_KEY — required (unless --dry-run).

Usage:
    python3 scripts/generate-art.py --category monsters
    python3 scripts/generate-art.py --category weapons --only laser-pistol
    python3 scripts/generate-art.py --category mutations --force
    python3 scripts/generate-art.py --category robots --dry-run
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
from pathlib import Path
from typing import Iterable

try:
    from openai import OpenAI
except ImportError:
    print("The `openai` Python package is required. Install with: pip install openai",
          file=sys.stderr)
    raise SystemExit(1)


REPO_ROOT = Path(__file__).resolve().parent.parent
# 0.14.19 — per-category model. gpt-image-2 is the current default but
# does NOT support `background='transparent'`, which the icon pipeline
# (monsters / robots / weapons / mutations / armor / gear / sample-actors)
# relies on for trim-and-center rendering. Those categories stay on
# gpt-image-1.5 until the renderer learns saliency-based trimming.
# Banner categories (cryptic-alliances) want opaque output anyway and
# use gpt-image-2.
MODEL_BY_CATEGORY = {
    # 0.14.19 — robots use gpt-image-2 paired with the new opaque-source
    # render flow (`render_token_opaque` etc.). The opaque flow does
    # center-crop + circular mask in render-assets.py rather than
    # depending on the model's transparent background. Other icon
    # categories (weapons/armor/etc.) keep gpt-image-1.5 because they
    # depend on the alpha-trim subject silhouette for square-icon
    # layout — switching them would re-render to a circle-cropped icon
    # which doesn't fit the square-icon visual style.
    "monsters":          "gpt-image-1.5",
    "robots":            "gpt-image-2",
    "weapons":           "gpt-image-1.5",
    "armor":             "gpt-image-1.5",
    "gear":              "gpt-image-1.5",
    "mutations":         "gpt-image-1.5",
    "sample-actors":     "gpt-image-1.5",
    "cryptic-alliances": "gpt-image-2"
}
DEFAULT_MODEL = "gpt-image-2"
IMAGE_SIZE = "1024x1024"
INTER_CALL_DELAY_SECONDS = 1.5


def category_paths(category: str) -> dict:
    """Return the set of paths each category reads from / writes to."""
    if category == "monsters":
        return {
            "prompts": REPO_ROOT / "tmp" / "imagegen" / "monster-prompts.jsonl",
            "base":    REPO_ROOT / "output" / "imagegen" / "monsters" / "base",
            "finals":  [
                REPO_ROOT / "assets" / "monsters" / "portraits",
                REPO_ROOT / "assets" / "monsters" / "tokens",
            ],
        }
    if category == "robots":
        # Robots render to the same portrait+token layout as monsters — the
        # monster asset builder picks them up automatically.
        return {
            "prompts": REPO_ROOT / "tmp" / "imagegen" / "robot-prompts.jsonl",
            "base":    REPO_ROOT / "output" / "imagegen" / "monsters" / "base",
            "finals":  [
                REPO_ROOT / "assets" / "monsters" / "portraits",
                REPO_ROOT / "assets" / "monsters" / "tokens",
            ],
        }
    if category == "weapons":
        return {
            "prompts": REPO_ROOT / "tmp" / "imagegen" / "weapon-prompts.jsonl",
            "base":    REPO_ROOT / "output" / "imagegen" / "weapons" / "base",
            "finals":  [REPO_ROOT / "assets" / "weapons"],
        }
    if category == "armor":
        # 0.14.x — armor uses the same square-icon flow as weapons but
        # writes to its own assets/armor/ directory.
        return {
            "prompts": REPO_ROOT / "tmp" / "imagegen" / "armor-prompts.jsonl",
            "base":    REPO_ROOT / "output" / "imagegen" / "armor" / "base",
            "finals":  [REPO_ROOT / "assets" / "armor"],
        }
    if category == "gear":
        # 0.14.x — gear uses the same square-icon flow as weapons. One
        # large category covering containers, medical, vehicles, tools,
        # rations, communications, explosives, and misc artifacts.
        return {
            "prompts": REPO_ROOT / "tmp" / "imagegen" / "gear-prompts.jsonl",
            "base":    REPO_ROOT / "output" / "imagegen" / "gear" / "base",
            "finals":  [REPO_ROOT / "assets" / "gear"],
        }
    if category == "mutations":
        return {
            "prompts": REPO_ROOT / "tmp" / "imagegen" / "mutation-prompts.jsonl",
            "base":    REPO_ROOT / "output" / "imagegen" / "mutations" / "base",
            "finals":  [REPO_ROOT / "assets" / "mutations"],
        }
    if category == "sample-actors":
        # 0.14.x — sample-actors render to the same portrait+token layout
        # as monsters but write to assets/actors/ to keep them separate
        # in the asset tree.
        return {
            "prompts": REPO_ROOT / "tmp" / "imagegen" / "sample-actor-prompts.jsonl",
            "base":    REPO_ROOT / "output" / "imagegen" / "actors" / "base",
            "finals":  [
                REPO_ROOT / "assets" / "actors" / "portraits",
                REPO_ROOT / "assets" / "actors" / "tokens",
            ],
        }
    if category == "cryptic-alliances":
        # 0.14.19 — square banner art for the cryptic-alliance JournalEntry
        # pages. Single-image final (no portrait/token split); the wire-up
        # script injects the rendered asset as an <img> at the top of each
        # alliance's text page content.
        return {
            "prompts": REPO_ROOT / "tmp" / "imagegen" / "cryptic-alliance-prompts.jsonl",
            "base":    REPO_ROOT / "output" / "imagegen" / "cryptic-alliances" / "base",
            "finals":  [REPO_ROOT / "assets" / "cryptic-alliances"],
        }
    raise SystemExit(f"Unknown category: {category!r}. "
                     f"Valid: monsters, weapons, armor, gear, mutations, robots, "
                     f"sample-actors, cryptic-alliances.")


def read_prompts(path: Path, category: str) -> list[dict]:
    if not path.exists():
        # 0.14.x — guidance string handles the new categories explicitly
        # (sample-actors slug doesn't suffix-strip cleanly to "sample-actor").
        guidance = {
            "monsters":          "node scripts/build-monster-art-prompts.mjs",
            "weapons":           "node scripts/build-item-art-prompts.mjs --category weapons",
            "armor":             "node scripts/build-item-art-prompts.mjs --category armor",
            "gear":              "node scripts/build-item-art-prompts.mjs --category gear",
            "mutations":         "node scripts/build-item-art-prompts.mjs --category mutations",
            "robots":            "node scripts/build-item-art-prompts.mjs --category robots",
            "sample-actors":     "node scripts/build-item-art-prompts.mjs --category sample-actors",
            "cryptic-alliances": "node scripts/build-item-art-prompts.mjs --category cryptic-alliances"
        }.get(category, f"node scripts/build-item-art-prompts.mjs --category {category}")
        raise SystemExit(
            f"Prompt JSONL not found at {path}. Run `{guidance}` first."
        )
    rows = []
    with path.open() as handle:
        for line_no, raw in enumerate(handle, start=1):
            line = raw.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise SystemExit(f"{path}:{line_no} is not valid JSON — {exc}") from exc
    return rows


def is_already_arted(slug: str, finals: list[Path]) -> bool:
    """Treat a slug as already arted if EVERY declared final asset path
    has a matching <slug>.png on disk. (Monsters need both portrait and
    token; weapons / mutations just need the single square PNG.)"""
    return all((final / f"{slug}.png").exists() for final in finals)


def needs_generation(slug: str, base_dir: Path, finals: list[Path],
                     force: bool) -> str | None:
    if force:
        return None
    base = base_dir / f"{slug}.png"
    if base.exists():
        return f"base art already present at {base.relative_to(REPO_ROOT)}"
    if is_already_arted(slug, finals):
        pretty = ", ".join(str(f.relative_to(REPO_ROOT)) for f in finals)
        return f"final assets already exist in {pretty}"
    return None


def generate_one(client: OpenAI, prompt: str, target: Path, *, model: str, transparent: bool) -> None:
    """0.14.19 — `model` and `transparent` are opt-in per category.
    gpt-image-2 does NOT support `background='transparent'`; banner
    categories (alliance headers, etc.) explicitly want an opaque
    scene. Icon categories rely on the transparent flag for the
    trim-and-center renderer, so they stay on gpt-image-1.5 until the
    renderer learns saliency-based trimming."""
    kwargs = dict(model=model, prompt=prompt, size=IMAGE_SIZE, n=1)
    if transparent:
        kwargs["background"] = "transparent"
    response = client.images.generate(**kwargs)
    image_b64 = response.data[0].b64_json
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(base64.b64decode(image_b64))


# 0.14.19 — categories whose API call should request a transparent
# background. Robots are NOT in this set: they're on gpt-image-2
# (which doesn't accept the transparent flag) and rely on the
# opaque-source token renderer added in render-assets.py. Banner
# categories (cryptic-alliances) are also opaque by design.
TRANSPARENT_CATEGORIES = frozenset({
    "monsters", "weapons", "armor", "gear", "mutations", "sample-actors"
})


def filter_by_only(rows: list[dict], only: Iterable[str]) -> list[dict]:
    wanted = {s.strip().lower() for s in only if s.strip()}
    return [r for r in rows if Path(r.get("out", "")).stem.lower() in wanted]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--category", required=True,
                        choices=["monsters", "weapons", "armor", "gear",
                                 "mutations", "robots", "sample-actors",
                                 "cryptic-alliances"],
                        help="Which asset category to generate.")
    parser.add_argument("--force", action="store_true",
                        help="Re-generate every prompt even if art already exists.")
    parser.add_argument("--only", default="",
                        help="Comma-separated list of slugs to limit the run to.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be generated without calling the API.")
    args = parser.parse_args()

    paths = category_paths(args.category)
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key and not args.dry_run:
        print("OPENAI_API_KEY is not set in the environment.", file=sys.stderr)
        return 1

    rows = read_prompts(paths["prompts"], args.category)
    if args.only:
        rows = filter_by_only(rows, args.only.split(","))

    planned = []
    skipped = []
    for row in rows:
        out_name = row.get("out")
        prompt = row.get("prompt")
        if not out_name or not prompt:
            continue
        slug = Path(out_name).stem
        reason = needs_generation(slug, paths["base"], paths["finals"], args.force)
        if reason:
            skipped.append((slug, reason))
            continue
        planned.append((slug, prompt, paths["base"] / out_name))

    print(f"Category:              {args.category}")
    print(f"Prompt entries read:   {len(rows)}")
    print(f"Already arted:         {len(skipped)}")
    print(f"Queued for generation: {len(planned)}")

    if args.dry_run or not planned:
        for slug, _, target in planned:
            print(f"  would generate: {slug} -> {target.relative_to(REPO_ROOT)}")
        if skipped:
            print("\nSkipped (already arted):")
            for slug, reason in skipped:
                print(f"  {slug}: {reason}")
        return 0

    client = OpenAI()
    model = MODEL_BY_CATEGORY.get(args.category, DEFAULT_MODEL)
    transparent = args.category in TRANSPARENT_CATEGORIES
    print(f"Model:                 {model}")
    print(f"Transparent bg:        {transparent}")
    success = 0
    failures = []
    for idx, (slug, prompt, target) in enumerate(planned, start=1):
        print(f"[{idx}/{len(planned)}] generating {slug}...", flush=True)
        try:
            generate_one(client, prompt, target, model=model, transparent=transparent)
            success += 1
            print(f"    saved {target.relative_to(REPO_ROOT)}")
        except Exception as exc:  # noqa: BLE001
            failures.append((slug, str(exc)))
            print(f"    FAILED: {exc}", file=sys.stderr)
        if idx < len(planned):
            time.sleep(INTER_CALL_DELAY_SECONDS)

    print("")
    print(f"Generated: {success} / {len(planned)}")
    if failures:
        print(f"Failed:    {len(failures)}")
        for slug, err in failures:
            print(f"  {slug}: {err}")
        return 2

    print("")
    portrait_token_categories = ("monsters", "robots", "sample-actors")
    shape = "portrait-token" if args.category in portrait_token_categories else "square-icon"
    print(f"Next step: run `python3 scripts/render-assets.py --category {args.category} "
          f"--shape {shape}` "
          f"to produce the final assets from these base PNGs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
