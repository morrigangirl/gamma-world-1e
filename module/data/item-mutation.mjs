/** MutationData — Item.type === "mutation". */

const { SchemaField, NumberField, StringField, HTMLField, BooleanField } =
  foundry.data.fields;

const int = (opts = {}) => new NumberField({
  required: true, nullable: false, integer: true, ...opts
});
const str = (opts = {}) => new StringField({
  required: true, nullable: false, ...opts
});

export class MutationData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      code: int({ initial: 0, min: 0, max: 100 }),
      subtype:  str({ initial: "physical",
        choices: ["physical", "mental", "defect"] }),
      category: str({ initial: "beneficial",
        choices: ["beneficial", "defect"] }),

      summary: str({ initial: "" }),

      reference: new SchemaField({
        table:   str({ initial: "" }),
        page:    int({ initial: 0, min: 0 }),
        variant: str({ initial: "" })
      }),

      /** True when the mutation is an active power that must be activated. */
      active: new BooleanField({ initial: false }),

      activation: new SchemaField({
        mode: str({ initial: "passive",
          choices: ["passive", "action", "toggle"] }),
        enabled:   new BooleanField({ initial: false }),
        remaining: int({ initial: 0, min: 0 })
      }),

      range:    str({ initial: "" }),    // free-form
      duration: str({ initial: "" }),

      usage: new SchemaField({
        limited: new BooleanField({ initial: false }),
        per:     str({ initial: "day",
          choices: ["day", "week", "encounter", "scene", "at-will"] }),
        uses:    int({ initial: 0, min: 0 }),
        max:     int({ initial: 0, min: 0 })
      }),

      cooldown: new SchemaField({
        current: int({ initial: 0, min: 0 }),
        max:     int({ initial: 0, min: 0 })
      }),

      /** Optional structured mechanical effect for automation. */
      effect: new SchemaField({
        formula:  str({ initial: "" }),   // e.g. "3d6"
        saveType: str({ initial: "" }),   // "mental" | "radiation" | "poison" | ""
        notes:    str({ initial: "" })
      }),

      description: new SchemaField({
        value: new HTMLField()
      })
    };
  }
}
