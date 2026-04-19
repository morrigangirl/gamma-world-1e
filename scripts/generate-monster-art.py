#!/usr/bin/env python3
"""
0.8.1 shim: forwards to `generate-art.py --category monsters`. Kept so any
external automation or muscle memory invoking this script directly still
works. All new code should use `generate-art.py` with an explicit
category flag.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def main() -> int:
    here = Path(__file__).resolve().parent
    target = here / "generate-art.py"
    if not target.exists():
        print(f"generate-art.py not found at {target}", file=sys.stderr)
        return 1
    # Inject --category monsters while preserving any other CLI flags.
    args = ["--category", "monsters", *sys.argv[1:]]
    os.execv(sys.executable, [sys.executable, str(target), *args])
    return 0  # unreachable; execv replaces the process on success.


if __name__ == "__main__":
    raise SystemExit(main())
