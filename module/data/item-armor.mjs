/** ArmorData — Item.type === "armor". */

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

      protection: new SchemaField({
        blackRayImmune: new BooleanField({ initial: false }),
        radiationImmune: new BooleanField({ initial: false }),
        poisonImmune: new BooleanField({ initial: false }),
        laserImmune: new BooleanField({ initial: false }),
        mentalImmune: new BooleanField({ initial: false })
      }),

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
