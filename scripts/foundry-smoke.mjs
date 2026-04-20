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
    const summary = { packs: [], errors: [] };
      const api = game.system.api;
      const runId = foundry.utils.randomID();
      const heroName = `Smoke Test Hero ${runId}`;
      const targetName = `Smoke Test Target ${runId}`;
      if (!api) summary.errors.push("System API missing");

      const expectedPacks = new Map([
        ["gamma-world-1e.mutations", 98],
        ["gamma-world-1e.equipment", 106],
        ["gamma-world-1e.sample-actors", 4],
        ["gamma-world-1e.monsters", 48],
        ["gamma-world-1e.system-docs", 7]
      ]);

      summary.packs = await Promise.all(game.packs.contents
        .filter((pack) => pack.metadata.packageName === "gamma-world-1e")
        .map(async (pack) => {
          const index = await pack.getIndex();
          return { collection: pack.collection, type: pack.documentName, indexed: index.size };
        }));

	      for (const [collection, expectedCount] of expectedPacks.entries()) {
	        const packSummary = summary.packs.find((pack) => pack.collection === collection);
        if (!packSummary) {
          summary.errors.push(`System pack ${collection} is not available.`);
          continue;
        }
	        if (packSummary.indexed !== expectedCount) {
	          summary.errors.push(`System pack ${collection} indexed ${packSummary.indexed} document(s) instead of ${expectedCount}.`);
	        }
	      }

        const samplePack = game.packs.get("gamma-world-1e.sample-actors");
        const monsterPack = game.packs.get("gamma-world-1e.monsters");
        const sampleIndex = await samplePack?.getIndex();
        const monsterIndex = await monsterPack?.getIndex();
        const sampleRobotEntry = sampleIndex?.find((entry) => entry.name === "Security Robotoid");
        const thinkerEntry = monsterIndex?.find((entry) => entry.name === "Android Thinker");
        const sampleRobotDoc = sampleRobotEntry ? await samplePack.getDocument(sampleRobotEntry._id) : null;
        const thinkerDoc = thinkerEntry ? await monsterPack.getDocument(thinkerEntry._id) : null;
        if (!sampleRobotDoc) summary.errors.push("Sample actor pack is missing Security Robotoid.");
        if (!thinkerDoc) summary.errors.push("Monster pack is missing Android Thinker.");
        if (sampleRobotDoc) {
          if (sampleRobotDoc.prototypeToken.actorLink !== true) summary.errors.push("Sample actor prototype token should link to its actor.");
          if (sampleRobotDoc.prototypeToken.displayBars !== 20) summary.errors.push(`Sample actor displayBars expected 20, got ${sampleRobotDoc.prototypeToken.displayBars}.`);
          if ((sampleRobotDoc.prototypeToken.sight?.range ?? 0) !== 60) summary.errors.push(`Sample actor sight range expected 60, got ${sampleRobotDoc.prototypeToken.sight?.range ?? 0}.`);
        }
        if (thinkerDoc) {
          if (thinkerDoc.prototypeToken.actorLink !== false) summary.errors.push("Monster prototype token should default to unlinked.");
          if (thinkerDoc.prototypeToken.disposition !== -1) summary.errors.push(`Monster disposition expected -1, got ${thinkerDoc.prototypeToken.disposition}.`);
          if (thinkerDoc.prototypeToken.displayName !== 20) summary.errors.push(`Monster displayName expected 20, got ${thinkerDoc.prototypeToken.displayName}.`);
          if ((thinkerDoc.prototypeToken.sight?.range ?? 0) !== 60) summary.errors.push(`Monster sight range expected 60, got ${thinkerDoc.prototypeToken.sight?.range ?? 0}.`);
          if (!String(thinkerDoc.prototypeToken.texture?.src ?? "").includes("/assets/monsters/tokens/android-thinker.png")) {
            summary.errors.push("Monster prototype token art is not using the generated token asset.");
          }
        }

		      const hero = await Actor.create({ name: heroName, type: "character" });
		    const target = await Actor.create({
	      name: targetName,
	      type: "character",
      system: {
        details: { type: "humanoid", animalForm: "", level: 2, xp: 0, movement: 10, alliance: "" },
        attributes: {
          ms: { value: 10, mod: 0, save: 0 },
          in: { value: 10, mod: 0, save: 0 },
          dx: { value: 10, mod: 0, save: 0 },
          ch: { value: 10, mod: 0, save: 0 },
          cn: { value: 10, mod: 0, save: 0 },
          ps: { value: 10, mod: 0, save: 0 }
        },
        combat: { baseAc: 7, naturalAttack: { name: "Claw", damage: "1d6" } },
        resources: {
          hp: { base: 24, value: 24, max: 24, formula: "@attributes.cn.value d6" },
          ac: 7,
          mentalResistance: 10,
          radResistance: 10,
          poisonResistance: 10
        },
	        biography: { value: "", appearance: "", notes: "" },
	        chargen: { rolled: true, statMethod: "manual", mutationsRolled: false }
	      }
	    });
	    const unlinkedTarget = await Actor.create({
	      name: `${targetName} Unlinked`,
	      type: "character",
	      system: {
	        details: { type: "humanoid", animalForm: "", level: 1, xp: 0, movement: 10, alliance: "" },
	        attributes: {
	          ms: { value: 9, mod: 0, save: 0 },
	          in: { value: 9, mod: 0, save: 0 },
	          dx: { value: 9, mod: 0, save: 0 },
	          ch: { value: 9, mod: 0, save: 0 },
	          cn: { value: 9, mod: 0, save: 0 },
	          ps: { value: 9, mod: 0, save: 0 }
	        },
	        combat: { baseAc: 7, naturalAttack: { name: "Bite", damage: "1d4" } },
	        resources: {
	          hp: { base: 18, value: 18, max: 18, formula: "@attributes.cn.value d6" },
	          ac: 7,
	          mentalResistance: 9,
	          radResistance: 9,
	          poisonResistance: 9
	        },
	        biography: { value: "", appearance: "", notes: "" },
	        chargen: { rolled: true, statMethod: "manual", mutationsRolled: false }
	      }
	    });
	      const robot = await Actor.create({
        name: `Smoke Test Robot ${runId}`,
        type: "character",
        system: {
          details: { type: "robot", animalForm: "", level: 4, xp: 0, movement: 8, alliance: "Ancients", role: "security robot", speech: "command speech", creatureClass: "Robotic Unit" },
          attributes: {
            ms: { value: 9, mod: 0, save: 0 },
            in: { value: 12, mod: 0, save: 0 },
            dx: { value: 16, mod: 0, save: 0 },
            ch: { value: 3, mod: 0, save: 0 },
            cn: { value: 14, mod: 0, save: 0 },
            ps: { value: 18, mod: 0, save: 0 }
          },
          combat: { baseAc: 3, naturalAttack: { name: "Clamp", damage: "1d8" } },
          resources: {
            hp: { base: 36, value: 36, max: 36, formula: "@attributes.cn.value d6" },
            ac: 3,
            mentalResistance: 9,
            radResistance: 18,
            poisonResistance: 18
          },
          biography: { value: "", appearance: "", notes: "" },
          robotics: {
            isRobot: true,
            mode: "programmed",
            chassis: "Smoke Test Chassis",
            identifier: "ST-R",
            controller: "",
            powerSource: "broadcast",
            powerCurrent: 24,
            powerMax: 24,
            broadcastCapable: true,
            backupHours: 12,
            repairDifficulty: 2,
            malfunction: "Damaged sensor cluster"
          },
          chargen: { rolled: true, statMethod: "manual", mutationsRolled: false }
        }
	      });
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (hero.prototypeToken.actorLink !== true) summary.errors.push("New character actor did not receive linked-token defaults.");
        if (hero.prototypeToken.displayName !== 20) summary.errors.push(`New character actor displayName expected 20, got ${hero.prototypeToken.displayName}.`);
        if (hero.prototypeToken.displayBars !== 20) summary.errors.push(`New character actor displayBars expected 20, got ${hero.prototypeToken.displayBars}.`);
        if ((hero.prototypeToken.sight?.range ?? 0) !== 60) summary.errors.push(`New character actor sight range expected 60, got ${hero.prototypeToken.sight?.range ?? 0}.`);

    const originalPrompt = foundry.applications.api.DialogV2.prompt;
    const originalConfirm = foundry.applications.api.DialogV2.confirm;
    const queue = [
      { method: "standardArray", type: "psh" },
      { ms: 15, in: 14, dx: 13, ch: 12, cn: 10, ps: 8 }
    ];
    foundry.applications.api.DialogV2.prompt = async () => queue.shift();
    foundry.applications.api.DialogV2.confirm = async () => true;
    await api.autoRollCharacter(hero);
      foundry.applications.api.DialogV2.prompt = originalPrompt;
      foundry.applications.api.DialogV2.confirm = originalConfirm;

      await hero.createEmbeddedDocuments("Item", [{
        name: "Smoke Test Rifle",
        type: "weapon",
        system: {
        weaponClass: 13,
        damage: { formula: "5d6", type: "energy" },
        range: { short: 100, medium: 0, long: 200 },
        attackType: "energy",
        rof: 1,
        ammo: { current: 10, max: 10, consumes: true },
        effect: { mode: "damage", formula: "", status: "", notes: "" },
        quantity: 1,
        weight: 0,
        equipped: true,
          description: { value: "" }
        }
      }, {
        name: "Powered Attack Armor",
        type: "armor",
        system: {
          acValue: 2,
          armorType: "heavy",
          dxPenalty: 1,
          quantity: 1,
          weight: 0,
          equipped: true,
          description: { value: "" }
        }
      }, {
        name: "Tear Gas Grenade",
        type: "gear",
        system: {
          quantity: 2,
          weight: 0.5,
          tech: "iii",
          description: { value: "" }
        }
      }, {
        name: "Portent",
        type: "gear",
        system: {
          quantity: 1,
          weight: 1,
          tech: "v",
          action: { mode: "portent", consumeQuantity: 0, notes: "Smoke test artifact shield." },
          artifact: {
            isArtifact: true,
            category: "energyDevice",
            chart: "a",
            condition: "perfect",
            functionChance: 100,
            identified: true,
            operationKnown: true,
            attempts: 0,
            malfunction: "",
            powerSource: "solar",
            charges: { current: 24, max: 24 }
          },
          description: { value: "" }
        }
      }]);
      await target.createEmbeddedDocuments("Item", [{
        name: "Powered Scout Armor",
        type: "armor",
        system: {
          acValue: 3,
          armorType: "heavy",
          dxPenalty: 1,
          quantity: 1,
          weight: 0,
          equipped: true,
          description: { value: "" }
        }
      }]);
      await api.syncGrantedItems(hero);
      await api.syncActorProtectionState(hero);
      await api.syncActorProtectionState(target);
      await hero.refreshDerivedResources({ adjustCurrent: false });
      await target.refreshDerivedResources({ adjustCurrent: false });

	      let scene = game.scenes.current;
	      if (!scene) {
	        scene = await Scene.create({
	          name: `Smoke Harness ${runId}`,
	          active: true,
	          navigation: false,
	          width: 2200,
	          height: 1400,
	          grid: 100,
	          gridDistance: 1,
	          gridUnits: "m"
	        });
	        await scene.activate();
	        await canvas.draw();
	      }
	      let combat = null;
	    const [heroTokenDoc, targetTokenDoc, unlinkedTargetTokenDoc, robotTokenDoc] = await scene.createEmbeddedDocuments("Token", [
	      { name: hero.name, actorId: hero.id, actorLink: true, disposition: 1, x: 100, y: 100 },
	      { name: target.name, actorId: target.id, actorLink: true, disposition: -1, x: 300, y: 100 },
	      { name: `${unlinkedTarget.name} Token`, actorId: unlinkedTarget.id, actorLink: false, disposition: -1, x: 500, y: 100 },
	      { name: robot.name, actorId: robot.id, actorLink: true, disposition: 1, x: 100, y: 300 }
	    ]);
      await canvas.draw();
      await new Promise((resolve) => setTimeout(resolve, 500));
	      const selectTarget = (tokenId) => {
	        for (const token of [...(game.user?.targets ?? new Set())]) {
	          token.setTarget(false, { releaseOthers: false, user: game.user });
	        }
	        canvas.tokens.get(tokenId)?.setTarget(true, { releaseOthers: false, user: game.user });
	      };
	      selectTarget(targetTokenDoc.id);
	      await new Promise((resolve) => setTimeout(resolve, 100));

      const tearGas = hero.items.getName("Tear Gas Grenade");
      await tearGas.use();
      const portent = hero.items.getName("Portent");
      await portent.use();

      const mutationPack = game.packs.get("gamma-world-1e.mutations");
      if (!mutationPack) summary.errors.push("Mutation pack not loaded");
      const mutationIndex = await mutationPack?.getIndex();
      const forceFieldEntry = mutationIndex?.find((entry) => entry.name === "Force Field Generation");
      if (!forceFieldEntry) summary.errors.push("Force Field Generation missing from mutation pack");
      if (forceFieldEntry) {
        const source = (await mutationPack.getDocument(forceFieldEntry._id)).toObject();
        delete source._id;
        const [forceField] = await hero.createEmbeddedDocuments("Item", [source]);
        await forceField.use();
      }

      await hero.sheet.render(true);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const sheetElement = hero.sheet.element;
      const activeTab = () => [...sheetElement.querySelectorAll(".gamma-world__tab")]
        .find((element) => element.classList.contains("active"))?.dataset.tab ?? "";
      const clickSheetTab = async (tab) => {
        sheetElement.querySelector(`.gamma-world__tabs [data-tab="${tab}"]`)?.click();
        await new Promise((resolve) => setTimeout(resolve, 100));
        return activeTab();
      };
      const sheetInventoryTab = await clickSheetTab("inventory");
      const sheetMutationTab = await clickSheetTab("mutations");
      const sheetBioTab = await clickSheetTab("bio");
      const renderedInventoryItems = [...sheetElement.querySelectorAll('.gamma-world__tab[data-tab="inventory"] .gamma-world__item-name')]
        .map((element) => element.textContent.trim());
      const renderedMutationItems = [...sheetElement.querySelectorAll('.gamma-world__tab[data-tab="mutations"] .gamma-world__item-name')]
        .map((element) => element.textContent.trim());
      if (sheetInventoryTab !== "inventory") summary.errors.push("Character sheet inventory tab did not activate.");
      if (sheetMutationTab !== "mutations") summary.errors.push("Character sheet mutations tab did not activate.");
      if (sheetBioTab !== "bio") summary.errors.push("Character sheet bio tab did not activate.");
      if (!renderedInventoryItems.includes("Powered Attack Fist")) summary.errors.push("Character sheet inventory did not render granted armor weapons.");
      if (!renderedMutationItems.includes("Force Field Generation")) summary.errors.push("Character sheet mutation tab did not render active mutations.");

      const weapon = hero.items.getName("Smoke Test Rifle");
      await weapon.rollAttack();
    const attackMessage = game.messages.contents.at(-1);
    const attackFlags = attackMessage?.flags?.["gamma-world-1e"]?.attack;
	      if (attackFlags?.hit) {
	      await api.rollDamageFromFlags(attackFlags);
	      const damageMessage = game.messages.contents.at(-1);
	      const damageFlags = damageMessage?.flags?.["gamma-world-1e"]?.damage;
	      if (damageFlags) await api.applyDamageToTargets(damageFlags.total, 1, { targetUuid: damageFlags.targetUuid });
	    }

	      const unlinkedToken = canvas.tokens.get(unlinkedTargetTokenDoc.id);
	      const unlinkedBaseHpBefore = Number(unlinkedTarget.system.resources.hp.value ?? 0);
	      const unlinkedTokenHpBefore = Number(unlinkedToken?.actor?.system.resources.hp.value ?? 0);
	      const unlinkedTokenUuid = unlinkedToken?.actor?.uuid ?? null;
	      selectTarget(unlinkedTargetTokenDoc.id);
	      await new Promise((resolve) => setTimeout(resolve, 100));
	      await weapon.rollAttack();
	      const unlinkedAttackMessage = game.messages.contents.at(-1);
	      const unlinkedAttackFlags = unlinkedAttackMessage?.flags?.["gamma-world-1e"]?.attack;
	      if (!unlinkedAttackFlags) {
	        summary.errors.push("Unlinked target attack did not create chat flags.");
	      } else {
	        if (unlinkedAttackFlags.targetUuid !== unlinkedTokenUuid) {
	          summary.errors.push("Unlinked target attack stored the wrong actor UUID.");
	        }
	        await api.rollDamageFromFlags({
	          ...unlinkedAttackFlags,
	          hit: true,
	          damageFormula: "5"
	        });
	        const unlinkedDamageMessage = game.messages.contents.at(-1);
	        const unlinkedDamageFlags = unlinkedDamageMessage?.flags?.["gamma-world-1e"]?.damage;
	        if (unlinkedDamageFlags) {
	          await api.applyDamageToTargets(unlinkedDamageFlags.total, 1, { targetUuid: unlinkedDamageFlags.targetUuid });
	        } else {
	          summary.errors.push("Unlinked target damage card did not create chat flags.");
	        }
	      }
	      const unlinkedBaseHpAfter = Number(unlinkedTarget.system.resources.hp.value ?? 0);
	      const unlinkedTokenHpAfter = Number(canvas.tokens.get(unlinkedTargetTokenDoc.id)?.actor?.system.resources.hp.value ?? 0);
	      if ((unlinkedTokenHpBefore - unlinkedTokenHpAfter) !== 5) {
	        summary.errors.push(`Unlinked target token HP did not drop by 5 (before ${unlinkedTokenHpBefore}, after ${unlinkedTokenHpAfter}).`);
	      }
	      if (unlinkedBaseHpBefore !== unlinkedBaseHpAfter) {
	        summary.errors.push(`Unlinked target base actor HP changed from ${unlinkedBaseHpBefore} to ${unlinkedBaseHpAfter}.`);
	      }

	      foundry.applications.api.DialogV2.prompt = async () => 11;
	      await api.rollSave(hero, "poison");
      foundry.applications.api.DialogV2.prompt = originalPrompt;

	      const blocked = await api.applyIncomingDamage(target, 15, {
	        weaponTag: "laser",
	        sourceName: "Smoke Beam"
      });
      const burnout = await api.applyIncomingDamage(target, 25, {
        weaponTag: "laser",
        sourceName: "Smoke Beam"
      });
      const penetrated = await api.applyIncomingDamage(target, 5, {
        weaponTag: "laser",
        sourceName: "Smoke Beam"
      });
      await robot.applyDamage(18);
      const robotHpAfterDamage = Number(robot.system.resources.hp.value ?? 0);
      const robotModeAfterSpend = await api.cycleRobotMode(robot);
	      await api.spendRobotPower(robot, 5);
	      await api.rechargeRobot(robot);
	      const robotRepair = await api.repairRobot(robot);
	      await hero.update({ "system.attributes.dx.value": 17 });
	      await hero.refreshDerivedResources({ adjustCurrent: false });
	      combat = await Combat.create({ scene: scene.id, active: true });
	      await combat.createEmbeddedDocuments("Combatant", [
	        { actorId: hero.id, tokenId: heroTokenDoc.id, sceneId: scene.id },
	        { actorId: robot.id, tokenId: robotTokenDoc.id, sceneId: scene.id },
	        { actorId: target.id, tokenId: targetTokenDoc.id, sceneId: scene.id }
	      ]);
	      await combat.startCombat();
	      await combat.rollAll();
	      await new Promise((resolve) => setTimeout(resolve, 500));
	      const startedCombat = game.combats.get(combat.id);
	      const roundOneInitiative = Object.fromEntries(startedCombat.combatants.contents.map((combatant) => [combatant.name, combatant.initiative]));
	      if (!Number.isInteger(roundOneInitiative[hero.name]) || (roundOneInitiative[hero.name] < 4) || (roundOneInitiative[hero.name] > 23)) {
	        summary.errors.push(`Hero initiative was outside 5e DX-modified range: ${roundOneInitiative[hero.name]}.`);
	      }
	      if (!Number.isInteger(roundOneInitiative[robot.name]) || (roundOneInitiative[robot.name] < 4) || (roundOneInitiative[robot.name] > 23)) {
	        summary.errors.push(`Robot initiative was outside 5e DX-modified range: ${roundOneInitiative[robot.name]}.`);
	      }
	      if (!Number.isInteger(roundOneInitiative[target.name]) || (roundOneInitiative[target.name] < 1) || (roundOneInitiative[target.name] > 20)) {
	        summary.errors.push(`Target initiative was outside 5e DX-modified range: ${roundOneInitiative[target.name]}.`);
	      }
	      await startedCombat.nextRound();
	      await new Promise((resolve) => setTimeout(resolve, 500));
	      const roundTwoCombat = game.combats.get(combat.id);
	      const roundTwoInitiative = Object.fromEntries(roundTwoCombat.combatants.contents.map((combatant) => [combatant.name, combatant.initiative]));
	      if (roundTwoInitiative[hero.name] !== roundOneInitiative[hero.name]) {
	        summary.errors.push("5e-style initiative rerolled for the hero on round two.");
	      }
	      if (roundTwoInitiative[robot.name] !== roundOneInitiative[robot.name]) {
	        summary.errors.push("5e-style initiative rerolled for the robot on round two.");
	      }
	      if (roundTwoInitiative[target.name] !== roundOneInitiative[target.name]) {
	        summary.errors.push("5e-style initiative rerolled for the target on round two.");
	      }
	      const heroState = hero.getFlag("gamma-world-1e", "state") ?? {};
	      const targetState = target.getFlag("gamma-world-1e", "state") ?? {};
	      const robotState = robot.getFlag("gamma-world-1e", "state") ?? {};

      summary.hero = {
        hp: hero.system.resources.hp.value,
        ac: hero.system.resources.ac,
        mutationCount: hero.items.filter((item) => item.type === "mutation").length,
        grantedItems: hero.items
          .filter((item) => item.flags?.["gamma-world-1e"]?.grantedBy)
          .map((item) => item.name),
        barrierCount: Object.keys(heroState.barriers ?? {}).length,
        artifactCharge: hero.items.getName("Portent")?.system.artifact?.charges?.current ?? 0
      };
      summary.sheet = {
        inventoryTab: sheetInventoryTab,
        mutationTab: sheetMutationTab,
	        bioTab: sheetBioTab,
	        inventoryItems: renderedInventoryItems,
	        mutationItems: renderedMutationItems
	      };
	      summary.initiative = {
	        roundOne: roundOneInitiative,
	        roundTwo: roundTwoInitiative
	      };
	      summary.target = {
	        hp: target.system.resources.hp.value,
	        ac: target.system.resources.ac,
        effects: (targetState.temporaryEffects ?? []).map((effect) => ({
          label: effect.label,
          mode: effect.mode
        })),
        blocked,
	        burnout,
	        penetrated
	      };
	      summary.unlinkedCombat = {
	        baseHpBefore: unlinkedBaseHpBefore,
	        baseHpAfter: unlinkedBaseHpAfter,
	        tokenHpBefore: unlinkedTokenHpBefore,
	        tokenHpAfter: unlinkedTokenHpAfter,
	        targetUuid: unlinkedTokenUuid
	      };
        summary.robot = {
          hpAfterDamage: robotHpAfterDamage,
          hpFinal: robot.system.resources.hp.value,
          modeAfterCycle: robotModeAfterSpend,
          powerFinal: robot.system.robotics.powerCurrent,
          effects: (robotState.temporaryEffects ?? []).map((effect) => effect.label),
          repairSuccess: !!robotRepair?.success
        };
	      summary.lastMessages = game.messages.contents.slice(-4).map((message) => ({
	      text: message.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180),
	      flags: Object.keys(message.flags?.["gamma-world-1e"] || {})
	    }));

	    if (combat?.id) await game.combats.get(combat.id)?.delete();
	    await scene.deleteEmbeddedDocuments("Token", [heroTokenDoc.id, targetTokenDoc.id, unlinkedTargetTokenDoc.id, robotTokenDoc.id]);
	    for (const actor of [hero, target, unlinkedTarget, robot]) {
      try {
        await actor.delete();
      } catch (_error) {
        // Best-effort cleanup only; stale embedded-document references should not hide real smoke results.
      }
    }

    return summary;
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
