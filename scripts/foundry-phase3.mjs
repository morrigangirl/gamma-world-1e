import { chromium } from "playwright";

const joinUrl = "http://127.0.0.1:30000/join";
const adminPassword = "m0rriganHexWitch@!";
const userId = "4XHrOK8LHN0LpKUD";
const worldPackageId = "gamma-world-test";

async function login(page) {
  await page.goto("http://127.0.0.1:30000/", { waitUntil: "networkidle" });
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

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
const consoleWarnings = [];

page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (msg) => {
  if (["warning", "error"].includes(msg.type())) consoleWarnings.push(`[${msg.type()}] ${msg.text()}`);
});

try {
  await login(page);

  const result = await page.evaluate(async () => {
    const summary = { errors: [], workflows: {} };
    const DialogV2 = foundry.applications.api.DialogV2;
    const promptQueue = [];
    const originalPrompt = DialogV2.prompt.bind(DialogV2);

    DialogV2.prompt = async (...args) => (promptQueue.length ? promptQueue.shift() : originalPrompt(...args));

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    async function waitFor(check, label, timeout = 8000, interval = 100) {
      const started = Date.now();
      while ((Date.now() - started) < timeout) {
        const value = await check();
        if (value) return value;
        await wait(interval);
      }
      summary.errors.push(`Timed out waiting for ${label}.`);
      return null;
    }

    function lastEncounterMessage(type, seen = new Set()) {
      return [...game.messages.contents].reverse().find((message) => (
        !seen.has(message.id)
        && (
        message.flags?.["gamma-world-1e"]?.encounter?.type === type
        )
      )) ?? null;
    }

    const runId = foundry.utils.randomID();
    let characterActor = null;
    let monsterActor = null;
    const baseSystem = {
      details: {
        type: "mutated-animal",
        animalForm: "Hound",
        level: 2,
        xp: 0,
        movement: 10,
        alliance: "",
        role: "encounter test",
        speech: "",
        creatureClass: "Mutated Beast"
      },
      attributes: {
        ms: { value: 8, mod: 0, save: 0 },
        in: { value: 7, mod: 0, save: 0 },
        dx: { value: 10, mod: 0, save: 0 },
        ch: { value: 6, mod: 0, save: 0 },
        cn: { value: 12, mod: 0, save: 0 },
        ps: { value: 12, mod: 0, save: 0 }
      },
      combat: { baseAc: 10, naturalAttack: { name: "Bite", damage: "1d6" } },
      resources: {
        hp: { base: 20, value: 8, max: 20, formula: "" },
        ac: 10,
        mentalResistance: 8,
        radResistance: 12,
        poisonResistance: 12
      },
      biography: { value: "", appearance: "", notes: "" },
      social: { languages: "", literacy: "", relatives: "", homeRegion: "", reputation: 0 },
      encounter: {
        reactionModifier: -1,
        surpriseModifier: 0,
        morale: 0,
        intelligence: "non-intelligent",
        cannotBeSurprised: false
      },
      robotics: {
        isRobot: false,
        mode: "inactive",
        chassis: "",
        identifier: "",
        controller: "",
        powerSource: "none",
        powerCurrent: 0,
        powerMax: 0,
        broadcastCapable: false,
        backupHours: 0,
        repairDifficulty: 0,
        malfunction: ""
      },
      chargen: { rolled: true, statMethod: "manual", mutationMethod: "random", mutationsRolled: false }
    };

    characterActor = await Actor.create({
      name: `Phase3 PC ${runId}`,
      type: "character",
      system: foundry.utils.deepClone(baseSystem)
    });
    monsterActor = await Actor.create({
      name: `Phase3 Monster ${runId}`,
      type: "monster",
      system: foundry.utils.deepClone(baseSystem)
    });

    try {
      await characterActor.sheet.render(true);
      await monsterActor.sheet.render(true);
      await wait(400);

      summary.workflows.sheetClasses = {
        character: characterActor.sheet.constructor.name,
        monster: monsterActor.sheet.constructor.name
      };

      const forbiddenCharacterButtons = ["rollReaction", "rollMorale", "routeEncounter", "randomEncounter"];
      summary.workflows.characterSheetButtons = Object.fromEntries(forbiddenCharacterButtons.map((action) => [
        action,
        !!characterActor.sheet.element.querySelector(`[data-action="${action}"]`)
      ]));
      for (const [action, present] of Object.entries(summary.workflows.characterSheetButtons)) {
        if (present) summary.errors.push(`Character sheet should not expose ${action}.`);
      }

      const requiredMonsterButtons = ["rollReaction", "rollMorale", "routeEncounter"];
      summary.workflows.monsterSheetButtons = Object.fromEntries(requiredMonsterButtons.map((action) => [
        action,
        !!monsterActor.sheet.element.querySelector(`[data-action="${action}"]`)
      ]));
      for (const [action, present] of Object.entries(summary.workflows.monsterSheetButtons)) {
        if (!present) summary.errors.push(`Monster sheet is missing ${action}.`);
      }
      if (monsterActor.sheet.element.querySelector('[data-action="randomEncounter"]')) {
        summary.errors.push("Monster sheet should not expose randomEncounter.");
      }

      promptQueue.push({ terrain: "clear", period: "night" });
      const seenRouteMessages = new Set(game.messages.contents.map((message) => message.id));
      monsterActor.sheet.element.querySelector('[data-action="routeEncounter"]')?.click();
      const routeMessage = await waitFor(() => lastEncounterMessage("route", seenRouteMessages), "route encounter card");
      summary.workflows.routeEncounter = {
        terrain: routeMessage?.flags?.["gamma-world-1e"]?.encounter?.terrain ?? "",
        period: routeMessage?.flags?.["gamma-world-1e"]?.encounter?.period ?? "",
        encountered: !!routeMessage?.flags?.["gamma-world-1e"]?.encounter?.encountered
      };

      promptQueue.push({
        scope: "self",
        reason: "Under pressure",
        manualModifier: 4,
        defendingLair: false,
        lairYoung: false,
        track: true
      });
      const seenMoraleMessages = new Set(game.messages.contents.map((message) => message.id));
      monsterActor.sheet.element.querySelector('[data-action="rollMorale"]')?.click();
      const moraleMessage = await waitFor(() => lastEncounterMessage("morale", seenMoraleMessages), "morale card");
      const moraleEffect = await waitFor(
        () => game.actors.get(monsterActor.id)?.getFlag("gamma-world-1e", "state")?.temporaryEffects?.find((effect) => effect.id === `morale-watch:${monsterActor.id}`) ?? null,
        "morale tracking effect"
      );
      summary.workflows.morale = {
        result: moraleMessage?.flags?.["gamma-world-1e"]?.encounter?.result ?? "",
        threshold: moraleMessage?.flags?.["gamma-world-1e"]?.encounter?.threshold ?? 0,
        tracked: !!moraleEffect
      };
      if (!moraleEffect) summary.errors.push("Morale tracking effect was not created.");

      const encounterPack = game.packs.get("gamma-world-1e.encounter-tables");
      const encounterTables = encounterPack ? await encounterPack.getDocuments() : [];
      const zoneTable = encounterTables.find((table) => table.name === "Radioactive Zone Encounters");
      const forestTable = encounterTables.find((table) => table.name === "Forest Encounters");
      const zoneDraw = zoneTable ? await zoneTable.draw({ roll: await new Roll("10").evaluate(), displayChat: false }) : null;
      const forestDraw = forestTable ? await forestTable.draw({ roll: await new Roll("1").evaluate(), displayChat: false }) : null;
      summary.workflows.encounterTables = {
        count: encounterTables.length,
        zoneResult: zoneDraw?.results?.[0]?.name ?? "",
        forestResult: forestDraw?.results?.[0]?.name ?? ""
      };
      if (encounterTables.length !== 7) summary.errors.push(`Expected 7 encounter tables, found ${encounterTables.length}.`);
      if (summary.workflows.encounterTables.zoneResult !== "Cryptic Alliance") {
        summary.errors.push("Zone encounter roll table did not return the expected Cryptic Alliance result for roll 10.");
      }

      const apiEncounter = await game.gammaWorld.rollTerrainEncounter(monsterActor, { terrain: "zones", roll: 10 });
      const apiRoute = await game.gammaWorld.checkRouteEncounter(monsterActor, {
        terrain: "ruins",
        period: "day",
        checkRoll: 6,
        encounterRoll: 13
      });
      const apiFollowUp = moraleEffect
        ? await game.gammaWorld.continueMoraleWatch(monsterActor, moraleEffect, { roll: 1 })
        : null;

      summary.workflows.api = {
        radioactiveZones: apiEncounter?.entry?.name ?? "",
        ruinsRoute: apiRoute?.encounter?.name ?? "",
        moraleFollowUpContinues: !!apiFollowUp?.continues
      };

      if (summary.workflows.api.radioactiveZones !== "Cryptic Alliance") {
        summary.errors.push("Zone encounter table did not return the expected Cryptic Alliance result for roll 10.");
      }
      if (summary.workflows.api.ruinsRoute !== "No Encounter") {
        summary.errors.push("Ruins route encounter did not return No Encounter for roll 13.");
      }
    } finally {
      if (characterActor) await characterActor.delete();
      if (monsterActor) await monsterActor.delete();
    }

    DialogV2.prompt = originalPrompt;
    return summary;
  });

  if (pageErrors.length) result.errors.push(...pageErrors);
  console.log(JSON.stringify({ result, consoleWarnings }, null, 2));
  if (result.errors.length) process.exitCode = 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
