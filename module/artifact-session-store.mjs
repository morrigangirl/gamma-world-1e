const publicSnapshots = new Map();
const appRegistry = new Map();

export function artifactSessionSnapshot(itemUuid) {
  return publicSnapshots.get(String(itemUuid ?? "")) ?? null;
}

export function setArtifactSessionSnapshot(snapshot) {
  const itemUuid = String(snapshot?.itemUuid ?? "");
  if (!itemUuid) return null;
  publicSnapshots.set(itemUuid, snapshot);
  notifyArtifactSessionApps(itemUuid, snapshot);
  return snapshot;
}

export function clearArtifactSessionSnapshot(itemUuid) {
  const key = String(itemUuid ?? "");
  if (!key) return;
  publicSnapshots.delete(key);
  notifyArtifactSessionApps(key, null);
}

export function registerArtifactSessionApp(itemUuid, app) {
  const key = String(itemUuid ?? "");
  if (!key || !app) return;
  const bucket = appRegistry.get(key) ?? new Set();
  bucket.add(app);
  appRegistry.set(key, bucket);
}

export function unregisterArtifactSessionApp(itemUuid, app) {
  const key = String(itemUuid ?? "");
  if (!key || !app) return;
  const bucket = appRegistry.get(key);
  if (!bucket) return;
  bucket.delete(app);
  if (!bucket.size) appRegistry.delete(key);
}

export function notifyArtifactSessionApps(itemUuid, snapshot) {
  const key = String(itemUuid ?? "");
  const bucket = appRegistry.get(key);
  if (!bucket?.size) return;
  for (const app of [...bucket]) {
    if (typeof app?.onArtifactSessionUpdate === "function") {
      app.onArtifactSessionUpdate(snapshot);
    } else if (typeof app?.render === "function") {
      app.render(true);
    }
  }
}

