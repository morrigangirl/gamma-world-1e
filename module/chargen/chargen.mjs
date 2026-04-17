/**
 * Chargen orchestrator — takes an Actor through:
 *   1. method + type selection
 *   2. stat roll / assignment
 *   3. derived-stat calculation
 *   4. mutation rolls (Humanoid / Mutated Animal)
 *   5. atomic update + embedded mutation creation
 *   6. chat summary
 */

import { SYSTEM_ID, ATTRIBUTE_KEYS } from "../config.mjs";
import { chargenFlow } from "./chargen-dialog.mjs";
import { buildMutationItemSource } from "../mutations.mjs";
import { beneficialMutationChoices, mutationEntriesFor, pickMutation } from "../tables/mutation-tables.mjs";

/* ----------------------------------------------------------- */
/*  HP roll (sum of CN d6)                                     */
/* ----------------------------------------------------------- */

async function rollHitPoints(cn) {
  const safeCn = Number.isFinite(cn) ? Math.max(1, Math.floor(cn)) : 1;
  const roll = await new Roll(`${safeCn}d6`).evaluate();
  return { total: roll.total, formula: roll.formula, roll };
}

/* ----------------------------------------------------------- */
/*  Derived stats                                              */
/* ----------------------------------------------------------- */

function computeDerived(stats, type, hpTotal) {
  return {
    hp: Math.max(1, hpTotal),
    ac: 10,
    mr: stats.ms,
    rr: stats.cn,
    pr: stats.cn
  };
}

/* ----------------------------------------------------------- */
/*  Mutation rolls                                             */
/* ----------------------------------------------------------- */

function rollOneToFour() {
  return Math.floor(Math.random() * 4) + 1;
}

