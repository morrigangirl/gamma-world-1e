#!/usr/bin/env node
/**
 * Mutation description importer.
 *
 * Reads `ref/rulebook-prose/06-Updated-Mutations.md` and emits
 * `scripts/mutation-descriptions.generated.mjs` — a subtype-keyed
 * lookup table the pack builder uses to populate each mutation
 * item's `system.description.value`.
 *
 * Workflow:
 *   1. Edit `ref/rulebook-prose/06-Updated-Mutations.md`
 *   2. `npm run build:mutation-descriptions`
 *   3. `npm run build:compendia && npm run seal:packs`
 *
 * Markdown subset supported:
 *   ## Section name            (H2 marks a subtype: Physical / Mental / Plant)
 *   ### N. Mutation Name (D)   (H3, number + name; optional trailing " (D)")
 *   | a | b | c |              (pipe tables)
 *   | --- | --- | --- |
 *   **bold** *italic* `code`   (inline formatting)
 *   Plain paragraphs separated by blank lines.
 *
 * Output shape:
 *   export const MUTATION_DESCRIPTIONS = {
 *     physical: { "attraction odor": "<p>...</p>", ... },
 *     mental:   { ... },
 *     plant:    { ... }
 *   };
 *
 * Names are normalized to lowercase for lookup; the pack builder
 * applies the same normalization when reading back. Mutations in
 * the pack whose name doesn't match any markdown entry keep their
 * current (summary-based) description unchanged.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const mdPath = path.join(repoRoot, "ref", "rulebook-prose", "06-Updated-Mutations.md");
const outPath = path.join(repoRoot, "module", "tables", "mutation-descriptions.generated.mjs");

const SUBTYPE_HEADERS = {
  "physical mutations":         "physical",
  "mental mutations":           "mental",
  "plant/vegetable mutations":  "plant",
  "plant mutations":            "plant"
};

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineMarkdownToHtml(text) {
  let out = escapeHtml(text);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\*)/g, "$1<em>$2</em>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  return out;
}

function looksLikeTableSeparator(line) {
  return /^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(line);
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function consumeTable(lines, startIndex) {
  if (startIndex + 1 >= lines.length) return null;
  if (!looksLikeTableSeparator(lines[startIndex + 1])) return null;
  const header = splitTableRow(lines[startIndex]);
  let i = startIndex + 2;
  const body = [];
  while (i < lines.length && lines[i].trim().startsWith("|")) {
    body.push(splitTableRow(lines[i]));
    i += 1;
  }
  const headHtml = `<thead><tr>${header.map((cell) => `<th>${inlineMarkdownToHtml(cell)}</th>`).join("")}</tr></thead>`;
  const bodyHtml = `<tbody>${body.map((row) =>
    `<tr>${row.map((cell) => `<td>${inlineMarkdownToHtml(cell)}</td>`).join("")}</tr>`
  ).join("")}</tbody>`;
  return {
    html: `<table class="gw-mutation__table">${headHtml}${bodyHtml}</table>`,
    lineCount: i - startIndex
  };
}

function convertBlock(lines) {
  const out = [];
  const isListStart = (line) => /^\s*(-|\d+\.)\s/.test(line);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i += 1; continue; }

    if (trimmed.startsWith("|")) {
      const table = consumeTable(lines, i);
      if (table) {
        out.push(table.html);
        i += table.lineCount;
        continue;
      }
    }

    if (isListStart(trimmed)) {
      const ordered = /^\d+\./.test(trimmed);
      const tag = ordered ? "ol" : "ul";
      const items = [];
      while (i < lines.length && isListStart(lines[i].trim())) {
        const item = lines[i].trim().replace(/^(-|\d+\.)\s+/, "");
        items.push(`<li>${inlineMarkdownToHtml(item)}</li>`);
        i += 1;
      }
      out.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    const paraLines = [];
    while (i < lines.length
      && lines[i].trim()
      && !lines[i].trim().startsWith("##")
      && !lines[i].trim().startsWith("### ")
      && !lines[i].trim().startsWith("|")
      && !isListStart(lines[i].trim())) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    if (paraLines.length) {
      out.push(`<p>${inlineMarkdownToHtml(paraLines.join(" "))}</p>`);
    }
  }
  return out.join("");
}

/**
 * Normalize a mutation name for lookup. Lowercase, strip surrounding
 * whitespace, drop trailing " (D)" defect marker, and normalize the
 * one known punctuation variant ("gas generation - musk" vs colon).
 */
