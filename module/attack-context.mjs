/**
 * AttackContext — a plain-object record that threads attack-pipeline state
 * through the system, analogous to midi-qol's `Workflow` in concept but
 * dramatically smaller in scope.
 *
 * Phase 2a's goal is intentionally limited: make the context available on
 * every attack chat card's flags so downstream phases (hooks in 2b,
 * undo snapshots in 3, resource tracking in 4) can read a single canonical
 * shape instead of re-parsing the legacy `flags.attack` bag per call site.
 *
 * Nothing today reads this context — it's captured and stored alongside
 * the existing `flags.attack` structure. Behavior is unchanged.
 *
 * Two functions matter:
 *
 *   buildAttackContext({ actor, weapon, target, roll, range, ... })
 *     Assembles a runtime context. Holds live document refs (Actor, Item,
 *     TokenDocument, Roll) for helpers that want them before the card posts.
 *
 *   serializeAttackContext(context)
 *     Returns a JSON-safe snapshot with UUIDs replacing document refs.
 *     This is what's stashed in `ChatMessage.flags[SYSTEM_ID].context` so
 *     the shape survives a world reload and stays portable across clients.
 *
 *   attackContextFromFlags(flags)
 *     Inverse of serialize: read the serialized context back into a plain
 *     object ready for downstream consumers (hook payloads, undo, etc.).
 *     UUIDs are kept as strings — callers that need live docs should
 *     resolve with `fromUuid()`.
 */

export const ATTACK_CONTEXT_VERSION = 1;

function uuidOf(doc) {
  if (!doc) return null;
  if (typeof doc === "string") return doc;
  return doc.uuid ?? null;
}

/**
 * Build a runtime AttackContext from the values a typical attack entry
 * point already has in scope. Every field is optional; the caller passes
 * what they know and the rest stays null/0.
 *
 * `target` should be the resolved-target descriptor most of dice.mjs
 * already uses: `{ actor, targetToken?, targetUuid?, targetTokenUuid?,
 * targetName?, armorClass?, distance? }`. The shape is preserved inside
 * context.target to keep call sites terse.
 *
 * `sourceKind` is one of: "weapon" | "natural" | "mental" | "aoe".
 */
export function buildAttackContext({
  actor = null,
  token = null,
  weapon = null,
  target = null,
  roll = null,
  range = null,
  attackBonus = 0,
  hitTarget = 0,
  hit = false,
  isCritical = false,
  isFumble = false,
  damageFormula = "",
  damageType = "",
  effectMode = "damage",
  effectFormula = "",
  effectStatus = "",
  effectNotes = "",
  weaponTag = "",
  nonlethal = false,
  sourceKind = "weapon",
  sourceName = "",
  resources = null
} = {}) {
  return {
    version: ATTACK_CONTEXT_VERSION,
    sourceKind,
    sourceName: sourceName || weapon?.name || actor?.name || "",
    actor,
    token,
    weapon,
    target,
    roll,
    range: range ? { label: range.label, penalty: range.penalty } : { label: "", penalty: 0 },
    attackBonus: Number(attackBonus) || 0,
    hitTarget: Number(hitTarget) || 0,
    hit: !!hit,
    isCritical: !!isCritical,
    isFumble: !!isFumble,
    damageFormula: damageFormula ?? "",
    damageType: damageType ?? "",
    effect: {
      mode: effectMode || "damage",
      formula: effectFormula || "",
      status: effectStatus || "",
      notes: effectNotes || ""
    },
    weaponTag: weaponTag ?? "",
    nonlethal: !!nonlethal,
    /**
     * Per-item resource consumption snapshots. Populated by Phase 4's
     * `consumeResource` helper; used by Phase 3's undo to refund shots
     * on undo. Empty array on pipelines that don't consume anything.
     */
    resources: Array.isArray(resources) ? resources : []
  };
}

/**
 * JSON-safe snapshot for stashing in ChatMessage flags. Document refs
 * collapse to UUIDs; primitives pass through.
 */
export function serializeAttackContext(context) {
  if (!context) return null;
  return {
    version: context.version ?? ATTACK_CONTEXT_VERSION,
    sourceKind: context.sourceKind ?? "weapon",
    sourceName: context.sourceName ?? "",
    actorUuid: uuidOf(context.actor),
    tokenUuid: uuidOf(context.token),
    weaponUuid: uuidOf(context.weapon),
    target: context.target
      ? {
          actorUuid: context.target.targetUuid ?? uuidOf(context.target.actor),
          tokenUuid: context.target.targetTokenUuid ?? uuidOf(context.target.targetToken),
          name: context.target.targetName ?? context.target.name ?? "",
          armorClass: Number(context.target.armorClass ?? 0) || 0,
          distance: Number(context.target.distance ?? 0) || 0
        }
      : null,
    rollTotal: context.roll?.total ?? null,
    rollFormula: context.roll?.formula ?? null,
    range: context.range ? { label: context.range.label, penalty: context.range.penalty } : null,
    attackBonus: context.attackBonus ?? 0,
    hitTarget: context.hitTarget ?? 0,
    hit: !!context.hit,
    isCritical: !!context.isCritical,
    isFumble: !!context.isFumble,
    damageFormula: context.damageFormula ?? "",
    damageType: context.damageType ?? "",
    effect: {
      mode: context.effect?.mode ?? "damage",
      formula: context.effect?.formula ?? "",
      status: context.effect?.status ?? "",
      notes: context.effect?.notes ?? ""
    },
    weaponTag: context.weaponTag ?? "",
    nonlethal: !!context.nonlethal,
    resources: Array.isArray(context.resources) ? context.resources.slice() : []
  };
}

/**
 * Rehydrate a plain context from a ChatMessage's stored flags. Document
 * refs remain as UUIDs — resolve with `fromUuid()` at the call site when
 * you actually need the live doc.
 *
 * Returns null if the flags don't contain a serialized context (i.e. a
 * chat card from before Phase 2a landed).
 */
export function attackContextFromFlags(flags) {
  const raw = flags?.context;
  if (!raw) return null;
  return {
    version: raw.version ?? 1,
    sourceKind: raw.sourceKind ?? "weapon",
    sourceName: raw.sourceName ?? "",
    actorUuid: raw.actorUuid ?? null,
    tokenUuid: raw.tokenUuid ?? null,
    weaponUuid: raw.weaponUuid ?? null,
    target: raw.target ? { ...raw.target } : null,
    rollTotal: raw.rollTotal ?? null,
    rollFormula: raw.rollFormula ?? null,
    range: raw.range ? { ...raw.range } : null,
    attackBonus: raw.attackBonus ?? 0,
    hitTarget: raw.hitTarget ?? 0,
    hit: !!raw.hit,
    isCritical: !!raw.isCritical,
    isFumble: !!raw.isFumble,
    damageFormula: raw.damageFormula ?? "",
    damageType: raw.damageType ?? "",
    effect: raw.effect ? { ...raw.effect } : { mode: "damage", formula: "", status: "", notes: "" },
    weaponTag: raw.weaponTag ?? "",
    nonlethal: !!raw.nonlethal,
    resources: Array.isArray(raw.resources) ? raw.resources.slice() : []
  };
}
