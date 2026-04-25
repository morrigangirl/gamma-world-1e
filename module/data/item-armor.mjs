/** ArmorData — Item.type === "armor". */

import { ACTION_TYPES, DAMAGE_TYPES } from "../config.mjs";

const { SchemaField, NumberField, StringField, HTMLField, BooleanField, SetField, ArrayField } =
  foundry.data.fields;

/**
 * Phase 5: armor can grant damage traits to its wearer (resistance /
 * immunity / vulnerability) via these sets. At derived-data time on the
 * actor, every equipped armor piece's grant sets roll up into the
 * actor's `derived.damage{Resistance,Immunity,Vulnerability}` sets.
 */
const damageTraitField = () => new SetField(new StringField({
  required: false,
  blank: false,
  choices: () => [...DAMAGE_TYPES]
}));

const int = (opts = {}) => new NumberField({
  required: true, nullable: false, integer: true, ...opts
});
const num = (opts = {}) => new NumberField({
  required: true, nullable: false, ...opts
});
const str = (opts = {}) => new StringField({
  required: true, nullable: false, ...opts
});

export class ArmorData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      /** Absolute AC (descending) applied when equipped. */
      acValue:   int({ initial: 9, min: -10, max: 10 }),
      armorType: str({ initial: "light",
        choices: ["none", "light", "medium", "heavy", "shield"] }),
      /** Penalty (or cap) to DX-derived AC while worn. */
      dxPenalty: int({ initial: 0 }),

      field: new SchemaField({
        mode:     str({ initial: "none", choices: ["none", "full", "partial"] }),
        capacity: int({ initial: 0, min: 0 })
      }),

      mobility: new SchemaField({
        flight: int({ initial: 0, min: 0 }),
        jump:   int({ initial: 0, min: 0 }),
        lift:   num({ initial: 0, min: 0 })
      }),

      offense: new SchemaField({
        punchDamage: str({ initial: "" })
      }),

      /**
       * Phase 5 replaces `protection.*Immune` booleans with declarative
       * trait-grant sets. The booleans stay in the schema for a one-
       * version deprecation cycle so a migration can read them and
       * write to `traits.grants*` — new content should not set them.
       */
      protection: new SchemaField({
        blackRayImmune: new BooleanField({ initial: false }),
        radiationImmune: new BooleanField({ initial: false }),
        poisonImmune: new BooleanField({ initial: false }),
        laserImmune: new BooleanField({ initial: false }),
        mentalImmune: new BooleanField({ initial: false })
      }),

      traits: new SchemaField({
        grantsResistance:    damageTraitField(),
        grantsImmunity:      damageTraitField(),
        grantsVulnerability: damageTraitField()
      }),

      /**
       * 0.10.0 — canonical action-type tags (ACTION_TYPES in config.mjs).
       * Default set to `["defense"]` at enrichment time; powered armors
       * add `"movement"` based on their rule's mobility payload.
       */
      actionTypes: new SetField(new StringField({
        required: false,
        blank: false,
        choices: () => [...ACTION_TYPES]
      })),

      equipped: new BooleanField({ initial: false }),
      quantity: int({ initial: 1, min: 0 }),
      weight:   num({ initial: 0, min: 0 }),

      artifact: new SchemaField({
        isArtifact: new BooleanField({ initial: false }),
        category: str({ initial: "none" }),
        chart: str({ initial: "none" }),
        condition: str({ initial: "fair" }),
        functionChance: int({ initial: 0, min: 0, max: 100 }),
        canShortOut: new BooleanField({ initial: true }),
        canExplode: new BooleanField({ initial: false }),
        harmResolutionType: str({ initial: "generic" }),
        harmCallback: str({ initial: "" }),
        identified: new BooleanField({ initial: false }),
        operationKnown: new BooleanField({ initial: false }),
        attempts: int({ initial: 0, min: 0 }),
        malfunction: str({ initial: "" }),
        powerSource: str({ initial: "none" }),
        power: new SchemaField({
          requirement: str({ initial: "none" }),
          compatibleCells: str({ initial: "" }),
          cellSlots: int({ initial: 0, min: 0 }),
          cellsInstalled: int({ initial: 0, min: 0 }),
          installedType: str({ initial: "none" }),
          ambientSource: str({ initial: "none" }),
          ambientAvailable: new BooleanField({ initial: false }),
          // 0.13.0 — UUIDs of the cell items currently installed in this
          // armor. Drain is split equally across installed cells. Kept in
          // sync with cellsInstalled for one version cycle.
          installedCellIds: new ArrayField(new StringField({
            required: false, blank: false
          }), { initial: [] })
        }),
        charges: new SchemaField({
          current: int({ initial: 0, min: 0 }),
          max: int({ initial: 0, min: 0 })
        })
      }),

      // 0.13.0 — declarative per-tick drain. Armor uses unit: "hour" with
      // perUnit = 100 / (hours-per-cell × cellSlots). See CONSUMPTION_CATALOG.
      consumption: new SchemaField({
        // blank: true required — empty unit means "no drain rule" and
        // Foundry's StringField defaults reject "" even when in choices.
        unit:    str({ initial: "", blank: true, choices: ["", "shot", "clip", "minute", "hour", "day"] }),
        perUnit: num({ initial: 0, min: 0 })
      }),

      description: new SchemaField({
        value: new HTMLField()
      })
    };
  }
}
