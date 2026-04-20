import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const studioRoot = path.resolve(__dirname, "..", "..");
export const repoRoot = path.resolve(studioRoot, "..", "..");
export const packsDir = path.join(repoRoot, "packs");
export const contentDir = path.join(studioRoot, "content");
export const systemJsonPath = path.join(repoRoot, "system.json");
export const assetsDir = path.join(repoRoot, "assets");
export const studioAssetsDir = path.join(assetsDir, "studio");
export const scriptsDir = path.join(studioRoot, "scripts");

export function toFoundryAssetPath(absPath: string): string {
  const rel = path.relative(assetsDir, absPath);
  return `systems/gamma-world-1e/assets/${rel.split(path.sep).join("/")}`;
}

export function fromFoundryAssetPath(foundryPath: string): string | null {
  const prefix = "systems/gamma-world-1e/assets/";
  if (!foundryPath.startsWith(prefix)) return null;
  return path.join(assetsDir, foundryPath.slice(prefix.length));
}
