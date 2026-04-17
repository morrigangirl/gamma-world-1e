/**
 * Chargen dialogs — method/type picker + stat assignment.
 *
 * Exports:
 *   chargenFlow(actor) → { method, type, stats } | null
 */

import {
  ATTRIBUTE_KEYS,
  CHARACTER_TYPES,
  STAT_METHODS,
  STANDARD_ARRAY,
  MUTATION_SELECTION_METHODS
} from "../config.mjs";
import {
  POINT_BUY_MIN, POINT_BUY_MAX, POINT_BUY_BUDGET,
  costFor, totalCost, defaultPointBuy
} from "./point-buy.mjs";

const DialogV2 = foundry.applications.api.DialogV2;

/* ----------------------------------------------------------- */
/*  Helpers                                                    */
/* ----------------------------------------------------------- */

function readValue(root, name) {
  const el = root.querySelector(`[name="${name}"]`);
  return el ? el.value : "";
}

/* ----------------------------------------------------------- */
/*  Step 1: method + type                                      */
/* ----------------------------------------------------------- */

async function showMethodAndTypeDialog() {
  const methodOptions = Object.entries(STAT_METHODS)
    .map(([key, label]) => `<option value="${key}">${game.i18n.localize(label)}</option>`)
    .join("");
  const typeOptions = Object.entries(CHARACTER_TYPES)
    .map(([key, label]) => `<option value="${key}">${game.i18n.localize(label)}</option>`)
    .join("");
  const mutationOptions = Object.entries(MUTATION_SELECTION_METHODS)
    .map(([key, label]) => `<option value="${key}">${game.i18n.localize(label)}</option>`)
    .join("");

  const content = `
    <div class="gw-chargen gw-chargen--method">
      <div class="form-group">
        <label for="gw-chargen-method">${game.i18n.localize("GAMMA_WORLD.Chargen.ChooseMethod")}</label>
        <select id="gw-chargen-method" name="method">${methodOptions}</select>
      </div>
      <div class="form-group">
        <label for="gw-chargen-type">${game.i18n.localize("GAMMA_WORLD.Chargen.ChooseType")}</label>
        <select id="gw-chargen-type" name="type">${typeOptions}</select>
      </div>
      <div class="form-group">
        <label for="gw-chargen-mutation-method">${game.i18n.localize("GAMMA_WORLD.Chargen.ChooseMutationMethod")}</label>
        <select id="gw-chargen-mutation-method" name="mutationMethod">${mutationOptions}</select>
      </div>
      <div class="form-group">
        <label for="gw-chargen-animal-form">${game.i18n.localize("GAMMA_WORLD.Chargen.AnimalForm")}</label>
        <input id="gw-chargen-animal-form" type="text" name="animalForm" placeholder="Bear / Wolf / Hawk">
      </div>
    </div>
  `;

  return DialogV2.prompt({
    window: { title: game.i18n.localize("GAMMA_WORLD.Chargen.Title") },
    content,
    ok: {
      label: game.i18n.localize("GAMMA_WORLD.Chargen.Accept"),
      callback: (_ev, _button, dialog) => {
        const root = dialog.element;
        const method = readValue(root, "method");
        const type = readValue(root, "type");
        const mutationMethod = readValue(root, "mutationMethod") || "random";
        const animalForm = readValue(root, "animalForm") || "";
        if (!method || !type) return null;
        return { method, type, mutationMethod, animalForm };
      }
    },
    rejectClose: false
  });
}

/* ----------------------------------------------------------- */
/*  Step 2a: fixed-value assignment (4d6dl / standardArray)    */
/* ----------------------------------------------------------- */

function roll4d6dlOnce() {
  const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
  rolls.sort((a, b) => a - b);
  rolls.shift();
  return rolls.reduce((s, n) => s + n, 0);
}

function roll4d6dlSix() {
  const arr = Array.from({ length: 6 }, roll4d6dlOnce);
  arr.sort((a, b) => b - a);
  return arr;
}

