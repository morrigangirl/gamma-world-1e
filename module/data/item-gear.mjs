/** GearData — Item.type === "gear". Generic equipment / mundane items. */

const { SchemaField, NumberField, StringField, HTMLField, BooleanField, ArrayField } =
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
