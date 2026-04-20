# Gamma World 1e Content Studio

Editable source files and local web UI for the Foundry compendium packs.

## How it fits in

- The repo's legacy `scripts/build-compendia.mjs` and its source JS (`scripts/compendium-content.mjs`, `monster-content.mjs`, `rulebook-content.mjs`) are frozen. They still work if invoked, but they are no longer the source of truth.
- `content/` in this directory holds one JSON file per compendium document — **this** is now the source of truth.
- `scripts/build.mjs` reads `content/`, writes LevelDB to the repo's top-level `packs/`, and seals them for Foundry v13.
- `scripts/extract.mjs` is the bootstrap: it reads the **currently committed LevelDB packs** (not the legacy JS generators, and not `ref/`) and dumps them as JSON into `content/`.

`ref/` (the original rulebook PDF and OCR extracts) is never read by this pipeline.

## Commands

```bash
# One-time bootstrap: dump committed packs → editable JSON
npm run extract

# After editing anything under content/ — TEST build, safe default.
# Output goes to ../../tmp/studio-build/output/ (untracked). packs/ is not touched.
npm run build

# Publish — OVERWRITES live packs/. Both flags required.
npm run build -- --publish --confirm-overwrite

# Validate without building (id/_key/collisions)
npm run validate

# Launch the web UI (Express API + Vite dev server)
npm run studio
```

The studio opens at <http://127.0.0.1:5173> and proxies `/api` to `127.0.0.1:3737`.

## Build safety

Default build target is **scratch** (`tmp/studio-build/output/`, gitignored). This lets you
verify what `compilePack` produced without touching production data.

`packs/` is only overwritten when you:

- CLI: pass BOTH `--publish` AND `--confirm-overwrite` to `npm run build`.
- API: `POST /api/build` with body `{ "publish": true, "confirm": "overwrite-packs" }`.
- UI: click **Publish to packs/**, type `overwrite-packs` in the modal, click confirm.

Never happens implicitly. If `--publish` is passed without `--confirm-overwrite`, the build
refuses with a non-zero exit.

## Dependencies reused from the repo root

`@foundryvtt/foundryvtt-cli` and `classic-level` are installed in the repo's root `node_modules/` and imported up the tree. They are **not** listed in this package's dependencies.

## Media

User-uploaded images land in the repo-level `assets/studio/` folder. Foundry serves them at `systems/gamma-world-1e/assets/studio/<file>`. The studio never deletes from `assets/monsters/`, `assets/mutations/`, `assets/weapons/` — those belong to the Python art-generation pipeline.