function roll3d6() {
  return (Math.floor(Math.random() * 6) + 1)
    + (Math.floor(Math.random() * 6) + 1)
    + (Math.floor(Math.random() * 6) + 1);
}

function rollRawStats() {
  const stats = {};
  for (const key of ATTRIBUTE_KEYS) stats[key] = roll3d6();
  return stats;
}

async function showAssignmentDialog(values) {
  const valuesCopy = [...values];

  const rows = ATTRIBUTE_KEYS.map((key) => {
    const keyU = key.toUpperCase();
    const label = game.i18n.localize(`GAMMA_WORLD.Attribute.${keyU}.abbr`);
    const full  = game.i18n.localize(`GAMMA_WORLD.Attribute.${keyU}.full`);
    const opts  = ['<option value="">—</option>']
      .concat(valuesCopy.map((v, i) => `<option value="${v}" data-idx="${i}">${v}</option>`))
      .join("");
    return `
      <div class="gw-chargen-row">
        <label title="${full}" class="gw-chargen-attr-label">${label}</label>
        <select name="${key}" class="gw-stat-select" data-attr="${key}">${opts}</select>
      </div>
    `;
  }).join("");

  const content = `
    <div class="gw-chargen gw-chargen--assign">
      <p>${game.i18n.localize("GAMMA_WORLD.Chargen.Assign")}</p>
      <p><strong>Values:</strong> ${valuesCopy.join(", ")}</p>
      <div class="gw-chargen-grid">${rows}</div>
    </div>
  `;

  return DialogV2.prompt({
    window: { title: game.i18n.localize("GAMMA_WORLD.Chargen.Title") },
    content,
    render: (_event, dialog) => {
      const selects = dialog.element.querySelectorAll(".gw-stat-select");
      const update = () => {
        // Track (value, source-idx) pairs already in use, so equal-value options
        // (e.g., two 13s from 4d6dl) can each still be picked once.
        const usedPairs = new Set();
        selects.forEach((s) => {
          if (s.value !== "") {
            const opt = s.options[s.selectedIndex];
            usedPairs.add(`${s.value}:${opt.dataset.idx ?? ""}`);
          }
        });
        selects.forEach((s) => {
          [...s.options].forEach((opt) => {
            if (opt.value === "") { opt.disabled = false; return; }
            const pair = `${opt.value}:${opt.dataset.idx ?? ""}`;
            const selectedHere = (s.value === opt.value && s.options[s.selectedIndex] === opt);
            opt.disabled = !selectedHere && usedPairs.has(pair);
          });
        });
      };
      selects.forEach((s) => s.addEventListener("change", update));
      update();
    },
    ok: {
      label: game.i18n.localize("GAMMA_WORLD.Chargen.Accept"),
      callback: (_ev, _button, dialog) => {
        const root = dialog.element;
        const stats = {};
        for (const key of ATTRIBUTE_KEYS) {
          const v = parseInt(readValue(root, key), 10);
          if (!Number.isInteger(v)) {
            ui.notifications?.warn("Please assign each value to exactly one attribute.");
            return null;
          }
          stats[key] = v;
        }
        const picked = ATTRIBUTE_KEYS.map((k) => stats[k]).sort((a, b) => b - a);
        const expected = [...valuesCopy].sort((a, b) => b - a);
        if (picked.join(",") !== expected.join(",")) {
          ui.notifications?.warn("Please assign each value to exactly one attribute.");
          return null;
        }
        return stats;
      }
    },
    rejectClose: false
  });
}

/* ----------------------------------------------------------- */
/*  Step 2b: point-buy                                         */
/* ----------------------------------------------------------- */

