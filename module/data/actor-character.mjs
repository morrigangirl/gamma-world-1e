/**
 * CharacterData — DataModel for Actor.type === "character".
 * Registered at init via CONFIG.Actor.dataModels.character.
 */

import { ATTRIBUTE_KEYS, CHARACTER_TYPE_KEYS, DAMAGE_TYPES } from "../config.mjs";

const { SchemaField, NumberField, StringField, HTMLField, BooleanField, ArrayField, SetField } =
  foundry.data.fields;

/**
 * Phase 5 — declarative damage-trait schema. Each of the three trait
 * sets is a Set<DAMAGE_TYPES> that contributes a multiplier in
 * `applyIncomingDamage` (immune=0, resist=0.5, vulnerable=2). The three
 * sets stack with priority: immunity > vulnerability > resistance.
 */
const damageTraitField = () => new SetField(new StringField({
  required: false,
  blank: false,
  choices: () => [...DAMAGE_TYPES]
}));

const int = (opts = {}) => new NumberField({
  required: true, nullable: false, integer: true, ...opts
});

const str = (opts = {}) => new StringField({
  required: true, nullable: false, ...opts
});

/** Shared sub-schema for each of the six attributes. */
function attributeField() {
  return new SchemaField({
    value: int({ initial: 10, min: 1, max: 21 }),
    mod:   int({ initial: 0 }),   // derived, stored for template use
    save:  int({ initial: 0 })    // derived/stored bonus applied on saves
  });
}

export class CharacterData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    const attrFields = Object.fromEntries(
      ATTRIBUTE_KEYS.map((key) => [key, attributeField()])
    );

    return {
      details: new SchemaField({
        type:       str({ initial: "psh", choices: CHARACTER_TYPE_KEYS }),
        animalForm: str({ initial: "" }),
        level:      int({ initial: 1, min: 1 }),
        xp:         int({ initial: 0, min: 0 }),
        movement:   int({ initial: 120 }),
        alliance:   str({ initial: "" }),
        role:       str({ initial: "adventurer" }),
        speech:     str({ initial: "common" }),
        creatureClass: str({ initial: "" })
      }),

      attributes: new SchemaField(attrFields),

      advancement: new SchemaField({
        /** d10 attribute bonus rolls granted at level-up, still to be spent. */
        availableBonuses: new ArrayField(new StringField({ nullable: false })),
        /** History of applied bonus rolls (attribute key per level). */
        appliedBonuses:   new ArrayField(new StringField({ nullable: false }))
      }),

      combat: new SchemaField({
        baseAc: int({ initial: 10, min: 1, max: 10 }),
        naturalAttack: new SchemaField({
          name:   str({ initial: "Natural Attack" }),
          damage: str({ initial: "1d3" })
        }),
        fatigue: new SchemaField({
          /** Current melee-turn index (0 = first round, no fatigue yet). */
          round:    int({ initial: 0, min: 0 }),
          /** Derived cumulative to-hit penalty from the Fatigue Factors matrix. */
          modifier: int({ initial: 0 })
        })
      }),

      traits: new SchemaField({
        damageResistance:    damageTraitField(),
        damageImmunity:      damageTraitField(),
        damageVulnerability: damageTraitField()
      }),

      encumbrance: new SchemaField({
        carried:   new NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
        max:       new NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
        penalized: new BooleanField({ initial: false })
      }),

      resources: new SchemaField({
        hp: new SchemaField({
          base:      int({ initial: 10, min: 0 }),
          value:     int({ initial: 10, min: -99 }),
          max:       int({ initial: 10, min: 0 }),
          formula:   str({ initial: "@attributes.cn.value d6" }),
          restDaily: int({ initial: 1, min: 0 }),
          medical:   int({ initial: 0 })
        }),
        ac:               int({ initial: 10 }),   // descending AC
        mentalResistance: int({ initial: 0 }),
        radResistance:    int({ initial: 0 }),
        poisonResistance: int({ initial: 0 })
      }),

      biography: new SchemaField({
        value:      new HTMLField(),
        appearance: new HTMLField(),
        notes:      new HTMLField()
      }),

      social: new SchemaField({
        languages: str({ initial: "Common" }),
        literacy: str({ initial: "" }),
        relatives: str({ initial: "" }),
        homeRegion: str({ initial: "" }),
        reputation: int({ initial: 0 })
      }),

      encounter: new SchemaField({
        reactionModifier: int({ initial: 0 }),
        surpriseModifier: int({ initial: 0 }),
        morale: int({ initial: 0 }),
        intelligence: str({ initial: "auto", choices: ["auto", "non-intelligent", "semi-intelligent", "intelligent"] }),
        cannotBeSurprised: new BooleanField({ initial: false })
      }),

      robotics: new SchemaField({
        isRobot: new BooleanField({ initial: false }),
        mode: str({ initial: "inactive", choices: ["inactive", "programmed", "wild", "controlled"] }),
        chassis: str({ initial: "" }),
        identifier: str({ initial: "" }),
        controller: str({ initial: "" }),
        powerSource: str({ initial: "none", choices: ["none", "broadcast", "nuclear", "hydrogen", "solar", "chemical"] }),
        powerCurrent: int({ initial: 0, min: 0 }),
        powerMax: int({ initial: 0, min: 0 }),
        broadcastCapable: new BooleanField({ initial: false }),
        backupHours: int({ initial: 0, min: 0 }),
        repairDifficulty: int({ initial: 0, min: 0 }),
        malfunction: str({ initial: "" })
      }),

      chargen: new SchemaField({
        rolled:          new BooleanField({ initial: false }),
        statMethod:      str({ initial: "raw" }),
        mutationMethod:  str({ initial: "random" }),
        mutationsRolled: new BooleanField({ initial: false })
      })
    };
  }

  /** Compute values that are derivable from stored fields. */
  prepareDerivedData() {
    // Attribute modifiers (d20-style, used for sheet display and some rolls).
    for (const key of ATTRIBUTE_KEYS) {
      const a = this.attributes[key];
      a.mod = Math.floor((a.value - 10) / 2);
    }
  }
}