async function chooseMutationFromList(subtype, type, excludeNames = []) {
  const choices = beneficialMutationChoices(subtype, type, excludeNames);
  const options = choices
    .map((entry) => `<option value="${entry.name}">${entry.name}</option>`)
    .join("");
  const selected = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${subtype === "physical" ? "Physical" : "Mental"} Mutation` },
    content: `<form><label>Choose ${subtype} mutation:
      <select name="mutation">${options}</select>
    </label></form>`,
    ok: {
      label: "Choose",
      callback: (_event, button) => new foundry.applications.ux.FormDataExtended(button.form).object.mutation
    },
    rejectClose: false
  });
  return choices.find((entry) => entry.name === selected) ?? null;
}

function chooseRandomDefect(subtype, type, excludeNames = []) {
  const entries = mutationEntriesFor(subtype, type).filter((entry) => entry.category === "defect" && !excludeNames.includes(entry.name));
  if (!entries.length) return null;
  return entries[Math.floor(Math.random() * entries.length)];
}

function chooseDefectSubtypes(physicalCount, mentalCount) {
  const defects = [];
  if (physicalCount >= 3) defects.push("physical");
  if (mentalCount >= 3) defects.push("mental");
  if ((physicalCount === 2) && (mentalCount === 2)) {
    defects.push(Math.random() < 0.5 ? "physical" : "mental");
  }
  return defects;
}

async function rollMutations(type, { mode = "random" } = {}) {
  if ((type === "psh") || (type === "robot")) return [];
  const physCount = rollOneToFour();
  const mentCount = rollOneToFour();
  const results = [];
  const chosenNames = new Set();

  for (let i = 0; i < physCount; i += 1) {
    const entry = mode === "choose"
      ? await chooseMutationFromList("physical", type, [...chosenNames])
      : pickMutation("physical", {
          characterType: type,
          excludeNames: [...chosenNames]
        })?.entry;
    if (!entry) continue;
    chosenNames.add(entry.name);
    results.push(buildMutationItemSource(entry));
  }

  for (let i = 0; i < mentCount; i += 1) {
    const entry = mode === "choose"
      ? await chooseMutationFromList("mental", type, [...chosenNames])
      : pickMutation("mental", {
          characterType: type,
          excludeNames: [...chosenNames]
        })?.entry;
    if (!entry) continue;
    chosenNames.add(entry.name);
    results.push(buildMutationItemSource(entry));
  }

  if (mode === "choose") {
    for (const defectSubtype of chooseDefectSubtypes(physCount, mentCount)) {
      const defect = chooseRandomDefect(defectSubtype, type, [...chosenNames]);
      if (!defect) continue;
      chosenNames.add(defect.name);
      results.push(buildMutationItemSource(defect));
    }
  }

  return results;
}

/* ----------------------------------------------------------- */
/*  Chat summary                                               */
/* ----------------------------------------------------------- */

async function postChargenChat(actor, { method, type, stats, derived, mutationDocs, animalForm = "", mutationMethod = "random" }) {
  const statLines = ATTRIBUTE_KEYS.map((k) => {
    const label = game.i18n.localize(`GAMMA_WORLD.Attribute.${k.toUpperCase()}.abbr`);
    return `<li><strong>${label}</strong>: ${stats[k]}</li>`;
  }).join("");

  const mutLines = mutationDocs.length
    ? mutationDocs.map((m) => `<li>${m.name} <em>(${m.system.subtype})</em></li>`).join("")
    : `<li><em>${game.i18n.localize("GAMMA_WORLD.Mutation.Empty")}</em></li>`;

  const typeLabel = game.i18n.localize(
    { "psh": "GAMMA_WORLD.CharacterType.PSH",
      "humanoid": "GAMMA_WORLD.CharacterType.Humanoid",
      "mutated-animal": "GAMMA_WORLD.CharacterType.MutatedAnimal",
      "robot": "GAMMA_WORLD.CharacterType.Robot" }[type]
  );
  const methodLabel = game.i18n.localize(
    { "raw": "GAMMA_WORLD.Chargen.Method.Raw",
      "4d6dl": "GAMMA_WORLD.Chargen.Method.4d6dl",
      "standardArray": "GAMMA_WORLD.Chargen.Method.StandardArray",
      "pointBuy": "GAMMA_WORLD.Chargen.Method.PointBuy" }[method]
  );
  const mutationMethodLabel = game.i18n.localize(
    mutationMethod === "choose"
      ? "GAMMA_WORLD.Chargen.MutationMethod.Choose"
      : "GAMMA_WORLD.Chargen.MutationMethod.Random"
  );

  const content = `
    <div class="gamma-world chargen-summary">
      <h3>${game.i18n.localize("GAMMA_WORLD.Chargen.Chat.Generated")}: ${actor.name}</h3>
      <p><strong>${game.i18n.localize("GAMMA_WORLD.Chargen.Chat.Method")}:</strong> ${methodLabel}
         — <strong>${typeLabel}</strong></p>
      ${animalForm ? `<p><strong>${game.i18n.localize("GAMMA_WORLD.Chargen.AnimalForm")}:</strong> ${animalForm}</p>` : ""}
      <p><strong>Mutation generation:</strong> ${mutationMethodLabel}</p>
      <p><strong>${game.i18n.localize("GAMMA_WORLD.Chargen.Chat.Stats")}:</strong></p>
      <ul>${statLines}</ul>
      <p><strong>${game.i18n.localize("GAMMA_WORLD.Chargen.Chat.Derived")}:</strong>
         HP ${derived.hp} · AC ${derived.ac} · MR ${derived.mr} · RR ${derived.rr} · PR ${derived.pr}
      </p>
      <p><strong>${game.i18n.localize("GAMMA_WORLD.Chargen.Chat.Mutations")}:</strong></p>
      <ul>${mutLines}</ul>
    </div>`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { [SYSTEM_ID]: { chargen: { actorId: actor.id, method, type } } }
  });
}

/* ----------------------------------------------------------- */
/*  Public entry                                               */
/* ----------------------------------------------------------- */

/**
 * Orchestrator: run the chargen dialog flow and apply results to `actor`.
 */
export async function autoRollCharacter(actor) {
  if (actor.system.chargen?.rolled) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("GAMMA_WORLD.Chargen.Title") },
      content: `<p>${game.i18n.localize("GAMMA_WORLD.Error.ChargenAlreadyRolled")}<br>Reroll anyway?</p>`
    });
    if (!confirmed) return;
  }

  const result = await chargenFlow(actor);
  if (!result) return;

  const {
    method,
    type,
    stats,
    mutationMethod = "random",
    animalForm = ""
  } = result;

  if (type === "psh") {
    stats.ch = Math.min(18, stats.ch + 3);
  }

  // HP: sum of CN d6
  const hpRoll = await rollHitPoints(stats.cn);
  const derived = computeDerived(stats, type, hpRoll.total);

  // Mutations
  const mutationDocs = await rollMutations(type, { mode: mutationMethod });
  const robotPower = Math.max(10, Number(stats.cn ?? 10));

  // Build the update payload. Single atomic update for determinism.
  const update = {
    "system.details.type": type,
    "system.details.animalForm": type === "mutated-animal" ? animalForm : "",
    "system.details.speech": type === "robot" ? "programmed command speech" : "common",
    "system.chargen.rolled": true,
    "system.chargen.statMethod": method,
    "system.chargen.mutationMethod": mutationMethod,
    "system.chargen.mutationsRolled": mutationDocs.length > 0,
    "system.resources.hp.base":   derived.hp,
    "system.resources.hp.value": derived.hp,
    "system.resources.hp.max":   derived.hp,
    "system.resources.ac":       derived.ac,
    "system.resources.mentalResistance": derived.mr,
    "system.resources.radResistance":    derived.rr,
    "system.resources.poisonResistance": derived.pr,
    "system.robotics.isRobot": type === "robot",
    "system.robotics.mode": type === "robot" ? "programmed" : actor.system.robotics.mode,
    "system.robotics.powerSource": type === "robot" ? "broadcast" : actor.system.robotics.powerSource,
    "system.robotics.powerCurrent": type === "robot" ? robotPower : actor.system.robotics.powerCurrent,
    "system.robotics.powerMax": type === "robot" ? robotPower : actor.system.robotics.powerMax,
    "system.robotics.broadcastCapable": type === "robot" ? true : actor.system.robotics.broadcastCapable
  };
  for (const key of ATTRIBUTE_KEYS) {
    update[`system.attributes.${key}.value`] = stats[key];
  }

  await actor.update(update);
  const existingMutations = actor.items.filter((item) => item.type === "mutation");
  if (existingMutations.length) {
    await actor.deleteEmbeddedDocuments("Item", existingMutations.map((item) => item.id));
  }
  if (mutationDocs.length) {
    await actor.createEmbeddedDocuments("Item", mutationDocs);
  }
  await actor.refreshDerivedResources({ adjustCurrent: true });

  // Show the HP roll for transparency.
  await hpRoll.roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor:  `Hit Points (${stats.cn}d6)`
  });

  await postChargenChat(actor, {
    method,
    type,
    stats,
    derived: {
      hp: actor.system.resources.hp.max,
      ac: actor.system.resources.ac,
      mr: actor.system.resources.mentalResistance,
      rr: actor.system.resources.radResistance,
      pr: actor.system.resources.poisonResistance
    },
    mutationDocs,
    animalForm,
    mutationMethod
  });
}