async function showPointBuyDialog() {
  const initial = defaultPointBuy();

  const rows = ATTRIBUTE_KEYS.map((key) => {
    const keyU = key.toUpperCase();
    const label = game.i18n.localize(`GAMMA_WORLD.Attribute.${keyU}.abbr`);
    const full  = game.i18n.localize(`GAMMA_WORLD.Attribute.${keyU}.full`);
    return `
      <div class="gw-chargen-pb-row">
        <label title="${full}" class="gw-chargen-attr-label">${label}</label>
        <input type="number" name="${key}" class="gw-pb-input" data-attr="${key}"
               min="${POINT_BUY_MIN}" max="${POINT_BUY_MAX}" step="1" value="${initial[key]}">
        <span class="gw-pb-cost" data-attr="${key}">(0)</span>
      </div>
    `;
  }).join("");

  const content = `
    <div class="gw-chargen gw-chargen--pointbuy">
      <p>${game.i18n.localize("GAMMA_WORLD.Chargen.PointsLeft")}:
         <strong class="gw-pb-remaining">${POINT_BUY_BUDGET}</strong> / ${POINT_BUY_BUDGET}
      </p>
      <div class="gw-chargen-grid">${rows}</div>
    </div>
  `;

  return DialogV2.prompt({
    window: { title: game.i18n.localize("GAMMA_WORLD.Chargen.Title") },
    content,
    render: (_event, dialog) => {
      const root = dialog.element;
      const inputs = root.querySelectorAll(".gw-pb-input");
      const costSpans = Array.from(root.querySelectorAll(".gw-pb-cost"));
      const remainingSpan = root.querySelector(".gw-pb-remaining");
      const update = () => {
        const stats = {};
        for (const input of inputs) {
          let v = parseInt(input.value, 10);
          if (!Number.isInteger(v)) v = POINT_BUY_MIN;
          v = Math.min(POINT_BUY_MAX, Math.max(POINT_BUY_MIN, v));
          input.value = v;
          stats[input.dataset.attr] = v;
        }
        costSpans.forEach((span) => {
          const key = span.dataset.attr;
          const c = costFor(stats[key]);
          span.textContent = `(${c})`;
        });
        const spent = totalCost(stats);
        remainingSpan.textContent = `${Math.max(0, POINT_BUY_BUDGET - spent)}`;
        remainingSpan.style.color = spent > POINT_BUY_BUDGET ? "var(--color-warm-2, #c33)" : "";
      };
      inputs.forEach((i) => i.addEventListener("input", update));
      update();
    },
    ok: {
      label: game.i18n.localize("GAMMA_WORLD.Chargen.Accept"),
      callback: (_ev, _button, dialog) => {
        const root = dialog.element;
        const stats = {};
        for (const key of ATTRIBUTE_KEYS) {
          const v = parseInt(readValue(root, key), 10);
          if (!Number.isInteger(v) || v < POINT_BUY_MIN || v > POINT_BUY_MAX) return null;
          stats[key] = v;
        }
        if (totalCost(stats) > POINT_BUY_BUDGET) {
          ui.notifications?.warn(`Point buy exceeds budget (${POINT_BUY_BUDGET}).`);
          return null;
        }
        return stats;
      }
    },
    rejectClose: false
  });
}

/* ----------------------------------------------------------- */
/*  Public entry                                               */
/* ----------------------------------------------------------- */

export async function chargenFlow(_actor) {
  const step1 = await showMethodAndTypeDialog();
  if (!step1 || !step1.method || !step1.type) return null;
  const {
    method,
    type,
    mutationMethod = "random",
    animalForm = ""
  } = step1;

  let stats;
  if (method === "raw") {
    stats = rollRawStats();
  } else if (method === "pointBuy") {
    stats = await showPointBuyDialog();
  } else if (method === "standardArray") {
    stats = await showAssignmentDialog([...STANDARD_ARRAY]);
  } else {
    stats = await showAssignmentDialog(roll4d6dlSix());
  }
  if (!stats) return null;

  // Defensive: every attribute must be a finite integer before we proceed.
  for (const key of ATTRIBUTE_KEYS) {
    if (!Number.isFinite(stats[key])) return null;
  }

  return { method, type, stats, mutationMethod, animalForm };
}
