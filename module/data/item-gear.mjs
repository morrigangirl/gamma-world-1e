/** GearData — Item.type === "gear". Generic equipment / mundane items. */

import { ACTION_TYPES } from "../config.mjs";

const { SchemaField, NumberField, StringField, HTMLField, BooleanField, ArrayField, SetField } =
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

export class GearData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      quantity: int({ initial: 1, min: 0 }),
      weight:   num({ initial: 0, min: 0 }),
      /** Reserved for future artifact / tech-level support. */
      tech:     str({ initial: "none",
        choices: ["none", "i", "ii", "iii", "iv", "v", "vi"] }),
      /** High-level subtype for browsing / mechanics. */
      subtype:  str({ initial: "misc",
        choices: ["ammunition", "power-cell", "container", "medical", "vehicle",
                  "tool", "ration", "trade-good", "communication", "explosive", "misc"] }),
      equipped: new BooleanField({ initial: false }),

      /** Container capacity; only meaningful when subtype === "container". */
      container: new SchemaField({
        capacity: num({ initial: 0, min: 0 }),
        stored:   new ArrayField(new StringField({ nullable: false }))
      }),

      /** Ammunition stack; only meaningful when subtype === "ammunition". */
      ammo: new SchemaField({
        type:   str({ initial: "" }),
        rounds: int({ initial: 0, min: 0 })
      }),

      action: new SchemaField({
        mode:            str({ initial: "none" }),
        damageFormula:   str({ initial: "" }),
        saveType:        str({ initial: "" }),
        intensityFormula:str({ initial: "" }),
        radius:          int({ initial: 0, min: 0 }),
        durationFormula: str({ initial: "" }),
        acDelta:         int({ initial: 0 }),
        toHitDelta:      int({ initial: 0 }),
        status:          str({ initial: "" }),
        consumeQuantity: int({ initial: 0, min: 0 }),
        ongoing:         new BooleanField({ initial: false }),
        notes:           str({ initial: "" })
      }),

      /**
       * Area-of-effect descriptor for grenades, gas clouds, explosives, and
       * other ordnance. A gear item is treated as an AOE when
       * `system.area.radius > 0`. Non-circle shapes and animation hooks are
       * optional and default to sensible fallbacks.
       *
       * Fields:
       *   shape             — "circle" | "cone" | "line" (default circle)
       *   radius            — meters; 0 disables the AOE flow
       *   persistentRounds  — 0 = instantaneous; >0 = cloud lingers N rounds
       *   animationKey      — key into animations.mjs profile registry
       *   saveType          — "poison" | "radiation" | "mental" | "" (no save)
       *   onFailStatus      — statusId applied to victims on a failed save
       *   halfDamageOnSave  — when true, saving yields half damage
       */
      area: new SchemaField({
        shape:            str({ initial: "circle", choices: ["circle", "cone", "line"] }),
        radius:           num({ initial: 0, min: 0 }),
        persistentRounds: int({ initial: 0, min: 0 }),
        animationKey:     str({ initial: "" }),
        saveType:         str({ initial: "" }),
        onFailStatus:     str({ initial: "" }),
        halfDamageOnSave: new BooleanField({ initial: false })
      }),

      /**
       * 0.10.0 — canonical action-type tags (ACTION_TYPES in config.mjs).
       * Populated at enrichment time from `rule.actionTypes` on the
       * gear rule, or inferred from `action.mode` when the rule omits
       * it. Containers, rations, and trade-goods default to
       * `["utility"]`; grenades to `["attack", "save", "damage"]`.
       */
      actionTypes: new SetField(new StringField({
        required: false,
        blank: false,
        choices: () => [...ACTION_TYPES]
      })),

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
          ambientAvailable: new BooleanField({ initial: false })
        }),
        charges: new SchemaField({
          current: int({ initial: 0, min: 0 }),
          max: int({ initial: 0, min: 0 })
        })
      }),

      description: new SchemaField({
        value: new HTMLField()
      })
    };
  }
}
