#!/usr/bin/env python3
"""
Generate base art via OpenAI's image endpoint for one of four asset
categories: monsters, weapons, mutations, robots. Skips any slug whose
final asset is already on disk so re-runs are free.

Pipeline per category:
    1. Read prompts JSONL from `tmp/imagegen/<category>-prompts.jsonl`
       (produced by `npm run build:<category>-prompts`).
    2. Write a 1024x1024 transparent-background PNG via `gpt-image-1`
       to `output/imagegen/<category>/base/<slug>.png`.
    3. Skip any slug whose FINAL asset (portrait+token for
       monsters/robots, single square for weapons/mutations) already
       exists under `assets/`.

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
MODEL = "gpt-image-1"
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
    if category == "mutations":
        return {
            "prompts": REPO_ROOT / "tmp" / "imagegen" / "mutation-prompts.jsonl",
            "base":    REPO_ROOT / "output" / "imagegen" / "mutations" / "base",
            "finals":  [REPO_ROOT / "assets" / "mutations"],
        }
    raise SystemExit(f"Unknown category: {category!r}. "
                     f"Valid: monsters, weapons, mutations, robots.")


def read_prompts(path: Path, category: str) -> list[dict]:
    if not path.exists():
        raise SystemExit(
            f"Prompt JSONL not found at {path}. "
            f"Run `npm run build:{category.rstrip('s')}-prompts` first "
            f"(or `npm run build:monster-prompts` for monsters)."
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


def generate_one(client: OpenAI, prompt: str, target: Path) -> None:
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
    parser.add_argument("--category", required=True,
                        choices=["monsters", "weapons", "mutations", "robots"],
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
    success = 0
    failures = []
    for idx, (slug, prompt, target) in enumerate(planned, start=1):
        print(f"[{idx}/{len(planned)}] generating {slug}...", flush=True)
        try:
            generate_one(client, prompt, target)
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
    print(f"Next step: run `python3 scripts/render-assets.py --category {args.category} "
          f"--shape {'portrait-token' if args.category in ('monsters', 'robots') else 'square-icon'}` "
          f"to produce the final assets from these base PNGs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
