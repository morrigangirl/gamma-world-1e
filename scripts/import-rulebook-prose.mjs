#!/usr/bin/env node
/**
 * Rulebook prose importer.
 *
 * Reads plain Markdown files from `ref/rulebook-prose/` and emits a
 * generated module `scripts/rulebook-prose.generated.mjs` that overlays
 * user-provided prose onto the paraphrased stub chapters in
 * `scripts/rulebook-content.mjs`.
 *
 * Workflow:
 *   1. Transcribe or OCR the rulebook into per-chapter Markdown files in
 *      `ref/rulebook-prose/`, named after the chapter (see README there).
 *   2. Run `npm run import:rulebook-prose`.
 *   3. Run `npm run build:compendia`. The rulebook pack now includes your
 *      prose alongside the factual tables.
 *
 * Markdown subset supported:
 *   # Chapter title            (optional; ignored — chapter inferred from filename)
 *   ## Section name            (H2 becomes a new JournalEntry page)
 *   ### Subheading             (H3)
 *   - item                     (bulleted list)
 *   1. item                    (numbered list)
 *   | a | b | c |              (pipe tables)
 *   | --- | --- | --- |
 *   **bold** *italic*          (inline formatting)
 *   Plain paragraphs separated by blank lines.
 *
 * Unknown syntax passes through as text.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const proseDir = path.join(repoRoot, "ref", "rulebook-prose");
const outputPath = path.join(repoRoot, "scripts", "rulebook-prose.generated.mjs");

/**
 * Map chapter filename (slug) → matching chapter name in rulebook-content.mjs.
 * The filename convention is lowercase-hyphenated; the chapter key is the
 * "NN. Title" string used in the stub module. Both full-number-prefixed and
 * bare slugs are accepted.
 */
const CHAPTER_SLUG_TO_NAME = {
  "01-introduction":                  "1. Introduction",
  "introduction":                     "1. Introduction",
  "02-designing-gamma-world":         "2. Designing Gamma World",
  "designing-gamma-world":            "2. Designing Gamma World",
  "03-creating-characters":           "3. Creating Characters",
  "creating-characters":              "3. Creating Characters",
  "04-mutations":                     "4. Mutations",
  "mutations":                        "4. Mutations",
  "05-play-of-the-game":              "5. Play of the Game",
  "play-of-the-game":                 "5. Play of the Game",
  "06-artifacts-and-equipment":       "6. Artifacts and Equipment",
  "artifacts-and-equipment":          "6. Artifacts and Equipment",
  "07-standard-devices-and-materials":"7. Standard Devices and Materials",
  "standard-devices-and-materials":   "7. Standard Devices and Materials",
  "08-robotic-units":                 "8. Robotic Units",
  "robotic-units":                    "8. Robotic Units",
  "09-experience":                    "9. Experience",
  "experience":                       "9. Experience",
  "10-example-of-play":               "10. Example of Play",
  "example-of-play":                  "10. Example of Play",
  "11-homebrew":                      "11. Homebrew & Departures",
  "homebrew":                         "11. Homebrew & Departures"
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
  // Escape first, then re-apply trusted markers.
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
  // Expect header row, separator row, then body rows.
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
    html: `<table class="gw-rulebook__table">${headHtml}${bodyHtml}</table>`,
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

    if (trimmed.startsWith("### ")) {
      out.push(`<h4>${inlineMarkdownToHtml(trimmed.slice(4))}</h4>`);
      i += 1;
      continue;
    }

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

    // Collect a paragraph: consecutive non-blank lines without special prefix.
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

function parseChapterMarkdown(markdown) {
  // Split by "## " markers into sections; first preamble before any H2 becomes
  // the chapter intro.
  const lines = markdown.split(/\r?\n/);
  const sections = [];
  let currentName = null;
  let currentLines = [];

  const flush = () => {
    if (!currentLines.length && !currentName) return;
    const body = convertBlock(currentLines);
    if (currentName) {
      sections.push({ name: currentName, body });
    } else if (body) {
      sections.push({ name: "Overview", body });
    }
    currentName = null;
    currentLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      // Chapter title; skip (inferred from filename).
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flush();
      currentName = trimmed.slice(3).trim();
      continue;
    }
    currentLines.push(line);
  }
  flush();

  return sections;
}

function chapterSlugToName(filename) {
  const slug = path.basename(filename, path.extname(filename)).toLowerCase();
  return CHAPTER_SLUG_TO_NAME[slug] ?? null;
}

function main() {
  if (!fs.existsSync(proseDir)) {
    console.error(`No prose directory at ${proseDir}. Nothing to import.`);
    fs.writeFileSync(outputPath, "export const RULEBOOK_PROSE = {};\n", "utf8");
    return;
  }

  const files = fs.readdirSync(proseDir).filter((f) => /\.(md|markdown)$/i.test(f));
  if (!files.length) {
    console.log("No markdown prose files found. Writing empty overlay.");
    fs.writeFileSync(outputPath, "export const RULEBOOK_PROSE = {};\n", "utf8");
    return;
  }

  const overlay = {};
  for (const file of files) {
    const chapterName = chapterSlugToName(file);
    if (!chapterName) {
      console.warn(`Skipping ${file}: no matching chapter for this filename. See the slug map in ${path.basename(import.meta.url)}.`);
      continue;
    }
    const raw = fs.readFileSync(path.join(proseDir, file), "utf8");
    const sections = parseChapterMarkdown(raw);
    if (!sections.length) {
      console.warn(`Skipping ${file}: no sections parsed.`);
      continue;
    }
    overlay[chapterName] = sections;
    console.log(`Imported ${file} → "${chapterName}" (${sections.length} section(s))`);
  }

  const body = [
    "// Generated by scripts/import-rulebook-prose.mjs. Do not edit by hand.",
    `// ${new Date().toISOString()}`,
    "",
    "/**",
    " * User-provided rulebook prose, keyed by chapter name.",
    " * Each value is an array of { name, body } sections; body is HTML.",
    " */",
    "export const RULEBOOK_PROSE = " + JSON.stringify(overlay, null, 2) + ";",
    ""
  ].join("\n");
  fs.writeFileSync(outputPath, body, "utf8");
  console.log(`Wrote ${outputPath} with ${Object.keys(overlay).length} chapter(s).`);
}

main();
