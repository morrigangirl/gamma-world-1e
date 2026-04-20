import fs from "node:fs";
import path from "node:path";
import { assetsDir, studioAssetsDir, toFoundryAssetPath } from "./paths.js";
import type { MediaEntry } from "../../shared/types.js";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"]);

export function ensureStudioDir(): void {
  fs.mkdirSync(studioAssetsDir, { recursive: true });
}

function resolveSafe(rel: string): string {
  const normalized = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const abs = path.resolve(assetsDir, normalized);
  if (!abs.startsWith(assetsDir)) {
    throw Object.assign(new Error("path escapes assets directory"), { status: 400 });
  }
  return abs;
}

export function listMedia(rel: string = ""): MediaEntry[] {
  const abs = resolveSafe(rel);
  if (!fs.existsSync(abs)) return [];
  const entries: MediaEntry[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const childAbs = path.join(abs, entry.name);
    const relPath = path.relative(assetsDir, childAbs).split(path.sep).join("/");
    const stat = fs.statSync(childAbs);
    if (entry.isDirectory()) {
      entries.push({
        path: relPath,
        foundryPath: toFoundryAssetPath(childAbs),
        size: 0,
        kind: "dir",
        mtime: stat.mtimeMs
      });
    } else if (entry.isFile() && IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) {
      entries.push({
        path: relPath,
        foundryPath: toFoundryAssetPath(childAbs),
        size: stat.size,
        kind: "file",
        mtime: stat.mtimeMs
      });
    }
  }
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
  return entries;
}

export function saveUpload(originalName: string, buffer: Buffer): MediaEntry {
  ensureStudioDir();
  const ext = path.extname(originalName).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) {
    throw Object.assign(new Error(`unsupported extension: ${ext}`), { status: 400 });
  }
  const base = path.basename(originalName, ext).replace(/[^a-zA-Z0-9-_]/g, "_") || "upload";
  let name = `${base}${ext}`;
  let counter = 1;
  while (fs.existsSync(path.join(studioAssetsDir, name))) {
    name = `${base}_${counter}${ext}`;
    counter += 1;
  }
  const abs = path.join(studioAssetsDir, name);
  fs.writeFileSync(abs, buffer);
  const stat = fs.statSync(abs);
  return {
    path: path.relative(assetsDir, abs).split(path.sep).join("/"),
    foundryPath: toFoundryAssetPath(abs),
    size: stat.size,
    kind: "file",
    mtime: stat.mtimeMs
  };
}

export function deleteStudioUpload(relPath: string): void {
  const abs = resolveSafe(relPath);
  if (!abs.startsWith(studioAssetsDir)) {
    throw Object.assign(new Error("can only delete files under assets/studio/"), { status: 403 });
  }
  if (!fs.existsSync(abs)) return;
  fs.unlinkSync(abs);
}
