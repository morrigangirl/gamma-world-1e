#!/usr/bin/env python3
"""
Generate monster base art via OpenAI's image endpoint for only those
monsters whose portrait or token file is currently missing on disk.

Pipeline:

  1. Read the prompt JSONL produced by `npm run build:monster-prompts`
     (scripts/build-monster-art-prompts.mjs) from
     `tmp/imagegen/monster-prompts.jsonl`.
  2. For each entry, compute the target path
     `output/imagegen/monsters/base/<slug>.png`.
  3. Skip entries whose target already exists OR whose matching
     portrait + token both exist in `assets/monsters/{portraits,tokens}`.
     (i.e. don't re-spend tokens on monsters that are already fully
      arted.)
  4. Call OpenAI's image API (`gpt-image-1` — native transparency +
     higher fidelity than dall-e-3) to produce a 1024x1024 PNG with a
     transparent background, save to the base directory.
  5. Print a summary of what it generated / skipped.

After this runs, follow up with:
    python3 scripts/render-monster-assets.py
to rasterize the bases into the canonical 1024 portraits and 512 tokens.

Env:
    OPENAI_API_KEY — required. Uses only this one env var so the script
    is portable across machines.

Usage:
    python3 scripts/generate-monster-art.py         # only missing ones
    python3 scripts/generate-monster-art.py --force # re-generate everyone
    python3 scripts/generate-monster-art.py --only dragon,howler
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
PROMPT_PATH = REPO_ROOT / "tmp" / "imagegen" / "monster-prompts.jsonl"
BASE_DIR = REPO_ROOT / "output" / "imagegen" / "monsters" / "base"
PORTRAIT_DIR = REPO_ROOT / "assets" / "monsters" / "portraits"
TOKEN_DIR = REPO_ROOT / "assets" / "monsters" / "tokens"

# Using `gpt-image-1` — the 2025 image model with native transparency and
# configurable output formats. Older `dall-e-3` works too but doesn't honor
# the transparent-background hint in prompts reliably.
MODEL = "gpt-image-1"
IMAGE_SIZE = "1024x1024"
# Delay between successive generations to stay polite with the API and
# avoid hitting per-minute rate caps during a batch run.
INTER_CALL_DELAY_SECONDS = 1.5


def read_prompts(path: Path) -> list[dict]:
    if not path.exists():
        raise SystemExit(
            f"Prompt JSONL not found at {path}. Run `npm run build:monster-prompts` first."
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


def is_already_arted(slug: str) -> bool:
    """Treat a slug as already arted if BOTH the portrait and token files
    exist on disk. A partial state (portrait but not token, or vice
    versa) still counts as "needs art" so the pipeline can refresh it."""
    portrait = PORTRAIT_DIR / f"{slug}.png"
    token = TOKEN_DIR / f"{slug}.png"
    return portrait.exists() and token.exists()


def needs_generation(slug: str, force: bool) -> str | None:
    """Return a reason string if this slug should be skipped, else None."""
    if force:
        return None
    base = BASE_DIR / f"{slug}.png"
    if base.exists():
        return f"base art already present at {base.relative_to(REPO_ROOT)}"
    if is_already_arted(slug):
        return "portrait + token already exist in assets/monsters/"
    return None


def generate_one(client: OpenAI, prompt: str, slug: str, target: Path) -> None:
    response = client.images.generate(
        model=MODEL,
        prompt=prompt,
        size=IMAGE_SIZE,
        background="transparent",
        n=1
    )
    image_b64 = response.data[0].b64_json
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(base64.b64decode(image_b64))


def filter_by_only(rows: list[dict], only: Iterable[str]) -> list[dict]:
    wanted = {s.strip().lower() for s in only if s.strip()}
    return [r for r in rows if Path(r.get("out", "")).stem.lower() in wanted]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true",
                        help="Re-generate every prompt even if art already exists.")
    parser.add_argument("--only", default="",
                        help="Comma-separated list of slugs to limit the run to.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be generated without calling the API.")
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key and not args.dry_run:
        print("OPENAI_API_KEY is not set in the environment.", file=sys.stderr)
        return 1

    rows = read_prompts(PROMPT_PATH)
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
        reason = needs_generation(slug, args.force)
        if reason:
            skipped.append((slug, reason))
            continue
        planned.append((slug, prompt, BASE_DIR / out_name))

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
    success = 0
    failures = []
    for idx, (slug, prompt, target) in enumerate(planned, start=1):
        print(f"[{idx}/{len(planned)}] generating {slug}...", flush=True)
        try:
            generate_one(client, prompt, slug, target)
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
    print("Next step: run `python3 scripts/render-monster-assets.py` to produce")
    print("the final portrait + token assets from these base PNGs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
