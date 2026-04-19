#!/usr/bin/env python3
"""
0.8.1 shim: forwards to `render-assets.py --category monsters --shape
portrait-token`. Kept so any external automation or muscle memory
invoking this script directly still works.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def main() -> int:
    here = Path(__file__).resolve().parent
    target = here / "render-assets.py"
    if not target.exists():
        print(f"render-assets.py not found at {target}", file=sys.stderr)
        return 1
    args = ["--category", "monsters", "--shape", "portrait-token", *sys.argv[1:]]
    os.execv(sys.executable, [sys.executable, str(target), *args])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
