import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  actorPackSources,
  encounterTableSources,
  equipmentPackSources,
  journalPackSources,
  monsterPackSources,
  mutationPackSources
} from "./compendium-content.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const repoPacksDir = path.join(repoRoot, "packs");
const worldPacksDir = "/Volumes/Creative/FoundryVTT/Data/worlds/gamma-world-test/packs";
const baseUrl = "http://127.0.0.1:30000";
const joinUrl = "http://127.0.0.1:30000/join";
const adminPassword = "m0rriganHexWitch@!";
const userId = "4XHrOK8LHN0LpKUD";
const worldPackageId = "gamma-world-test";
const foundryAppName = "Foundry Virtual Tabletop";
const foundryProcessMatch = "/Applications/Foundry Virtual Tabletop.app/Contents/MacOS/Foundry Virtual Tabletop";

const packSpecs = [
  { name: "mutations", label: "Mutation Index", type: "Item", documents: mutationPackSources() },
  { name: "equipment", label: "Armory and Gear", type: "Item", documents: equipmentPackSources() },
  { name: "sample-actors", label: "Sample Actors", type: "Actor", documents: actorPackSources() },
  { name: "monsters", label: "Monsters and Beasts", type: "Actor", documents: monsterPackSources() },
  { name: "encounter-tables", label: "Encounter Tables", type: "RollTable", documents: encounterTableSources() },
  { name: "system-docs", label: "System Documentation", type: "JournalEntry", documents: journalPackSources() }
];

async function login(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  if (page.url().includes("/setup")) {
    await page.evaluate(async (worldId) => {
      await fetch("/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "launchWorld", world: worldId })
      });
    }, worldPackageId);
    await page.waitForTimeout(1000);
  }
  if (!page.url().includes("/join") && !page.url().includes("/game")) {
    await page.goto(joinUrl, { waitUntil: "networkidle" });
  }
  if (page.url().includes("/game")) return;
  await page.goto(joinUrl, { waitUntil: "networkidle" });
  const selectedUser = await page.evaluate((preferredId) => {
    const select = document.querySelector('select[name="userid"]');
    if (!(select instanceof HTMLSelectElement)) return "";
    const preferred = [...select.options].find((option) => option.value === preferredId);
    if (preferred?.value) {
      preferred.disabled = false;
      select.value = preferred.value;
      return preferred.value;
    }
    const enabled = [...select.options].filter((option) => option.value && !option.disabled);
    if (enabled[0]?.value) {
      select.value = enabled[0].value;
      return enabled[0].value;
    }
    return "";
  }, userId);
  if (!selectedUser) throw new Error("No enabled Foundry user is available on the join page.");
  await page.fill('input[name="adminPassword"]', adminPassword);
  await page.getByRole("button", { name: /Join Game Session/i }).click();
  await page.waitForURL("**/game", { timeout: 15000 });
  await page.waitForTimeout(3000);
}

async function withGamePage(callback) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  try {
    await login(page);
    return await callback(page);
  } finally {
    await browser.close();
  }
}

async function buildWorldPacks(page) {
  return page.evaluate(async (specs) => {
    const CompendiumCollection = foundry.documents.collections.CompendiumCollection;
    const documentClassFor = {
      Item,
      Actor,
      RollTable,
      JournalEntry
    };

    for (const spec of specs) {
      const existing = game.packs.get(`world.${spec.name}`);
      if (existing) await existing.deleteCompendium();
    }

    for (const spec of specs) {
      const pack = await CompendiumCollection.createCompendium({
        name: spec.name,
        label: spec.label,
        type: spec.type
      });
      const cls = documentClassFor[spec.type];
      await cls.createDocuments(spec.documents, { pack: pack.collection });
      await pack.getIndex();
    }

    return specs.map((spec) => ({ id: `world.${spec.name}`, name: spec.name, count: spec.documents.length }));
  }, packSpecs);
}

async function deleteWorldPacks(page) {
  return page.evaluate(async (names) => {
    for (const name of names) {
      const existing = game.packs.get(`world.${name}`);
      if (existing) await existing.deleteCompendium();
    }
  }, packSpecs.map((spec) => spec.name));
}

function copyPacksToRepo() {
  fs.mkdirSync(repoPacksDir, { recursive: true });

  for (const spec of packSpecs) {
    const sourceDir = path.join(worldPacksDir, spec.name);
    const targetDir = path.join(repoPacksDir, spec.name);
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Expected world pack directory not found: ${sourceDir}`);
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.cpSync(sourceDir, targetDir, { recursive: true });
  }
}

function isFoundryAppRunning() {
  return spawnSync("pgrep", ["-f", foundryProcessMatch], { stdio: "ignore" }).status === 0;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, timeoutMs, label) {
  const started = Date.now();
  while ((Date.now() - started) < timeoutMs) {
    if (await check()) return;
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function waitForServer(up) {
  await waitFor(async () => {
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      return up ? response.status >= 200 : false;
    } catch (_error) {
      return up ? false : true;
    }
  }, 60000, up ? "Foundry server to start" : "Foundry server to stop");
}

async function restartFoundryApp() {
  if (process.platform !== "darwin" || !isFoundryAppRunning()) return false;

  execFileSync("osascript", ["-e", `tell application "${foundryAppName}" to quit`]);
  await waitFor(() => !isFoundryAppRunning(), 60000, "Foundry application to quit");
  await waitForServer(false);

  execFileSync("open", ["-a", foundryAppName]);
  await waitFor(() => isFoundryAppRunning(), 60000, "Foundry application to launch");
  await waitForServer(true);
  return true;
}

async function verifySystemPacks(page, specs) {
  return page.evaluate(async (expectedSpecs) => {
    const failures = [];
    const verified = [];

    for (const spec of expectedSpecs) {
      const pack = game.packs.get(`gamma-world-1e.${spec.name}`);
      if (!pack) {
        failures.push(`Missing system pack gamma-world-1e.${spec.name}.`);
        continue;
      }

      const documents = await pack.getDocuments();
      if (documents.length !== spec.count) {
        failures.push(`System pack gamma-world-1e.${spec.name} loaded ${documents.length} documents instead of ${spec.count}.`);
        continue;
      }

      verified.push({ collection: pack.collection, count: documents.length });
    }

    if (failures.length) throw new Error(failures.join("\n"));
    return verified;
  }, specs);
}

const summary = await withGamePage(async (page) => {
  const built = await buildWorldPacks(page);
  await page.waitForTimeout(1500);
  return built;
});

// Let Foundry close the compendium databases before copying the on-disk packs.
copyPacksToRepo();

await withGamePage(async (page) => {
  await deleteWorldPacks(page);
});

const restarted = await restartFoundryApp();
const verification = restarted
  ? await withGamePage((page) => verifySystemPacks(page, summary))
  : [];

console.log("Built and copied compendia:");
for (const pack of summary) {
  console.log(`- ${pack.name}: ${pack.count} document(s)`);
}

if (verification.length) {
  console.log("Verified system compendia after restart:");
  for (const pack of verification) {
    console.log(`- ${pack.collection}: ${pack.count} document(s)`);
  }
} else {
  console.log("Skipped automatic Foundry restart and system-pack verification.");
}
