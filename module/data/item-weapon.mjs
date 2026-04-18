/** WeaponData — Item.type === "weapon". */

const { SchemaField, NumberField, StringField, HTMLField, BooleanField } =
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

  static defineSchema() {
    return {
      weaponClass: int({ initial: 1, min: 1, max: 16 }),
      category: str({ initial: "primitive",
        choices: ["primitive", "modern", "artifact", "natural"] }),
      /** Ammo type key (see AMMO_TYPES in config.mjs). Empty = no ammo required. */
      ammoType: str({ initial: "" }),

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
