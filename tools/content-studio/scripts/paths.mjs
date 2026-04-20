import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const studioRoot = path.resolve(__dirname, "..");
export const repoRoot = path.resolve(studioRoot, "..", "..");
export const packsDir = path.join(repoRoot, "packs");
export const contentDir = path.join(studioRoot, "content");
export const scratchRoot = path.join(repoRoot, "tmp", "studio-build");
export const scratchStageDir = path.join(scratchRoot, "staging");
export const scratchOutputDir = path.join(scratchRoot, "output");
export const systemJsonPath = path.join(repoRoot, "system.json");
export const assetsDir = path.join(repoRoot, "assets");
export const studioAssetsDir = path.join(assetsDir, "studio");
export const CONFIRM_TOKEN = "overwrite-packs";

export function readSystemJson() {
  return JSON.parse(fs.readFileSync(systemJsonPath, "utf8"));
}

export function listPacks() {
  const system = readSystemJson();
  return system.packs ?? [];
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function rmDir(dir) {
  fs.rmSync(dir, { force: true, recursive: true, maxRetries: 10 });
}
