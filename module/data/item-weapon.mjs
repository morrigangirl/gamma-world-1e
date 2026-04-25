/** WeaponData — Item.type === "weapon". */

import { ACTION_TYPES } from "../config.mjs";

const { SchemaField, NumberField, StringField, HTMLField, BooleanField, SetField, ArrayField } =
  foundry.data.fields;

const int = (opts = {}) => new NumberField({
  required: true, nullable: false, integer: true, ...opts
});
const num = (opts = {}) => new NumberField({
  required: true, nullable: false, ...opts
});
const str = (opts = {}) => new StringField({
  required: true, nullable: false, ...opts
});

export class WeaponData extends foundry.abstract.TypeDataModel {

  /**
   * 0.8.1 migrated `ammoType` from a single StringField to a SetField so a
   * weapon can accept more than one kind of ammo (e.g. the Needler takes
   * poison OR paralysis darts). Legacy string values are still flowing in
   * from old world data and from compendium packs built on 0.8.0 — coerce
   * them to a one-element array before the SetField validator runs.
   */
  static migrateData(source) {
    if (typeof source?.ammoType === "string") {
      const trimmed = source.ammoType.trim();
      source.ammoType = trimmed ? [trimmed] : [];
    }
    return super.migrateData(source);
  }

  static defineSchema() {
    return {
      weaponClass: int({ initial: 1, min: 1, max: 16 }),
      category: str({ initial: "primitive",
        choices: ["primitive", "modern", "artifact", "natural"] }),
      /**
       * Set of ammo-type keys the weapon accepts (see AMMO_TYPES in
       * config.mjs). Empty set = no ammo required. A weapon with more than
       * one entry (e.g. Needler) prompts the player at fire-time which
       * loaded stack to consume.
       */
      ammoType: new SetField(new StringField(), { initial: [] }),

      damage: new SchemaField({
        formula: str({ initial: "1d6" }),
        type:    str({ initial: "physical" })
      }),

      range: new SchemaField({
        short:  int({ initial: 0, min: 0 }),
        medium: int({ initial: 0, min: 0 }),
        long:   int({ initial: 0, min: 0 })
      }),

      attackType: str({ initial: "melee",
        choices: ["melee", "ranged", "thrown", "energy"] }),

      rof: int({ initial: 1, min: 0 }),

      /**
       * Legacy inline ammo counter. Preserved for one version cycle so existing
       * content loads without validation errors. New content uses `ammoType`
       * plus a matching gear item with `system.ammo.type` / `system.ammo.rounds`.
       * A migration drains this into a gear item on each actor.
       */
      ammo: new SchemaField({
        current:  int({ initial: 0, min: 0 }),
        max:      int({ initial: 0, min: 0 }),
        consumes: new BooleanField({ initial: false })
      }),

      effect: new SchemaField({
        mode:    str({ initial: "damage", choices: ["damage", "poison", "radiation", "mental", "stun", "paralysis", "death", "note"] }),
        formula: str({ initial: "" }),
        status:  str({ initial: "" }),
        notes:   str({ initial: "" })
      }),

      traits: new SchemaField({
        tag:                  str({ initial: "" }),
        deflectAc2Hits:       int({ initial: 0, min: 0 }),
        deflectAc1Hits:       int({ initial: 0, min: 0 }),
        bypassesForceField:   new BooleanField({ initial: false }),
        requiresNoForceField: new BooleanField({ initial: false }),
        nonlethal:            new BooleanField({ initial: false })
      }),

      /**
       * 0.10.0 — canonical action-type tags (ACTION_TYPES in config.mjs).
       * Populated at pack build via weaponSource; can be edited on a
       * per-item basis to reclassify homebrew weapons. Empty set means
       * the weapon won't surface on any action section of the sheet.
       */
      actionTypes: new SetField(new StringField({
        required: false,
        blank: false,
        choices: () => [...ACTION_TYPES]
      })),

      quantity: int({ initial: 1, min: 0 }),
      weight:   num({ initial: 0, min: 0 }),
      equipped: new BooleanField({ initial: false }),

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
          // device. Drain is split equally across installed cells; order
          // is preserved for stable UI. Kept in sync with cellsInstalled
          // (a count) for one version cycle; cellsInstalled is deprecated
          // in 0.14.0.
          installedCellIds: new ArrayField(new StringField({
            required: false, blank: false
          }), { initial: [] })
        }),
        charges: new SchemaField({
          current: int({ initial: 0, min: 0 }),
          max: int({ initial: 0, min: 0 })
        })
      }),

      // 0.13.0 — declarative consumption rule. `unit` is the tick kind
      // ("shot" for discrete-fire, "clip" for magazine-insert, "minute" /
      // "hour" / "day" for time-drain). `perUnit` is the percent of one
      // cell drained per one tick; fractional values (e.g. 3.333 for a
      // 30-dart Needler, or 2.08 for a 24-hour Portent shield cell-pair)
      // are legal and handled by the accumulator in artifact-power.mjs.
      // An item is subject to cell-drain iff unit !== "" and perUnit > 0
      // AND installedCellIds resolves to at least one cell.
      consumption: new SchemaField({
        unit:    str({ initial: "", choices: ["", "shot", "clip", "minute", "hour", "day"] }),
        perUnit: num({ initial: 0, min: 0 })
      }),

      description: new SchemaField({
        value: new HTMLField()
      })
    };
  }
}
