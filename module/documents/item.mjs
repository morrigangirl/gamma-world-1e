/**
 * Gamma World item document helpers.
 */

import { clampArtifactChargesUpdate } from "../hp-clamp.mjs";

export class GammaWorldItem extends Item {
  /**
   * 0.14.13 — enforce `system.artifact.charges.current <=
   * system.artifact.charges.max` for every editor (sheet, macro, API,
   * drain ticks). Mirrors the actor HP clamp: power cells, charged
   * artifacts, and any future capacity-bearing item all share this
   * invariant. The helper is in `module/hp-clamp.mjs`; this hook is the
   * one wiring point.
   */
  async _preUpdate(changed, options, user) {
    const result = await super._preUpdate(changed, options, user);
    if (result === false) return result;

    clampArtifactChargesUpdate(changed, {
      value: this.system?.artifact?.charges?.current,
      max:   this.system?.artifact?.charges?.max
    });

    return result;
  }

  get actorOwner() {
    return this.parent instanceof Actor ? this.parent : null;
  }

  async toggleEquipped() {
    if (!("equipped" in this.system)) return null;
    if ((this.type === "armor") && this.system.artifact?.isArtifact && !this.system.equipped) {
      const actor = this.actorOwner;
      if (!actor) return null;
      const { useArtifactItem } = await import("../artifacts.mjs");
      return useArtifactItem(actor, this);
    }
    return this.update({ "system.equipped": !this.system.equipped });
  }

  async rollAttack() {
    const actor = this.actorOwner;
    if (!actor) return null;
    if (this.system.artifact?.isArtifact) {
      const { useArtifactItem } = await import("../artifacts.mjs");
      return useArtifactItem(actor, this);
    }
    if (this.flags?.["gamma-world-1e"]?.naturalWeapon) {
      const { rollNaturalWeaponAttack } = await import("../dice.mjs");
      return rollNaturalWeaponAttack(actor, this);
    }
    const { rollAttack } = await import("../dice.mjs");
    return rollAttack(actor, this);
  }

  async useMutation() {
    const actor = this.actorOwner;
    if (!actor) return null;
    const { useMutation } = await import("../mutations.mjs");
    return useMutation(actor, this);
  }

  async use() {
    const actor = this.actorOwner;
    if (!actor) return null;

    if (this.type === "mutation") return this.useMutation();
    if (this.system.artifact?.isArtifact) {
      const { useArtifactItem } = await import("../artifacts.mjs");
      return useArtifactItem(actor, this);
    }
    if (this.type === "weapon") return this.rollAttack();
    if (this.type === "gear") {
      const { useGear } = await import("../item-actions.mjs");
      return useGear(actor, this);
    }
    return null;
  }

  async analyzeArtifact() {
    const actor = this.actorOwner;
    if (!actor) return null;
    const { analyzeArtifact } = await import("../artifacts.mjs");
    return analyzeArtifact(actor, this);
  }

  async openArtifactWorkflow() {
    const actor = this.actorOwner;
    if (!actor) return null;
    const { openArtifactWorkflow } = await import("../artifacts.mjs");
    return openArtifactWorkflow(actor, this);
  }
}
