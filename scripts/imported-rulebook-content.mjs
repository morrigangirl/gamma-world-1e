/**
 * Imported Rulebook pack generator.
 *
 * Sources the owner-transcribed rulebook prose from `ref/rulebook-prose/*.md`
 * (via the overlay that `scripts/import-rulebook-prose.mjs` writes to
 * `scripts/rulebook-prose.generated.mjs`) and produces a JournalEntry pack
 * with one entry per chapter and one page per section.
 *
 * This generator feeds the `imported-rulebook` pack declared in
 * `system.json` and is the only generator consumed by the narrowed
 * `scripts/build-compendia.mjs`. No paraphrased stubs, no factual tables,
 * no `@UUID` link decoration — just the transcribed prose.
 *
 * Workflow:
 *   1. `npm run extract:rulebook-prose`  → writes `ref/rulebook-prose/*.md`
 *   2. Proofread.
 *   3. `npm run import:rulebook-prose`   → writes `rulebook-prose.generated.mjs`
 *   4. `npm run build:compendia`         → wipes + rebuilds `packs/imported-rulebook/`
 *
 * Or: `npm run prose:refresh` for the full chain.
 */

import { RULEBOOK_PROSE } from "./rulebook-prose.generated.mjs";

/**
 * Parse the leading "NN. " token from a chapter name to get a numeric
 * sort key. "1. Introduction" → 1. Returns a large sentinel if the
 * pattern doesn't match so unrecognized keys sort to the end rather
 * than crashing the comparator.
 */
function chapterSortKey(name) {
  const match = /^\s*(\d+)\./.exec(name ?? "");
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/**
 * Shape each overlay section into a Foundry JournalEntryPage document.
 * Section body is already HTML (the importer converts its Markdown
 * subset to HTML at import time).
 */
function buildPage(section) {
  return {
    name: section.name,
    type: "text",
    text: {
      format: 1, // HTML
      content: section.body ?? ""
    }
  };
}

/**
 * Build the ordered list of JournalEntry source documents for the
 * Imported Rulebook pack. Returns `[]` when the overlay is empty so
 * the caller can compile an empty pack without error.
 */
export function importedRulebookPackSources() {
  const entries = Object.entries(RULEBOOK_PROSE ?? {});
  if (!entries.length) {
    console.warn(
      "No rulebook prose present; imported-rulebook pack will be empty. " +
      "Run `npm run import:rulebook-prose` after placing Markdown under " +
      "ref/rulebook-prose/."
    );
    return [];
  }

  const chapters = entries
    .filter(([, sections]) => Array.isArray(sections) && sections.length > 0)
    .map(([name, sections]) => ({
      name,
      pages: sections.map(buildPage)
    }))
    .sort((a, b) => chapterSortKey(a.name) - chapterSortKey(b.name));

  return chapters;
}
