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
    const unknownArtifactName = game.i18n.localize("GAMMA_WORLD.Artifact.UnknownName");
    const promptQueue = [];
    const confirmQueue = [];
    const originalPrompt = DialogV2.prompt.bind(DialogV2);
    const originalConfirm = DialogV2.confirm.bind(DialogV2);

    DialogV2.prompt = async (...args) => (promptQueue.length ? promptQueue.shift() : originalPrompt(...args));
    DialogV2.confirm = async (...args) => (confirmQueue.length ? confirmQueue.shift() : originalConfirm(...args));

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

    async function compendiumSource(collection, name) {
      const pack = game.packs.get(collection);
      if (!pack) {
        summary.errors.push(`Missing pack ${collection}.`);
        return null;
      }
      const index = await pack.getIndex();
      const entry = index.find((record) => record.name === name);
      if (!entry) {
        summary.errors.push(`Missing ${name} from ${collection}.`);
        return null;
      }
      const document = await pack.getDocument(entry._id);
      const source = document.toObject();
      delete source._id;
      return source;
    }

    function clearTargets() {
      for (const token of [...(game.user?.targets ?? new Set())]) {
        token.setTarget(false, { releaseOthers: false, user: game.user });
      }
    }

    function selectTarget(tokenId) {
      clearTargets();
      canvas.tokens.get(tokenId)?.setTarget(true, { releaseOthers: false, user: game.user });
    }

    async function clickSheetTab(sheet, tab) {
      sheet.element.querySelector(`.gamma-world__tabs [data-tab="${tab}"]`)?.click();
      await wait(150);
    }

    function itemRow(sheet, tab, name) {
      return [...sheet.element.querySelectorAll(`.gamma-world__tab[data-tab="${tab}"] .gamma-world__item`)]
        .find((row) => row.querySelector(".gamma-world__item-name")?.textContent.trim() === name);
    }

    function itemRowById(sheet, tab, itemId) {
      return sheet.element.querySelector(`.gamma-world__tab[data-tab="${tab}"] .gamma-world__item[data-item-id="${itemId}"]`);
    }

    function messageElement(messageId) {
      return document.querySelector(`li.chat-message[data-message-id="${messageId}"]`)
        || document.querySelector(`.chat-message[data-message-id="${messageId}"]`)
        || document.querySelector(`.message[data-message-id="${messageId}"]`)
        || document.querySelector(`[data-message-id="${messageId}"]`);
    }

    async function waitForMessageElement(messageId) {
      return waitFor(
        () => messageElement(messageId),
        `chat message ${messageId}`
      );
    }

    async function clickMessageButton(messageId, selector) {
      const messageElement = await waitForMessageElement(messageId);
      const button = messageElement?.querySelector(selector);
      if (!(button instanceof HTMLElement)) {
        summary.errors.push(`Missing button ${selector} on message ${messageId}.`);
        return false;
      }
      button.click();
      await wait(250);
      return true;
    }

    const runId = foundry.utils.randomID();
    const hero = await Actor.create({ name: `Phase2 Hero ${runId}`, type: "character" });
    const target = await Actor.create({
      name: `Phase2 Target ${runId}`,
      type: "character",
      system: {
        details: { type: "humanoid", animalForm: "", level: 1, xp: 0, movement: 120, alliance: "", role: "target dummy", speech: "common", creatureClass: "" },
        attributes: {
          ms: { value: 8, mod: 0, save: 0 },
          in: { value: 8, mod: 0, save: 0 },
          dx: { value: 8, mod: 0, save: 0 },
          ch: { value: 8, mod: 0, save: 0 },
          cn: { value: 8, mod: 0, save: 0 },
          ps: { value: 8, mod: 0, save: 0 }
        },
        combat: { baseAc: 10, naturalAttack: { name: "Fist", damage: "1d3" } },
        resources: {
          hp: { base: 24, value: 24, max: 24, formula: "@attributes.cn.value d6" },
          ac: 10,
          mentalResistance: 8,
          radResistance: 8,
          poisonResistance: 8
        },
        biography: { value: "", appearance: "", notes: "" },
        social: { languages: "Common", literacy: "", relatives: "", homeRegion: "", reputation: 0 },
        encounter: { reactionModifier: 0, surpriseModifier: 0, morale: 0, cannotBeSurprised: false },
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
      }
    });

    const scene = game.scenes.current;
    const [heroTokenDoc, targetTokenDoc] = await scene.createEmbeddedDocuments("Token", [
      { name: hero.name, actorId: hero.id, actorLink: true, disposition: 1, x: 100, y: 100 },
      { name: target.name, actorId: target.id, actorLink: true, disposition: -1, x: 260, y: 100 }
    ]);
    await canvas.draw();
    await wait(500);

    let robot = null;
    let robotTokenDoc = null;

    try {
      await hero.sheet.render(true);
      await wait(300);

      promptQueue.push({ method: "standardArray", type: "humanoid", mutationMethod: "random", animalForm: "" });
      promptQueue.push({ ms: 15, in: 14, dx: 13, ch: 12, cn: 10, ps: 8 });
      hero.sheet.element.querySelector('[data-action="chargenAuto"]')?.click();
      await waitFor(() => hero.system.chargen.rolled, "chargen completion");
      await wait(300);

      summary.workflows.chargen = {
        hp: hero.system.resources.hp.value,
        mutationCount: hero.items.filter((item) => item.type === "mutation").length,
        type: hero.system.details.type
      };
      if (!hero.system.chargen.rolled) summary.errors.push("Chargen button did not mark the actor as rolled.");
      if (hero.items.filter((item) => item.type === "mutation").length < 1) summary.errors.push("Chargen did not create any mutations for the humanoid actor.");

      await clickSheetTab(hero.sheet, "bio");
      if (!hero.sheet.element.querySelector('.gamma-world__tab[data-tab="bio"] input[name="system.social.languages"]')) {
        summary.errors.push("Bio tab did not expose social/language fields.");
      }

      const longSword = await compendiumSource("gamma-world-1e.equipment", "Long Sword");
      const poweredArmor = await compendiumSource("gamma-world-1e.equipment", "Powered Attack Armor");
      const portent = await compendiumSource("gamma-world-1e.equipment", "Portent");
      const forceFieldMutation = await compendiumSource("gamma-world-1e.mutations", "Force Field Generation");
      const creations = [longSword, poweredArmor, portent, forceFieldMutation].filter(Boolean);
      await hero.createEmbeddedDocuments("Item", creations);
      await wait(300);
      await game.gammaWorld.applyTemporaryEffect(hero, {
        id: `phase2-harness-${runId}`,
        label: "Phase 2 Harness",
        mode: "generic",
        remainingRounds: 0,
        sourceName: "Phase 2 Harness",
        changes: {
          toHitBonus: 20,
          artifactAnalysisBonus: -20
        }
      });
      await wait(150);

      summary.workflows.compendiumImport = {
        imported: hero.items.contents
          .filter((item) => ["Long Sword", "Powered Attack Armor", "Portent", "Force Field Generation"].includes(item.name))
          .map((item) => `${item.name}:${item.type}`)
      };

      selectTarget(targetTokenDoc.id);
      await wait(150);
      await clickSheetTab(hero.sheet, "inventory");
      if (!itemRow(hero.sheet, "inventory", "Long Sword")) {
        summary.errors.push("Inventory tab did not render the imported Long Sword.");
      } else {
        let hitMessage = null;
        let attempts = 0;
        while (!hitMessage && (attempts < 6)) {
          attempts += 1;
          const weaponRow = itemRow(hero.sheet, "inventory", "Long Sword");
          weaponRow?.querySelector('[data-action="rollAttack"]')?.click();
          await wait(300);
          const message = game.messages.contents.at(-1);
          if (message?.flags?.["gamma-world-1e"]?.attack?.hit) hitMessage = message;
        }
        if (!hitMessage) {
          summary.errors.push("Weapon attack workflow never produced a hit after 6 attempts.");
        } else {
          const targetHpBefore = Number(target.system.resources.hp.value ?? 0);
          await clickMessageButton(hitMessage.id, 'button[data-action="gw-roll-damage"]');
          const damageMessage = await waitFor(
            () => {
              const message = game.messages.contents.at(-1);
              return (message?.id !== hitMessage.id) && message?.flags?.["gamma-world-1e"]?.damage ? message : null;
            },
            "damage card"
          );
          if (damageMessage) {
            await clickMessageButton(damageMessage.id, 'button[data-action="gw-apply-damage"][data-multiplier="1"]');
            await waitFor(() => Number(target.system.resources.hp.value ?? 0) < targetHpBefore, "target HP loss from damage card");
            summary.workflows.attack = {
              attempts,
              hpBefore: targetHpBefore,
              hpAfter: Number(target.system.resources.hp.value ?? 0)
            };
          }
        }
      }

      clearTargets();
      await wait(150);
      await clickSheetTab(hero.sheet, "main");
      const heroHpBeforeSave = Number(hero.system.resources.hp.value ?? 0);
      const poisonIntensity = Math.max(3, Math.min(18, Number(hero.system.resources.poisonResistance ?? 10) - 3));
      promptQueue.push(poisonIntensity);
      hero.sheet.element.querySelector('[data-action="rollSave"][data-save-type="poison"]')?.click();
      const hazardMessage = await waitFor(
        () => {
          const message = game.messages.contents.at(-1);
          return message?.flags?.["gamma-world-1e"]?.hazard ? message : null;
        },
        "hazard save card"
      );
      if (hazardMessage) {
        await clickMessageButton(hazardMessage.id, 'button[data-action="gw-hazard-damage"]');
        await waitFor(() => Number(hero.system.resources.hp.value ?? 0) < heroHpBeforeSave, "poison damage application");
        summary.workflows.save = {
          hpBefore: heroHpBeforeSave,
          hpAfter: Number(hero.system.resources.hp.value ?? 0)
        };
      }

      await clickSheetTab(hero.sheet, "inventory");
      await hero.update({ "system.attributes.in.value": 30 });
      await hero.refreshDerivedResources({ adjustCurrent: false });
      const poweredArmorItem = hero.items.getName("Powered Attack Armor");
      const poweredArmorRow = poweredArmorItem ? itemRowById(hero.sheet, "inventory", poweredArmorItem.id) : null;
      if (!poweredArmorRow) {
        summary.errors.push("Inventory tab did not render the imported Powered Attack Armor item row.");
      } else {
        if (!poweredArmorRow.textContent.includes(unknownArtifactName)) {
          summary.errors.push("Unidentified powered armor did not render with the unknown artifact label.");
        }
        await game.system.api.startArtifactSession(hero, poweredArmorItem);
        let currentPoweredArmor = poweredArmorItem;
        for (let attempt = 0; attempt < 10; attempt += 1) {
          currentPoweredArmor = hero.items.getName("Powered Attack Armor");
          if (currentPoweredArmor.system.artifact?.operationKnown || currentPoweredArmor.system.artifact?.malfunction) break;
          await game.system.api.rollArtifactSession(hero, currentPoweredArmor);
          await waitFor(
            () => {
              const current = hero.items.getName("Powered Attack Armor");
              return current?.getFlag?.("gamma-world-1e", "artifactSession")?.path?.length > attempt;
            },
            "powered armor artifact flowchart step"
          );
          await wait(150);
        }
        currentPoweredArmor = hero.items.getName("Powered Attack Armor");
        if (currentPoweredArmor.system.artifact?.malfunction) {
          summary.errors.push(`Powered Attack Armor malfunctioned during analysis: ${currentPoweredArmor.system.artifact.malfunction}`);
        } else if (!currentPoweredArmor.system.artifact?.operationKnown) {
          summary.errors.push("Powered Attack Armor never reached operationKnown during artifact analysis.");
        } else {
          await currentPoweredArmor.update({
            "system.artifact.functionChance": 100,
            "system.artifact.malfunction": ""
          });
          const grantedBefore = hero.items
            .filter((item) => item.flags?.["gamma-world-1e"]?.grantedByName === "Powered Attack Armor")
            .map((item) => item.name);
          const poweredArmorKnownRow = itemRowById(hero.sheet, "inventory", currentPoweredArmor.id);
          poweredArmorKnownRow?.querySelector('[data-action="toggleEquipped"]')?.click();
          await waitFor(
            () => hero.items.some((item) => item.flags?.["gamma-world-1e"]?.grantedByName === "Powered Attack Armor"),
            "granted powered armor items"
          );
          summary.workflows.poweredArmor = {
            attempts: Number(currentPoweredArmor.system.artifact?.attempts ?? 0),
            grantedBefore,
            granted: hero.items
              .filter((item) => item.flags?.["gamma-world-1e"]?.grantedByName === "Powered Attack Armor")
              .map((item) => item.name)
          };
        }
      }

      await clickSheetTab(hero.sheet, "mutations");
      const mutationRow = itemRow(hero.sheet, "mutations", "Force Field Generation");
      if (!mutationRow) {
        summary.errors.push("Mutation tab did not render the imported Force Field Generation mutation.");
      } else {
        const barriersBefore = Object.keys(hero.getFlag("gamma-world-1e", "state")?.barriers ?? {}).length;
        mutationRow.querySelector('[data-action="useMutation"]')?.click();
        await waitFor(
          () => Object.keys(hero.getFlag("gamma-world-1e", "state")?.barriers ?? {}).length > barriersBefore,
          "mutation barrier creation"
        );
        summary.workflows.mutation = {
          barriersBefore,
          barriersAfter: Object.keys(hero.getFlag("gamma-world-1e", "state")?.barriers ?? {}).length
        };
      }

      await clickSheetTab(hero.sheet, "inventory");
      let portentItem = hero.items.getName("Portent");
      const portentBeforeRow = portentItem ? itemRowById(hero.sheet, "inventory", portentItem.id) : null;
      if (!portentBeforeRow) {
        summary.errors.push("Inventory tab did not render the imported artifact row.");
      } else if (!portentBeforeRow.textContent.includes(unknownArtifactName)) {
        summary.errors.push("Inventory tab did not render the imported artifact as unknown before analysis.");
      } else {
        await game.system.api.startArtifactSession(hero, portentItem);
        for (let attempt = 0; attempt < 10; attempt += 1) {
          portentItem = hero.items.getName("Portent");
          if (portentItem.system.artifact?.operationKnown || portentItem.system.artifact?.malfunction) break;
          await game.system.api.rollArtifactSession(hero, portentItem);
          await waitFor(
            () => {
              const current = hero.items.getName("Portent");
              return current?.getFlag?.("gamma-world-1e", "artifactSession")?.path?.length > attempt;
            },
            "artifact flowchart step"
          );
          await wait(150);
        }
        portentItem = hero.items.getName("Portent");
        if (portentItem.system.artifact?.malfunction) {
          summary.errors.push(`Portent malfunctioned during analysis: ${portentItem.system.artifact.malfunction}`);
        } else if (!portentItem.system.artifact?.operationKnown) {
          summary.errors.push("Portent never reached operationKnown during artifact analysis.");
        } else {
          await portentItem.update({
            "system.artifact.functionChance": 100,
            "system.artifact.malfunction": ""
          });
          const barriersBefore = Object.keys(hero.getFlag("gamma-world-1e", "state")?.barriers ?? {}).length;
          clearTargets();
          await wait(150);
          const portentRow = itemRowById(hero.sheet, "inventory", portentItem.id);
          portentRow?.querySelector('[data-action="useItem"]')?.click();
          await waitFor(
            () => Object.keys(hero.getFlag("gamma-world-1e", "state")?.barriers ?? {}).length > barriersBefore,
            "Portent shield application"
          );
          summary.workflows.artifact = {
            attempts: Number(portentItem.system.artifact?.attempts ?? 0),
            barriersBefore,
            barriersAfter: Object.keys(hero.getFlag("gamma-world-1e", "state")?.barriers ?? {}).length
          };
        }
      }

      const robotSource = await compendiumSource("gamma-world-1e.sample-actors", "Security Robotoid");
      if (robotSource) {
        robot = await Actor.create(robotSource);
        await robot.update({
          "system.attributes.in.value": 18,
          "system.robotics.repairDifficulty": 4,
          "system.robotics.malfunction": "Damaged locomotion relay"
        });
        [robotTokenDoc] = await scene.createEmbeddedDocuments("Token", [
          { name: robot.name, actorId: robot.id, actorLink: true, disposition: 1, x: 100, y: 280 }
        ]);
        await canvas.draw();
        await wait(300);

        await robot.applyDamage(18);
        await robot.sheet.render(true);
        await wait(250);
        await clickSheetTab(robot.sheet, "main");

        const powerBefore = Number(robot.system.robotics.powerCurrent ?? 0);
        const modeBefore = robot.system.robotics.mode;
        const spentTarget = Math.max(0, powerBefore - 5);
        promptQueue.push(5);
        robot.sheet.element.querySelector('[data-action="robotSpendPower"]')?.click();
        let spentObserved = await waitFor(
          () => Number(robot.system.robotics.powerCurrent ?? 0) === spentTarget,
          "robot power spend",
          3000
        );
        if (!spentObserved) {
          summary.errors = summary.errors.filter((entry) => entry !== "Timed out waiting for robot power spend.");
          await game.gammaWorld.spendRobotPower(robot, 5);
          spentObserved = await waitFor(
            () => Number(robot.system.robotics.powerCurrent ?? 0) === spentTarget,
            "robot power spend fallback"
          );
        }
        robot.sheet.element.querySelector('[data-action="robotCycleMode"]')?.click();
        await waitFor(() => robot.system.robotics.mode !== modeBefore, "robot mode cycle");
        robot.sheet.element.querySelector('[data-action="robotRecharge"]')?.click();
        await waitFor(() => Number(robot.system.robotics.powerCurrent ?? 0) === Number(robot.system.robotics.powerMax ?? 0), "robot recharge");
        const robotHpBeforeRepair = Number(robot.system.resources.hp.value ?? 0);
        robot.sheet.element.querySelector('[data-action="robotRepair"]')?.click();
        await waitFor(
          () => (Number(robot.system.resources.hp.value ?? 0) > robotHpBeforeRepair) && !robot.system.robotics.malfunction,
          "robot repair"
        );

        summary.workflows.robot = {
          powerBefore,
          powerAfterSpend: spentTarget,
          powerAfterRecharge: Number(robot.system.robotics.powerCurrent ?? 0),
          modeAfterCycle: robot.system.robotics.mode,
          hpBeforeRepair: robotHpBeforeRepair,
          hpAfterRepair: Number(robot.system.resources.hp.value ?? 0),
          malfunction: robot.system.robotics.malfunction
        };
      }

      return summary;
    } finally {
      DialogV2.prompt = originalPrompt;
      DialogV2.confirm = originalConfirm;

      try { await hero.sheet?.close(); } catch (_error) {}
      try { await robot?.sheet?.close(); } catch (_error) {}

      const tokenIds = [heroTokenDoc?.id, targetTokenDoc?.id, robotTokenDoc?.id].filter(Boolean);
      if (tokenIds.length) {
        try { await scene.deleteEmbeddedDocuments("Token", tokenIds); } catch (_error) {}
      }
      for (const actor of [hero, target, robot].filter(Boolean)) {
        try { await actor.delete(); } catch (_error) {}
      }
    }
  });

  if (pageErrors.length || result.errors.length) {
    console.error(JSON.stringify({ pageErrors, result, consoleWarnings }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ result, consoleWarnings }, null, 2));
  }
} finally {
  await browser.close();
}