function normalizeMutationName(rawName) {
  let name = String(rawName ?? "").trim().toLowerCase();
  name = name.replace(/\s*\(d\)\s*$/i, "");
  // Dash-to-colon: only when the dash is a separator (whitespace on both
  // sides). Preserves hyphenated names like "De-evolution" or
  // "Saw-edged Leaves" while still mapping "Gas Generation - Musk" →
  // "gas generation: musk" to match the ":" form used in the rule data.
  name = name.replace(/\s+-\s+/g, ": ");
  name = name.replace(/\s{2,}/g, " ");
  return name.trim();
}

function parseMutationHeading(line) {
  // "### 14. Genius Capability" → { number: 14, name: "Genius Capability" }
  const m = line.match(/^###\s+(\d+)\.\s+(.+?)\s*$/);
  if (!m) return null;
  return {
    number: Number(m[1]),
    rawName: m[2]
  };
}

function parseMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const result = { physical: {}, mental: {}, plant: {} };

  let currentSubtype = null;
  let currentMutationName = null;
  let currentBody = [];

  const flushMutation = () => {
    if (!currentSubtype || !currentMutationName) {
      currentMutationName = null;
      currentBody = [];
      return;
    }
    const html = convertBlock(currentBody);
    const key = normalizeMutationName(currentMutationName);
    if (key && html) result[currentSubtype][key] = html;
    currentMutationName = null;
    currentBody = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("## ")) {
      flushMutation();
      const header = trimmed.slice(3).trim().toLowerCase();
      currentSubtype = SUBTYPE_HEADERS[header] ?? null;
      if (!currentSubtype) {
        console.warn(`Unknown subtype header "${trimmed}" — skipping section`);
      }
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushMutation();
      const heading = parseMutationHeading(trimmed);
      if (heading) {
        currentMutationName = heading.rawName;
      } else {
        currentMutationName = null;
      }
      continue;
    }

    if (trimmed.startsWith("# ")) continue; // top-level title; skip

    // Collect body lines for the current mutation.
    if (currentMutationName) currentBody.push(line);
  }
  flushMutation();

  return result;
}

function main() {
  if (!fs.existsSync(mdPath)) {
    console.error(`Missing ${mdPath} — run the source extraction first.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(mdPath, "utf8");
  const parsed = parseMarkdown(raw);

  const counts = {
    physical: Object.keys(parsed.physical).length,
    mental:   Object.keys(parsed.mental).length,
    plant:    Object.keys(parsed.plant).length
  };

  const body = [
    "// Generated by scripts/build-mutation-descriptions.mjs. Do not edit by hand.",
    `// ${new Date().toISOString()}`,
    "//",
    "// Source: ref/rulebook-prose/06-Updated-Mutations.md",
    "// Keyed by subtype → normalized lowercase name → HTML.",
    "// The pack builder looks up each mutation's description at",
    "// build time via `mutationDescriptionFor(subtype, name)`.",
    "",
    "export const MUTATION_DESCRIPTIONS = " + JSON.stringify(parsed, null, 2) + ";",
    "",
    "/**",
    " * Normalize a mutation name for lookup. Mirror of the same function",
    " * in the build script so pack-build and runtime resolution produce",
    " * identical keys.",
    " */",
    "export function normalizeMutationName(rawName) {",
    "  let name = String(rawName ?? \"\").trim().toLowerCase();",
    "  name = name.replace(/\\s*\\(d\\)\\s*$/i, \"\");",
    "  name = name.replace(/\\s+-\\s+/g, \": \");",
    "  name = name.replace(/\\s{2,}/g, \" \");",
    "  return name.trim();",
    "}",
    "",
    "export function mutationDescriptionFor(subtype, name) {",
    "  const bucket = MUTATION_DESCRIPTIONS[subtype];",
    "  if (!bucket) return null;",
    "  return bucket[normalizeMutationName(name)] ?? null;",
    "}",
    ""
  ].join("\n");

  fs.writeFileSync(outPath, body, "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(`  physical: ${counts.physical}`);
  console.log(`  mental:   ${counts.mental}`);
  console.log(`  plant:    ${counts.plant}`);
  console.log(`  total:    ${counts.physical + counts.mental + counts.plant}`);
}

main();
