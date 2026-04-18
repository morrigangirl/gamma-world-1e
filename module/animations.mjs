import { SYSTEM_ID } from "./config.mjs";

const ANIMATION_SETTING = "enablePilotAnimations";
const SEQUENCER_MODULE_ID = "sequencer";
const JB2A_MODULE_IDS = ["jb2a_patreon", "JB2A_DnD5e"];

const SHORT_RANGES = ["15ft", "30ft", "60ft", "90ft", "05ft"];
const LONG_RANGES = ["60ft", "90ft", "30ft", "15ft", "05ft"];
const DEFAULT_INDEXES = [0, 1, 2, 3];
const FULL_MELEE_INDEXES = [0, 1, 2, 3, 4, 5];
const LIGHT_PHYSICAL_IMPACTS = [
  "jb2a.impact.001.orange",
  "jb2a.impact.005.white"
];
const PIERCING_PHYSICAL_IMPACTS = [
  "jb2a.impact.001.yellow",
  "jb2a.impact.005.white"
];
const HEAVY_PHYSICAL_IMPACTS = [
  "jb2a.impact.005.orange",
  "jb2a.impact.005.white",
  "jb2a.side_impact.part.shockwave.yellow"
];

function rangeVariants(base, ranges = SHORT_RANGES) {
  return ranges.map((range) => `${base}.${range}`);
}

function indexedVariants(base, indexes = DEFAULT_INDEXES) {
  return indexes.map((index) => `${base}.${index}`);
}

function rangedIndexedVariants(base, ranges = SHORT_RANGES, indexes = DEFAULT_INDEXES) {
  return ranges.flatMap((range) => indexes.map((index) => `${base}.${range}.${index}`));
}

function beamWeaponProfile({
  aliases = [],
  projectile = [],
  sourceBurst = [],
  impact = [],
  projectileScale = 1,
  sourceScale = 0.35,
  impactScale = 0.5
} = {}) {
  return {
    kind: "weapon",
    animationType: "beam",
    aliases,
    projectile,
    sourceBurst,
    impact,
    projectileScale,
    sourceScale,
    impactScale
  };
}

function arcWeaponProfile({
  aliases = [],
  projectile = [],
  sourceBurst = [],
  impact = [],
  projectileScale = 1,
  sourceScale = 0.35,
  impactScale = 0.5
} = {}) {
  return {
    kind: "weapon",
    animationType: "arc",
    aliases,
    projectile,
    sourceBurst,
    impact,
    projectileScale,
    sourceScale,
    impactScale
  };
}

function meleeWeaponProfile({
  aliases = [],
  sourceAura = [],
  swing = [],
  impact = [],
  auraScale = 0.4,
  swingScale = 0.95,
  impactScale = 0.6
} = {}) {
  return {
    kind: "weapon",
    animationType: "melee",
    aliases,
    sourceAura,
    swing,
    impact,
    auraScale,
    swingScale,
    impactScale
  };
}

function ordnanceProfile({
  aliases = [],
  launchMode = "thrown",
  launch = [],
  sourceBurst = [],
  explosion = [],
  launchScale = 1,
  sourceScale = 0.35,
  explosionScale = 1.05
} = {}) {
  return {
    kind: "gear",
    animationType: "ordnance",
    ordnance: true,
    aliases,
    launchMode,
    launch,
    sourceBurst,
    explosion,
    launchScale,
    sourceScale,
    explosionScale
  };
}

function persistentEffectProfile({
  kind = "gear",
  aliases = [],
  barrier = false,
  cloud = false,
  persistentEffect = true,
  burst = [],
  loopBelow = [],
  loopAbove = [],
  loop = [],
  burstScale = 1.2,
  loopScale = 1.1,
  loopBelowOpacity = 0.4,
  loopOpacity = 0.34
} = {}) {
  return {
    kind,
    animationType: "persistent",
    aliases,
    barrier,
    cloud,
    persistentEffect,
    burst,
    loopBelow,
    loopAbove,
    loop,
    burstScale,
    loopScale,
    loopBelowOpacity,
    loopOpacity
  };
}

function supportProfile({
  aliases = [],
  targetBurst = [],
  sourceBurst = [],
  beam = [],
  removalBurst = [],
  targetScale = 0.7,
  sourceScale = 0.35,
  beamScale = 1
} = {}) {
  return {
    kind: "gear",
    animationType: "support",
    support: true,
    aliases,
    targetBurst,
    sourceBurst,
    beam,
    removalBurst,
    targetScale,
    sourceScale,
    beamScale
  };
}

const weaponFamilies = {
  laserPistol: beamWeaponProfile({
    projectile: [
      ...rangeVariants("jb2a.energy_beam.normal.bluegreen.01"),
      ...rangeVariants("jb2a.energy_beam.normal.dark_green.01"),
      ...rangeVariants("jb2a.bullet.01.green")
    ],
    sourceBurst: [
      "jb2a.impact.001.green",
      "jb2a.impact.010.green"
    ],
    impact: [
      "jb2a.impact.010.green",
      "jb2a.impact.001.green"
    ],
    projectileScale: 0.8,
    sourceScale: 0.32,
    impactScale: 0.45
  }),
  laserRifle: beamWeaponProfile({
    projectile: [
      ...rangeVariants("jb2a.energy_beam.normal.bluegreen.01", LONG_RANGES),
      ...rangeVariants("jb2a.energy_beam.normal.dark_green.01", LONG_RANGES)
    ],
    sourceBurst: [
      "jb2a.impact.010.green",
      "jb2a.impact.001.green"
    ],
    impact: [
      "jb2a.impact.010.green",
      "jb2a.explosion.01.green",
      "jb2a.impact.001.green"
    ],
    projectileScale: 1.08,
    sourceScale: 0.36,
    impactScale: 0.58
  }),
  markVBlaster: beamWeaponProfile({
    projectile: [
      ...rangeVariants("jb2a.energy_beam.normal.greenyellow.02", LONG_RANGES),
      ...rangeVariants("jb2a.ranged.03.projectile.01.yellow", LONG_RANGES)
    ],
    sourceBurst: [
      "jb2a.impact.005.yellow",
      "jb2a.impact.001.green"
    ],
    impact: [
      ...indexedVariants("jb2a.explosion.greenorange"),
      "jb2a.impact.005.yellow",
      "jb2a.impact.001.green"
    ],
    projectileScale: 0.96,
    sourceScale: 0.36,
    impactScale: 0.62
  }),
  markVIIBlaster: beamWeaponProfile({
    projectile: [
      ...rangeVariants("jb2a.energy_beam.normal.greenyellow.03", LONG_RANGES),
      ...rangeVariants("jb2a.energy_beam.normal.greenyellow.02", LONG_RANGES)
    ],
    sourceBurst: [
      "jb2a.impact.005.yellow",
      "jb2a.impact.010.green"
    ],
    impact: [
      "jb2a.explosion.05.greenorange",
      ...indexedVariants("jb2a.explosion.greenorange"),
      "jb2a.impact.005.yellow"
    ],
    projectileScale: 1.18,
    sourceScale: 0.42,
    impactScale: 0.78
  }),
  blackRayGun: beamWeaponProfile({
    projectile: [
      ...rangeVariants("jb2a.energy_beam.normal.dark_purplered.02"),
      ...rangeVariants("jb2a.energy_beam.normal.dark_greenpurple.02"),
      ...rangeVariants("jb2a.bullet.01.purple")
    ],
    sourceBurst: [
      "jb2a.impact.001.dark_purple",
      "jb2a.impact.012.dark_purple"
    ],
    impact: [
      "jb2a.impact.012.dark_purple",
      "jb2a.explosion.04.dark_purple",
      "jb2a.impact.001.dark_purple"
    ],
    projectileScale: 0.95,
    sourceScale: 0.38,
    impactScale: 0.62
  }),
  fusionRifle: beamWeaponProfile({
    projectile: [
      ...rangeVariants("jb2a.energy_beam.normal.blue.01", LONG_RANGES),
      ...rangeVariants("jb2a.energy_beam.normal.yellow.01", LONG_RANGES)
    ],
    sourceBurst: [
      "jb2a.impact.005.white",
      "jb2a.impact.010.blue"
    ],
    impact: [
      ...indexedVariants("jb2a.explosion.bluewhite"),
      "jb2a.explosion.06.bluewhite",
      "jb2a.impact.005.white"
    ],
    projectileScale: 1.14,
    sourceScale: 0.44,
    impactScale: 0.82
  }),
  stunRay: arcWeaponProfile({
    projectile: [
      "jb2a.electric_arc.blue02.04",
      "jb2a.electric_arc.blue02.03",
      "jb2a.electric_arc.blue.04",
      ...rangeVariants("jb2a.bolt.lightning.blue")
    ],
    sourceBurst: [
      "jb2a.impact.005.blue02",
      "jb2a.impact.005.blue"
    ],
    impact: [
      "jb2a.impact.009.blue",
      "jb2a.impact.005.blue",
      "jb2a.impact.001.blue"
    ],
    projectileScale: 0.9,
    sourceScale: 0.28,
    impactScale: 0.52
  }),
  stunRifle: arcWeaponProfile({
    projectile: [
      "jb2a.electric_arc.blue02.04",
      "jb2a.electric_arc.blue02.03",
      "jb2a.electric_arc.blue.04",
      ...rangeVariants("jb2a.arrow.lightning.blue", LONG_RANGES)
    ],
    sourceBurst: [
      "jb2a.impact.005.blue02",
      "jb2a.impact.005.blue"
    ],
    impact: [
      "jb2a.impact.009.blue",
      "jb2a.impact.005.blue",
      "jb2a.impact.001.blue"
    ],
    projectileScale: 1.15,
    sourceScale: 0.32,
    impactScale: 0.64
  }),
  poisonNeedler: beamWeaponProfile({
    projectile: [
      ...rangeVariants("jb2a.bolt.poison.green"),
      ...rangeVariants("jb2a.arrow.poison.green.01")
    ],
    sourceBurst: [
      "jb2a.impact.001.green"
    ],
    impact: [
      "jb2a.liquid.splash.green",
      "jb2a.icon.poison.dark_green",
      "jb2a.impact.001.green"
    ],
    projectileScale: 0.68,
    sourceScale: 0.2,
    impactScale: 0.44
  }),
  paralysisNeedler: beamWeaponProfile({
    projectile: [
      ...rangeVariants("jb2a.bolt.poison.purple"),
      ...rangeVariants("jb2a.arrow.poison.purple")
    ],
    sourceBurst: [
      "jb2a.impact.001.dark_purple"
    ],
    impact: [
      "jb2a.liquid.splash02.purple",
      "jb2a.impact.009.purple",
      "jb2a.impact.001.dark_purple"
    ],
    projectileScale: 0.68,
    sourceScale: 0.2,
    impactScale: 0.44
  }),
  slugThrower: beamWeaponProfile({
    projectile: [
      ...rangeVariants("jb2a.bullet.03.orange"),
      ...rangeVariants("jb2a.bullet.Snipe.orange")
    ],
    sourceBurst: [
      "jb2a.impact.001.orange"
    ],
    impact: [
      "jb2a.impact.005.white",
      "jb2a.impact.001.orange"
    ],
    projectileScale: 0.74,
    sourceScale: 0.22,
    impactScale: 0.36
  }),
  club: meleeWeaponProfile({
    swing: [
      ...indexedVariants("jb2a.club.melee.01.white", FULL_MELEE_INDEXES),
      ...indexedVariants("jb2a.melee_attack.02.club.01")
    ],
    impact: LIGHT_PHYSICAL_IMPACTS,
    swingScale: 0.92,
    impactScale: 0.42
  }),
  spearThrown: beamWeaponProfile({
    projectile: [
      ...rangeVariants("jb2a.spear.throw.01", LONG_RANGES)
    ],
    impact: PIERCING_PHYSICAL_IMPACTS,
    projectileScale: 0.92,
    impactScale: 0.44
  }),
  battleAxe: meleeWeaponProfile({
    swing: [
      ...indexedVariants("jb2a.melee_attack.03.greataxe.01"),
      "jb2a.greataxe.melee.standard.white"
    ],
    impact: HEAVY_PHYSICAL_IMPACTS,
    swingScale: 1.04,
    impactScale: 0.58
  }),
  handAxeThrown: beamWeaponProfile({
    projectile: [
      ...rangeVariants("jb2a.handaxe.throw.01", LONG_RANGES),
      ...rangeVariants("jb2a.handaxe.throw.02", LONG_RANGES)
    ],
    impact: LIGHT_PHYSICAL_IMPACTS,
    projectileScale: 0.84,
    impactScale: 0.44
  }),
  daggerThrown: beamWeaponProfile({
    projectile: [
      ...rangeVariants("jb2a.dagger.throw.01.white", LONG_RANGES),
      ...rangeVariants("jb2a.dagger.throw.02.white", LONG_RANGES)
    ],
    impact: LIGHT_PHYSICAL_IMPACTS,
    projectileScale: 0.72,
    impactScale: 0.38
  }),
  longSword: meleeWeaponProfile({
    swing: [
      ...indexedVariants("jb2a.sword.melee.01.white", FULL_MELEE_INDEXES),
      ...indexedVariants("jb2a.melee_attack.03.greatsword.01")
    ],
    impact: [
      "jb2a.impact.005.white",
      "jb2a.impact.001.orange"
    ],
    swingScale: 1,
    impactScale: 0.52
  }),
  shortSword: meleeWeaponProfile({
    swing: [
      ...indexedVariants("jb2a.shortsword.melee.01.white", FULL_MELEE_INDEXES),
      ...indexedVariants("jb2a.melee_attack.01.shortsword.01")
    ],
    impact: LIGHT_PHYSICAL_IMPACTS,
    swingScale: 0.94,
    impactScale: 0.42
  }),
  poleArm: meleeWeaponProfile({
    swing: [
      ...indexedVariants("jb2a.halberd.melee.01.white", FULL_MELEE_INDEXES),
      ...indexedVariants("jb2a.glaive.melee.01.white", FULL_MELEE_INDEXES)
    ],
    impact: HEAVY_PHYSICAL_IMPACTS,
    swingScale: 1.08,
    impactScale: 0.62
  }),
  javelin: beamWeaponProfile({
    projectile: [
      ...rangeVariants("jb2a.javelin.01.throw", LONG_RANGES),
      ...rangeVariants("jb2a.javelin.throw", LONG_RANGES)
    ],
    impact: PIERCING_PHYSICAL_IMPACTS,
    projectileScale: 0.9,
    impactScale: 0.44
  }),
  bowAndArrows: beamWeaponProfile({
    projectile: [
      ...rangeVariants("jb2a.arrow.physical.white.01", LONG_RANGES),
      ...rangeVariants("jb2a.arrow.physical.white.02", LONG_RANGES),
      ...rangeVariants("jb2a.arrow.physical.orange", LONG_RANGES)
    ],
    impact: PIERCING_PHYSICAL_IMPACTS,
    projectileScale: 0.9,
    impactScale: 0.4
  }),
  crossbow: beamWeaponProfile({
    projectile: [
      ...rangeVariants("jb2a.bolt.physical.white", LONG_RANGES),
      ...rangeVariants("jb2a.bolt.physical.white02", LONG_RANGES),
      ...rangeVariants("jb2a.bolt.physical.orange", LONG_RANGES)
    ],
    impact: [
      "jb2a.impact.005.white",
      "jb2a.impact.001.orange"
    ],
    projectileScale: 0.94,
    impactScale: 0.44
  }),
  slingStones: beamWeaponProfile({
    projectile: [
      ...rangeVariants("jb2a.slingshot", LONG_RANGES)
    ],
    impact: LIGHT_PHYSICAL_IMPACTS,
    projectileScale: 0.86,
    impactScale: 0.36
  }),
  slingBullets: beamWeaponProfile({
    projectile: [
      ...rangeVariants("jb2a.bullet.02.orange", LONG_RANGES),
      ...rangeVariants("jb2a.slingshot", LONG_RANGES)
    ],
    impact: [
      "jb2a.impact.005.orange",
      "jb2a.impact.005.white"
    ],
    projectileScale: 0.82,
    impactScale: 0.38
  }),
  vibroDagger: meleeWeaponProfile({
    sourceAura: [
      "jb2a.energy_strands.overlay.blue.01",
      "jb2a.energy_strands.complete.blue.01"
    ],
    swing: [
      ...indexedVariants("jb2a.melee_generic.slash.02.001.blue"),
      ...indexedVariants("jb2a.melee_generic.slash.02.001.purple")
    ],
    impact: [
      "jb2a.impact.005.blue",
      "jb2a.impact.001.blue"
    ],
    auraScale: 0.44,
    swingScale: 0.9,
    impactScale: 0.42
  }),
  vibroBlade: meleeWeaponProfile({
    sourceAura: [
      "jb2a.energy_strands.overlay.blueorange.01",
      "jb2a.energy_strands.complete.blueorange.01"
    ],
    swing: [
      ...indexedVariants("jb2a.melee_generic.slash.02.002.blue"),
      ...indexedVariants("jb2a.melee_attack.03.magical_greatsword.01.blue")
    ],
    impact: [
      "jb2a.impact.008.blue",
      "jb2a.explosion.blue.1",
      "jb2a.impact.001.blue"
    ],
    auraScale: 0.52,
    swingScale: 1.1,
    impactScale: 0.6
  }),
  energyMace: meleeWeaponProfile({
    sourceAura: [
      "jb2a.energy_strands.overlay.blueorange.01",
      "jb2a.energy_strands.complete.blueorange.01"
    ],
    swing: [
      ...indexedVariants("jb2a.mace.melee.01.blue", [0, 1, 2, 3, 4, 5]),
      ...indexedVariants("jb2a.melee_attack.02.mace.01")
    ],
    impact: [
      ...indexedVariants("jb2a.explosion.blue"),
      "jb2a.impact.008.blue"
    ],
    auraScale: 0.56,
    swingScale: 1.04,
    impactScale: 0.7
  }),
  stunWhip: arcWeaponProfile({
    projectile: [
      "jb2a.electric_arc.blue02.04",
      "jb2a.electric_arc.blue02.03",
      "jb2a.electric_arc.blue.04"
    ],
    sourceBurst: [
      "jb2a.impact.005.blue"
    ],
    impact: [
      "jb2a.impact.009.blue",
      "jb2a.impact.005.blue",
      "jb2a.impact.001.blue"
    ],
    projectileScale: 0.92,
    sourceScale: 0.28,
    impactScale: 0.5
  }),
  poweredFist: meleeWeaponProfile({
    sourceAura: [
      "jb2a.energy_strands.overlay.grey.01",
      "jb2a.energy_strands.complete.grey.01"
    ],
    swing: [
      ...indexedVariants("jb2a.hammer.melee.01.white", [0, 1, 2, 3, 4, 5]),
      ...indexedVariants("jb2a.melee_attack.02.warhammer.01")
    ],
    impact: [
      "jb2a.side_impact.part.shockwave.yellow",
      "jb2a.impact.008.orange",
      "jb2a.impact.005.white"
    ],
    auraScale: 0.58,
    swingScale: 1.08,
    impactScale: 0.8
  })
};

const ordnanceFamilies = {
  fragGrenade: ordnanceProfile({
    launchMode: "thrown",
    launch: [
      ...rangeVariants("jb2a.throwable.throw.grenade.02.blackyellow"),
      ...rangeVariants("jb2a.throwable.throw.grenade.03.green")
    ],
    explosion: [
      "jb2a.explosion.shrapnel.grenade.03.orange",
      ...indexedVariants("jb2a.explosion.orange")
    ],
    explosionScale: 1.05
  }),
  chemGrenade: ordnanceProfile({
    launchMode: "thrown",
    launch: [
      ...rangeVariants("jb2a.throwable.throw.bomb.01.grey"),
      ...rangeVariants("jb2a.throwable.throw.dynamite.01.orange")
    ],
    explosion: [
      "jb2a.explosion.04.orange",
      ...indexedVariants("jb2a.explosion.orange")
    ],
    explosionScale: 1.18
  }),
  energyGrenade: ordnanceProfile({
    launchMode: "thrown",
    launch: [
      ...rangeVariants("jb2a.throwable.throw.grenade.03.blackblue"),
      ...rangeVariants("jb2a.throwable.throw.grenade.03.green")
    ],
    explosion: [
      "jb2a.explosion.05.tealyellow",
      ...indexedVariants("jb2a.explosion.tealyellow")
    ],
    explosionScale: 1.2
  }),
  microMissile: ordnanceProfile({
    launchMode: "missile",
    launch: [
      ...rangedIndexedVariants("jb2a.magic_missile.grey"),
      ...rangeVariants("jb2a.ranged.01.projectile.01.dark_orange", LONG_RANGES)
    ],
    explosion: [
      "jb2a.explosion.01.orange",
      ...indexedVariants("jb2a.explosion.orange")
    ],
    explosionScale: 1.08
  }),
  miniMissile: ordnanceProfile({
    launchMode: "missile",
    launch: [
      ...rangedIndexedVariants("jb2a.magic_missile.dark_red"),
      ...rangeVariants("jb2a.ranged.01.projectile.01.dark_orange", LONG_RANGES)
    ],
    explosion: [
      "jb2a.explosion.03.red",
      "jb2a.explosion.05.greenorange",
      ...indexedVariants("jb2a.explosion.orange")
    ],
    explosionScale: 1.32
  }),
  damagePackSmall: ordnanceProfile({
    launchMode: "thrown",
    launch: [
      ...rangeVariants("jb2a.throwable.throw.bomb.01.grey"),
      ...rangeVariants("jb2a.throwable.throw.dynamite.01.orange")
    ],
    explosion: [
      "jb2a.explosion.03.red",
      ...indexedVariants("jb2a.explosion.orange")
    ],
    explosionScale: 1.1
  }),
  damagePackLarge: ordnanceProfile({
    launchMode: "thrown",
    launch: [
      ...rangeVariants("jb2a.throwable.throw.bomb.01.grey"),
      ...rangeVariants("jb2a.throwable.throw.dynamite.01.orange")
    ],
    explosion: [
      "jb2a.explosion.04.orange",
      "jb2a.explosion.05.greenorange",
      ...indexedVariants("jb2a.explosion.orange")
    ],
    explosionScale: 1.45
  }),
  photon: ordnanceProfile({
    launchMode: "thrown",
    launch: [
      ...rangeVariants("jb2a.throwable.throw.grenade.03.blackblue"),
      ...rangeVariants("jb2a.throwable.throw.bomb.01.blue")
    ],
    explosion: [
      "jb2a.explosion.06.bluewhite",
      "jb2a.explosion.03.bluewhite",
      ...indexedVariants("jb2a.explosion.bluewhite")
    ],
    explosionScale: 1.45
  }),
  torc: ordnanceProfile({
    launchMode: "thrown",
    launch: [
      ...rangeVariants("jb2a.throwable.throw.grenade.03.blackblue"),
      ...rangeVariants("jb2a.throwable.throw.bomb.01.black")
    ],
    explosion: [
      "jb2a.template_circle.vortex.intro.orange",
      "jb2a.side_impact.part.shockwave.green",
      "jb2a.explosion.03.purplepink"
    ],
    explosionScale: 1.25
  }),
  mutationBomb: ordnanceProfile({
    launchMode: "thrown",
    launch: [
      ...rangeVariants("jb2a.throwable.throw.bomb.01.green"),
      ...rangeVariants("jb2a.throwable.throw.grenade.03.green")
    ],
    explosion: [
      "jb2a.explosion.03.purplepink",
      "jb2a.fireball.explosion.dark_green",
      ...indexedVariants("jb2a.explosion.purplepink")
    ],
    explosionScale: 1.4
  }),
  negation: ordnanceProfile({
    launchMode: "thrown",
    launch: [
      ...rangeVariants("jb2a.throwable.throw.bomb.01.black"),
      ...rangeVariants("jb2a.throwable.throw.grenade.02.blackyellow")
    ],
    explosion: [
      "jb2a.template_circle.vortex.intro.dark_black",
      "jb2a.portals.horizontal.vortex.black",
      "jb2a.side_impact.part.shockwave.purple"
    ],
    explosionScale: 1.3
  }),
  fusionBomb: ordnanceProfile({
    launchMode: "thrown",
    launch: [
      ...rangeVariants("jb2a.throwable.throw.bomb.01.blue"),
      ...rangeVariants("jb2a.throwable.throw.bomb.01.grey")
    ],
    explosion: [
      "jb2a.explosion.08.1200.blue",
      "jb2a.explosion.06.bluewhite",
      ...indexedVariants("jb2a.explosion.bluewhite")
    ],
    explosionScale: 1.8
  }),
  fissionBomb: ordnanceProfile({
    launchMode: "thrown",
    launch: [
      ...rangeVariants("jb2a.throwable.throw.bomb.01.grey"),
      ...rangeVariants("jb2a.throwable.throw.bomb.01.red")
    ],
    explosion: [
      "jb2a.explosion.08.1200.dark_orange",
      "jb2a.explosion.08.1200.orange",
      ...indexedVariants("jb2a.explosion.orange")
    ],
    explosionScale: 1.95
  }),
  matterBomb: ordnanceProfile({
    launchMode: "thrown",
    launch: [
      ...rangeVariants("jb2a.throwable.throw.bomb.01.green"),
      ...rangeVariants("jb2a.throwable.throw.bomb.01.grey")
    ],
    explosion: [
      "jb2a.explosion.04.green",
      "jb2a.explosion.08.green",
      ...indexedVariants("jb2a.explosion.green")
    ],
    explosionScale: 1.55
  }),
  surfaceMissile: ordnanceProfile({
    launchMode: "missile",
    launch: [
      ...rangedIndexedVariants("jb2a.magic_missile.dark_red", LONG_RANGES),
      ...rangeVariants("jb2a.ranged.01.projectile.01.dark_orange", LONG_RANGES)
    ],
    explosion: [
      "jb2a.explosion.08.1200.dark_orange",
      "jb2a.explosion.08.1200.orange",
      ...indexedVariants("jb2a.explosion.orange")
    ],
    explosionScale: 1.9
  }),
  neutronMissile: ordnanceProfile({
    launchMode: "missile",
    launch: [
      ...rangedIndexedVariants("jb2a.magic_missile.blue", LONG_RANGES),
      ...rangeVariants("jb2a.ranged.02.projectile.01.blue", LONG_RANGES)
    ],
    explosion: [
      "jb2a.explosion.08.1200.blue",
      "jb2a.explosion.06.bluewhite",
      ...indexedVariants("jb2a.explosion.bluewhite")
    ],
    explosionScale: 1.85
  }),
  negationMissile: ordnanceProfile({
    launchMode: "missile",
    launch: [
      ...rangedIndexedVariants("jb2a.magic_missile.grey", LONG_RANGES),
      ...rangeVariants("jb2a.ranged.02.projectile.01.purple", LONG_RANGES)
    ],
    explosion: [
      "jb2a.template_circle.vortex.intro.dark_black",
      "jb2a.portals.horizontal.vortex.black",
      "jb2a.side_impact.part.shockwave.purple"
    ],
    explosionScale: 1.55
  }),
  trekBomb: ordnanceProfile({
    launchMode: "thrown",
    launch: [
      ...rangeVariants("jb2a.throwable.throw.bomb.01.purple"),
      ...rangeVariants("jb2a.throwable.throw.grenade.03.blackblue")
    ],
    explosion: [
      "jb2a.misty_step.02.dark_purple",
      "jb2a.template_circle.vortex.intro.purple",
      "jb2a.explosion.03.purplepink"
    ],
    explosionScale: 1.45
  }),
  stunBurst: ordnanceProfile({
    launchMode: "thrown",
    launch: [
      ...rangeVariants("jb2a.throwable.throw.grenade.03.blackblue"),
      ...rangeVariants("jb2a.throwable.throw.bomb.01.blue")
    ],
    explosion: [
      "jb2a.side_impact.part.shockwave.blue",
      "jb2a.impact.009.blue",
      "jb2a.explosion.01.blue"
    ],
    explosionScale: 1.2
  })
};

const protectionFamilies = {
  forceField: persistentEffectProfile({
    kind: "mutation",
    barrier: true,
    burst: [
      "jb2a.energy_field.01.blue"
    ],
    loopBelow: [
      "jb2a.energy_field.02.below.blue"
    ],
    loopAbove: [
      "jb2a.energy_field.02.above.blue"
    ],
    burstScale: 1.42,
    loopScale: 1.25,
    loopBelowOpacity: 0.44,
    loopOpacity: 0.36
  }),
  portent: persistentEffectProfile({
    kind: "gear",
    barrier: true,
    burst: [
      "jb2a.shield.01.intro.yellow",
      "jb2a.shield.02.complete.01.yellow"
    ],
    loopAbove: [
      "jb2a.shield.01.loop.yellow",
      "jb2a.shield.02.complete.01.yellow"
    ],
    burstScale: 1.08,
    loopScale: 1.04,
    loopOpacity: 0.32
  }),
  energyCloak: {
    ...persistentEffectProfile({
      kind: "gear",
      burst: [
        "jb2a.shield.01.intro.green",
        "jb2a.shield.02.complete.01.green"
      ],
      loopAbove: [
        "jb2a.shield.01.loop.green"
      ],
      burstScale: 1,
      loopScale: 0.96,
      loopOpacity: 0.24
    }),
    ...supportProfile({
      targetBurst: [
        "jb2a.shield.01.intro.green",
        "jb2a.icon.shield.green"
      ],
      removalBurst: [
        "jb2a.shield.01.outro_fade.green",
        "jb2a.icon.shield_cracked.purple"
      ],
      targetScale: 0.95
    })
  }
};

const cloudFamilies = {
  tearGas: {
    ...ordnanceFamilies.fragGrenade,
    explosion: [
      "jb2a.smoke.puff.centered.grey.0",
      "jb2a.fog_cloud.01.white"
    ],
    cloud: true,
    persistentEffect: true,
    burst: [
      "jb2a.ambient_fog.001.complete.small.orangeyellow",
      "jb2a.fog_cloud.01.white"
    ],
    loopBelow: [
      "jb2a.ambient_fog.001.loop.small.orangeyellow",
      "jb2a.smoke.puff.ring.01.dark_black.0"
    ],
    burstScale: 1.26,
    loopScale: 1.18,
    loopBelowOpacity: 0.48
  },
  poisonCloud: {
    ...ordnanceFamilies.chemGrenade,
    explosion: [
      "jb2a.smoke.puff.centered.dark_green.0",
      "jb2a.liquid.splash.green"
    ],
    cloud: true,
    persistentEffect: true,
    burst: [
      "jb2a.ambient_fog.001.complete.small.greenyellow",
      "jb2a.fog_cloud.02.green"
    ],
    loopBelow: [
      "jb2a.ambient_fog.001.loop.small.greenyellow",
      "jb2a.fog_cloud.02.green"
    ],
    burstScale: 1.3,
    loopScale: 1.22,
    loopBelowOpacity: 0.5
  },
  stunCloud: {
    ...ordnanceFamilies.stunBurst,
    cloud: true,
    persistentEffect: true,
    burst: [
      "jb2a.ambient_fog.001.complete.small.bluepurple",
      "jb2a.fog_cloud.02.white"
    ],
    loopBelow: [
      "jb2a.ambient_fog.001.loop.small.bluepurple",
      "jb2a.fog_cloud.02.white"
    ],
    burstScale: 1.24,
    loopScale: 1.16,
    loopBelowOpacity: 0.42
  },
  concussionCloud: {
    ...ordnanceFamilies.stunBurst,
    cloud: true,
    persistentEffect: true,
    burst: [
      "jb2a.ambient_fog.001.complete.large.bluepurple",
      "jb2a.fog_cloud.02.white"
    ],
    loopBelow: [
      "jb2a.ambient_fog.001.loop.large.bluepurple",
      "jb2a.fog_cloud.02.white"
    ],
    burstScale: 1.6,
    loopScale: 1.42,
    loopBelowOpacity: 0.46
  }
};

const supportFamilies = {
  medikit: supportProfile({
    sourceBurst: [
      "jb2a.energy_strands.complete.blueorange.01",
      "jb2a.energy_strands.complete.blue.01"
    ],
    targetBurst: [
      "jb2a.healing_generic.03.burst.bluegreen",
      "jb2a.cure_wounds.200px.blue"
    ],
    beam: [
      ...rangeVariants("jb2a.energy_beam.normal.bluegreen.01")
    ],
    targetScale: 0.72,
    sourceScale: 0.42,
    beamScale: 0.72
  }),
  lifeRay: supportProfile({
    sourceBurst: [
      "jb2a.energy_strands.complete.blue.01",
      "jb2a.impact.005.white"
    ],
    targetBurst: [
      "jb2a.healing_generic.burst.tealyellow",
      "jb2a.healing_generic.03.burst.bluegreen",
      "jb2a.cure_wounds.400px.blue"
    ],
    beam: [
      ...rangeVariants("jb2a.energy_beam.normal.bluegreen.01", LONG_RANGES),
      ...rangeVariants("jb2a.energy_beam.normal.yellow.01", LONG_RANGES)
    ],
    targetScale: 1,
    sourceScale: 0.46,
    beamScale: 1.08
  }),
  acceleraDose: supportProfile({
    sourceBurst: [
      "jb2a.liquid.splash_side.red",
      "jb2a.impact.001.red"
    ],
    targetBurst: [
      "jb2a.healing_generic.200px.red",
      "jb2a.cure_wounds.200px.red"
    ],
    targetScale: 0.6
  }),
  painReducer: supportProfile({
    sourceBurst: [
      "jb2a.liquid.splash_side.orange",
      "jb2a.impact.001.orange"
    ],
    targetBurst: [
      "jb2a.healing_generic.200px.yellow",
      "jb2a.impact.005.yellow"
    ],
    targetScale: 0.56
  }),
  mindBooster: supportProfile({
    sourceBurst: [
      "jb2a.liquid.splash_side.purple",
      "jb2a.impact.001.dark_purple"
    ],
    targetBurst: [
      "jb2a.energy_strands.complete.dark_purple.01",
      "jb2a.healing_generic.200px.purple"
    ],
    targetScale: 0.62
  }),
  stimDose: supportProfile({
    sourceBurst: [
      "jb2a.liquid.splash_side.green",
      "jb2a.impact.001.green"
    ],
    targetBurst: [
      "jb2a.healing_generic.200px.green",
      "jb2a.impact.005.yellow"
    ],
    targetScale: 0.6
  }),
  curInDose: supportProfile({
    sourceBurst: [
      "jb2a.liquid.splash_side.green",
      "jb2a.icon.poison.dark_green"
    ],
    targetBurst: [
      "jb2a.healing_generic.200px.green",
      "jb2a.icon.poison.dark_green"
    ],
    targetScale: 0.54
  }),
  interraShot: supportProfile({
    sourceBurst: [
      "jb2a.liquid.splash_side.blue",
      "jb2a.impact.001.blue"
    ],
    targetBurst: [
      "jb2a.energy_strands.complete.blue.01",
      "jb2a.healing_generic.200px.blue"
    ],
    targetScale: 0.56
  }),
  suggestionChange: supportProfile({
    sourceBurst: [
      "jb2a.liquid.splash_side.purple",
      "jb2a.impact.001.dark_purple"
    ],
    targetBurst: [
      "jb2a.energy_strands.complete.dark_purple.01",
      "jb2a.healing_generic.200px.purple"
    ],
    targetScale: 0.58
  }),
  antiRadiationSerum: supportProfile({
    sourceBurst: [
      "jb2a.liquid.splash_side.bright_blue",
      "jb2a.impact.001.blue"
    ],
    targetBurst: [
      "jb2a.healing_generic.200px.yellow02",
      "jb2a.healing_generic.03.burst.bluegreen"
    ],
    targetScale: 0.6
  }),
  sustenanceDose: supportProfile({
    sourceBurst: [
      "jb2a.liquid.splash_side.bright_green",
      "jb2a.impact.001.green"
    ],
    targetBurst: [
      "jb2a.healing_generic.200px.yellow",
      "jb2a.healing_generic.200px.green"
    ],
    targetScale: 0.5
  })
};

const PROFILE_DEFINITIONS = {
  "Laser Pistol": {
    ...weaponFamilies.laserPistol,
    aliases: [/^built-in laser pistol\b/i]
  },
  "Laser Rifle": weaponFamilies.laserRifle,
  "Mark V Blaster": weaponFamilies.markVBlaster,
  "Mark VII Blaster Rifle": weaponFamilies.markVIIBlaster,
  "Black Ray Gun": weaponFamilies.blackRayGun,
  "Fusion Rifle": weaponFamilies.fusionRifle,
  "Stun Ray Pistol": weaponFamilies.stunRay,
  "Stun Rifle": weaponFamilies.stunRifle,
  "Needler (Poison)": weaponFamilies.poisonNeedler,
  "Needler (Paralysis)": weaponFamilies.paralysisNeedler,
  "Slug Thrower (.38)": weaponFamilies.slugThrower,
  "Club": weaponFamilies.club,
  "Spear": weaponFamilies.spearThrown,
  "Battle Axe": weaponFamilies.battleAxe,
  "Hand Axe": weaponFamilies.handAxeThrown,
  "Dagger": weaponFamilies.daggerThrown,
  "Long Sword": weaponFamilies.longSword,
  "Short Sword": weaponFamilies.shortSword,
  "Pole Arm": weaponFamilies.poleArm,
  "Javelin": weaponFamilies.javelin,
  "Bow and Arrows": weaponFamilies.bowAndArrows,
  "Crossbow": weaponFamilies.crossbow,
  "Sling Stones": weaponFamilies.slingStones,
  "Sling Bullets": weaponFamilies.slingBullets,
  "Vibro Dagger": weaponFamilies.vibroDagger,
  "Vibro Blade": weaponFamilies.vibroBlade,
  "Energy Mace": weaponFamilies.energyMace,
  "Stun Whip": weaponFamilies.stunWhip,
  "Paralysis Rod": weaponFamilies.stunWhip,
  "Force Field Generator": weaponFamilies.vibroDagger,
  "Powered Battle Fist": weaponFamilies.poweredFist,
  "Powered Attack Fist": weaponFamilies.poweredFist,
  "Powered Assault Fist": weaponFamilies.poweredFist,
  "Built-in Micro Missile Rack": ordnanceFamilies.microMissile,
  "Micro Missile": ordnanceFamilies.microMissile,
  "Mini Missile": ordnanceFamilies.miniMissile,
  "Tear Gas Grenade": cloudFamilies.tearGas,
  "Poison Gas Grenade": cloudFamilies.poisonCloud,
  "Stun Grenade": cloudFamilies.stunCloud,
  "Concussion Bomb": cloudFamilies.concussionCloud,
  "Fragmentation Grenade": ordnanceFamilies.fragGrenade,
  "Chemical Explosive Grenade": ordnanceFamilies.chemGrenade,
  "Energy Grenade": ordnanceFamilies.energyGrenade,
  "Small Damage Pack": ordnanceFamilies.damagePackSmall,
  "Concentrated Damage Pack": ordnanceFamilies.damagePackLarge,
  "Photon Grenade": ordnanceFamilies.photon,
  "Neutron Bomb": ordnanceFamilies.photon,
  "Neutron Missile": ordnanceFamilies.neutronMissile,
  "Torc Grenade": ordnanceFamilies.torc,
  "Mutation Bomb": ordnanceFamilies.mutationBomb,
  "Negation Bomb": ordnanceFamilies.negation,
  "Negation Missile": ordnanceFamilies.negationMissile,
  "Fission Bomb": ordnanceFamilies.fissionBomb,
  "Fusion Bomb": ordnanceFamilies.fusionBomb,
  "Matter Bomb": ordnanceFamilies.matterBomb,
  "Fission Missile": ordnanceFamilies.fissionBomb,
  "Surface Missile": ordnanceFamilies.surfaceMissile,
  "Trek Bomb": ordnanceFamilies.trekBomb,
  "Force Field Generation": protectionFamilies.forceField,
  "Portent": protectionFamilies.portent,
  "Energy Cloak": protectionFamilies.energyCloak,
  "Medi-kit": supportFamilies.medikit,
  "Life Ray": supportFamilies.lifeRay,
  "Accelera Dose": supportFamilies.acceleraDose,
  "Pain Reducer": supportFamilies.painReducer,
  "Mind Booster": supportFamilies.mindBooster,
  "Stim Dose": supportFamilies.stimDose,
  "Cur-in Dose": supportFamilies.curInDose,
  "Interra Shot": supportFamilies.interraShot,
  "Suggestion Change": supportFamilies.suggestionChange,
  "Anti-Radiation Serum": supportFamilies.antiRadiationSerum,
  "Sustenance Dose": supportFamilies.sustenanceDose
};

const availableDataPaths = new Set();
const activeBarrierEffects = new Map();
const activeTemporaryEffects = new Map();
let hooksRegistered = false;
let missingSupportWarningShown = false;

function settingEnabled() {
  return game.settings?.get(SYSTEM_ID, ANIMATION_SETTING) ?? true;
}

function sequencerRuntimePresent() {
  return (
    !!game.modules?.get(SEQUENCER_MODULE_ID)?.active
    && typeof globalThis.Sequence === "function"
    && !!globalThis.Sequencer?.EffectManager
    && !!globalThis.Sequencer?.Database
  );
}

function jb2aRuntimePresent() {
  return JB2A_MODULE_IDS.some((id) => game.modules?.get(id)?.active);
}

function runtimeAvailable({ warn = false } = {}) {
  const available = settingEnabled() && sequencerRuntimePresent() && jb2aRuntimePresent();
  if (!available && warn && settingEnabled() && !missingSupportWarningShown) {
    missingSupportWarningShown = true;
    ui.notifications?.warn("Gamma World animations need both Sequencer and JB2A active in this world.");
  }
  return available;
}

function primeAvailableDataPaths() {
  const keys = globalThis.Sequencer?.Database?.flattenedEntries ?? [];
  if (!availableDataPaths.size && Array.isArray(keys) && keys.length) {
    for (const key of keys) {
      if (typeof key === "string") availableDataPaths.add(key);
    }
  }
}

function firstAvailableDataPath(candidates = []) {
  if (!runtimeAvailable()) return null;
  primeAvailableDataPaths();
  for (const candidate of candidates) {
    if (availableDataPaths.has(candidate)) return candidate;
  }
  return null;
}

function normalizedName(name) {
  return String(name ?? "").trim().toLowerCase();
}

function aliasMatches(alias, name) {
  if (alias instanceof RegExp) return alias.test(String(name ?? ""));
  return normalizedName(alias) === normalizedName(name);
}

function profileMatches(profile, {
  kind = "any",
  barrier = null,
  persistent = null,
  ordnance = null,
  support = null,
  cloud = null
} = {}) {
  if ((kind !== "any") && (profile.kind !== kind)) return false;
  if ((barrier != null) && (!!profile.barrier !== barrier)) return false;
  if ((persistent != null) && (!!profile.persistentEffect !== persistent)) return false;
  if ((ordnance != null) && (!!profile.ordnance !== ordnance)) return false;
  if ((support != null) && (!!profile.support !== support)) return false;
  if ((cloud != null) && (!!profile.cloud !== cloud)) return false;
  return true;
}

export function resolvePilotAnimationKey(name, options = {}) {
  const normalized = normalizedName(name);
  if (!normalized) return "";

  for (const [key, profile] of Object.entries(PROFILE_DEFINITIONS)) {
    if (!profileMatches(profile, options)) continue;
    if (normalized === normalizedName(key)) return key;
    if ((profile.aliases ?? []).some((alias) => aliasMatches(alias, name))) return key;
  }

  return "";
}

function profileFor(name, options = {}) {
  const key = resolvePilotAnimationKey(name, options);
  return key ? { key, ...PROFILE_DEFINITIONS[key] } : null;
}

function tokenUuid(token) {
  return token?.document?.uuid ?? token?.uuid ?? "";
}

function actorState(actor) {
  return actor?.getFlag(SYSTEM_ID, "state") ?? {};
}

function actorStateBarriers(actor) {
  return actorState(actor).barriers ?? {};
}

function actorStateTemporaryEffects(actor) {
  return actorState(actor).temporaryEffects ?? [];
}

function barrierEffectName(token, barrierId) {
  return `${SYSTEM_ID}.barrier.${tokenUuid(token)}.${String(barrierId ?? "barrier")}`;
}

function temporaryEffectName(token, effectId) {
  return `${SYSTEM_ID}.effect.${tokenUuid(token)}.${String(effectId ?? "effect")}`;
}

function barrierEffectsForActor(actor) {
  return activeBarrierEffects.get(actor.uuid) ?? new Set();
}

function temporaryEffectsForActor(actor) {
  return activeTemporaryEffects.get(actor.uuid) ?? new Set();
}

function cacheEffects(map, actor, names) {
  if (!names.size) {
    map.delete(actor.uuid);
    return;
  }
  map.set(actor.uuid, names);
}

function activeSceneTokensForActor(actor) {
  return actor?.getActiveTokens?.() ?? [];
}

async function playSequence(sequence) {
  try {
    await sequence.play();
    return true;
  } catch (error) {
    console.warn(`${SYSTEM_ID} | Animation playback failed`, error);
    return false;
  }
}

function effectManagerActive(name) {
  const active = globalThis.Sequencer?.EffectManager?.getEffects?.({ name }) ?? [];
  return Array.isArray(active) ? active.length > 0 : false;
}

function stopNamedEffect(name, { label = "Animation" } = {}) {
  if (!runtimeAvailable()) return false;
  try {
    globalThis.Sequencer?.EffectManager?.endEffects?.({ name });
    return true;
  } catch (error) {
    console.warn(`${SYSTEM_ID} | ${label} cleanup failed`, error);
    return false;
  }
}

async function playBeamSequence(profile, sourceToken, targetToken, { impactOnly = false } = {}) {
  if (!runtimeAvailable({ warn: true }) || !targetToken) return false;

  const projectilePath = firstAvailableDataPath(profile.projectile);
  const sourceBurstPath = firstAvailableDataPath(profile.sourceBurst);
  const impactPath = firstAvailableDataPath(profile.impact);

  if (!impactOnly && (!sourceToken || !projectilePath)) return false;
  if (impactOnly && !impactPath) return false;

  const sequence = new globalThis.Sequence();

  if (!impactOnly && sourceBurstPath) {
    sequence
      .effect()
      .file(sourceBurstPath)
      .atLocation(sourceToken)
      .rotateTowards(targetToken)
      .scaleToObject(profile.sourceScale ?? 0.35)
      .opacity(0.72)
      .fadeOut(150);
  }

  if (!impactOnly && projectilePath) {
    sequence
      .effect()
      .file(projectilePath)
      .atLocation(sourceToken)
      .stretchTo(targetToken)
      .scale(profile.projectileScale ?? 1)
      .waitUntilFinished(-140);
  }

  if (impactPath) {
    sequence
      .effect()
      .file(impactPath)
      .atLocation(targetToken)
      .scaleToObject(profile.impactScale ?? 0.5)
      .opacity(0.86)
      .fadeOut(180);
  }

  return playSequence(sequence);
}

async function playMeleeSequence(profile, sourceToken, targetToken, { impactOnly = false } = {}) {
  if (!runtimeAvailable({ warn: true }) || !targetToken) return false;

  const auraPath = firstAvailableDataPath(profile.sourceAura);
  const swingPath = firstAvailableDataPath(profile.swing);
  const impactPath = firstAvailableDataPath(profile.impact);

  if (!impactOnly && (!sourceToken || !swingPath)) return false;
  if (impactOnly && !impactPath) return false;

  const sequence = new globalThis.Sequence();

  if (!impactOnly && auraPath) {
    sequence
      .effect()
      .file(auraPath)
      .attachTo(sourceToken, { bindVisibility: false })
      .scaleToObject(profile.auraScale ?? 0.45)
      .opacity(0.48)
      .fadeOut(180);
  }

  if (!impactOnly && swingPath) {
    sequence
      .effect()
      .file(swingPath)
      .atLocation(sourceToken)
      .rotateTowards(targetToken)
      .scaleToObject(profile.swingScale ?? 1)
      .opacity(0.84)
      .fadeOut(180)
      .waitUntilFinished(-120);
  }

  if (impactPath) {
    sequence
      .effect()
      .file(impactPath)
      .atLocation(targetToken)
      .scaleToObject(profile.impactScale ?? 0.6)
      .opacity(0.82)
      .fadeOut(180);
  }

  return playSequence(sequence);
}

async function playWeaponSequence(profile, sourceToken, targetToken, { impactOnly = false } = {}) {
  if (profile.animationType === "melee") {
    return playMeleeSequence(profile, sourceToken, targetToken, { impactOnly });
  }
  return playBeamSequence(profile, sourceToken, targetToken, { impactOnly });
}

async function playOrdnanceSequence(profile, sourceToken, targetToken, { includeExplosion = false } = {}) {
  if (!runtimeAvailable({ warn: true }) || !targetToken) return false;

  const launchPath = firstAvailableDataPath(profile.launch);
  const sourceBurstPath = firstAvailableDataPath(profile.sourceBurst);
  const explosionPath = firstAvailableDataPath(profile.explosion);

  if (!sourceToken || !launchPath) {
    if (!includeExplosion || !explosionPath) return false;
  }

  const sequence = new globalThis.Sequence();

  if (sourceToken && sourceBurstPath) {
    sequence
      .effect()
      .file(sourceBurstPath)
      .atLocation(sourceToken)
      .rotateTowards(targetToken)
      .scaleToObject(profile.sourceScale ?? 0.35)
      .opacity(0.7)
      .fadeOut(150);
  }

  if (sourceToken && launchPath) {
    sequence
      .effect()
      .file(launchPath)
      .atLocation(sourceToken)
      .stretchTo(targetToken)
      .scale(profile.launchScale ?? 1)
      .waitUntilFinished(includeExplosion ? -120 : -80);
  }

  if (includeExplosion && explosionPath) {
    sequence
      .effect()
      .file(explosionPath)
      .atLocation(targetToken)
      .scaleToObject(profile.explosionScale ?? 1.05)
      .opacity(0.88)
      .fadeOut(220);
  }

  return playSequence(sequence);
}

async function playStandaloneExplosion(profile, targetToken) {
  if (!runtimeAvailable({ warn: true }) || !targetToken) return false;
  const explosionPath = firstAvailableDataPath(profile.explosion);
  if (!explosionPath) return false;

  return playSequence(
    new globalThis.Sequence()
      .effect()
      .file(explosionPath)
      .atLocation(targetToken)
      .scaleToObject(profile.explosionScale ?? 1.05)
      .opacity(0.88)
      .fadeOut(220)
  );
}

async function playSupportSequence(profile, sourceToken, targetToken, { phase = "apply" } = {}) {
  if (!runtimeAvailable({ warn: true })) return false;
  const actualTarget = targetToken ?? sourceToken ?? null;
  if (!actualTarget) return false;

  const isRemoval = phase === "remove";
  const sourceBurstPath = firstAvailableDataPath(profile.sourceBurst);
  const beamPath = firstAvailableDataPath(profile.beam);
  const targetBurstPath = firstAvailableDataPath(isRemoval ? (profile.removalBurst?.length ? profile.removalBurst : profile.targetBurst) : profile.targetBurst);

  if (!sourceBurstPath && !beamPath && !targetBurstPath) return false;

  const sequence = new globalThis.Sequence();
  const distinctTokens = sourceToken && actualTarget && (tokenUuid(sourceToken) !== tokenUuid(actualTarget));

  if (sourceToken && distinctTokens && sourceBurstPath) {
    sequence
      .effect()
      .file(sourceBurstPath)
      .atLocation(sourceToken)
      .rotateTowards(actualTarget)
      .scaleToObject(profile.sourceScale ?? 0.35)
      .opacity(0.7)
      .fadeOut(180);
  }

  if (sourceToken && distinctTokens && beamPath) {
    sequence
      .effect()
      .file(beamPath)
      .atLocation(sourceToken)
      .stretchTo(actualTarget)
      .scale(profile.beamScale ?? 1)
      .waitUntilFinished(-120);
  }

  if ((!distinctTokens && sourceToken && sourceBurstPath) || targetBurstPath) {
    sequence
      .effect()
      .file(targetBurstPath ?? sourceBurstPath)
      .atLocation(actualTarget)
      .scaleToObject(profile.targetScale ?? 0.7)
      .opacity(isRemoval ? 0.68 : 0.84)
      .fadeOut(200);
  }

  return playSequence(sequence);
}

function supportedBarrierEntries(actor) {
  return Object.values(actorStateBarriers(actor)).filter((barrier) => {
    if (!(Number(barrier?.remaining ?? 0) > 0)) return false;
    return !!profileFor(barrier.sourceName || barrier.label || "", { barrier: true });
  });
}

function desiredBarrierEffects(actor) {
  const desired = new Map();
  const tokens = activeSceneTokensForActor(actor);
  const barriers = supportedBarrierEntries(actor);

  for (const token of tokens) {
    for (const barrier of barriers) {
      desired.set(barrierEffectName(token, barrier.id), { token, barrier });
    }
  }

  return desired;
}

function supportedTemporaryEffectEntries(actor) {
  return actorStateTemporaryEffects(actor).filter((effect) => {
    const profile = profileFor(effect.sourceName || effect.label || "", { persistent: true });
    return !!profile;
  });
}

function desiredTemporaryEffects(actor) {
  const desired = new Map();
  const tokens = activeSceneTokensForActor(actor);
  const effects = supportedTemporaryEffectEntries(actor);

  for (const token of tokens) {
    for (const effect of effects) {
      desired.set(temporaryEffectName(token, effect.id), { token, effect });
    }
  }

  return desired;
}

async function startPersistentSequence(token, effectName, profile) {
  if (!profile || !runtimeAvailable({ warn: true }) || !token) return false;
  if (effectManagerActive(effectName)) return true;

  const burstPath = firstAvailableDataPath(profile.burst);
  const loopBelowPath = firstAvailableDataPath(profile.loopBelow);
  const loopAbovePath = firstAvailableDataPath(profile.loopAbove);
  const loopPath = firstAvailableDataPath(profile.loop);

  if (!burstPath && !loopBelowPath && !loopAbovePath && !loopPath) return false;

  const sequence = new globalThis.Sequence();

  if (burstPath) {
    sequence
      .effect()
      .file(burstPath)
      .attachTo(token, { bindVisibility: false })
      .scaleToObject(profile.burstScale ?? 1.2)
      .opacity(0.8)
      .fadeOut(240)
      .waitUntilFinished(-180);
  }

  if (loopBelowPath) {
    sequence
      .effect()
      .file(loopBelowPath)
      .attachTo(token, { bindVisibility: false })
      .belowTokens()
      .name(effectName)
      .persist()
      .scaleToObject(profile.loopScale ?? 1.1)
      .opacity(profile.loopBelowOpacity ?? 0.4)
      .fadeIn(180);
  }

  if (loopAbovePath) {
    sequence
      .effect()
      .file(loopAbovePath)
      .attachTo(token, { bindVisibility: false })
      .name(effectName)
      .persist()
      .scaleToObject(profile.loopScale ?? 1.1)
      .opacity(profile.loopOpacity ?? 0.34)
      .fadeIn(180);
  }

  if (loopPath) {
    sequence
      .effect()
      .file(loopPath)
      .attachTo(token, { bindVisibility: false })
      .name(effectName)
      .persist()
      .scaleToObject(profile.loopScale ?? 1.1)
      .opacity(profile.loopOpacity ?? 0.34)
      .fadeIn(180);
  }

  return playSequence(sequence);
}

async function startBarrierSequence(token, barrier) {
  const profile = profileFor(barrier.sourceName || barrier.label || "", { barrier: true });
  if (!profile) return false;
  return startPersistentSequence(token, barrierEffectName(token, barrier.id), profile);
}

async function startTemporaryEffectSequence(token, effect) {
  const profile = profileFor(effect.sourceName || effect.label || "", { persistent: true });
  if (!profile) return false;
  return startPersistentSequence(token, temporaryEffectName(token, effect.id), profile);
}

function clearEffectsForTokenDocument(tokenDocument, trackedEffects) {
  const targetUuid = tokenDocument?.uuid ?? "";
  if (!targetUuid) return;

  for (const [actorUuid, names] of trackedEffects.entries()) {
    const retained = new Set();
    for (const name of names) {
      if (name.includes(`.${targetUuid}.`)) stopNamedEffect(name);
      else retained.add(name);
    }
    if (retained.size) trackedEffects.set(actorUuid, retained);
    else trackedEffects.delete(actorUuid);
  }
}

async function syncSceneEffects() {
  if (!runtimeAvailable()) return;
  for (const actor of game.actors?.contents ?? []) {
    if (!["character", "monster"].includes(actor.type)) continue;
    await syncBarrierEffectsForActor(actor);
    await syncTemporaryEffectsForActor(actor);
  }
}

function stopTrackedEffects(trackedEffects) {
  for (const names of trackedEffects.values()) {
    for (const name of names) stopNamedEffect(name);
  }
  trackedEffects.clear();
}

export async function playWeaponProjectile({ weaponName = "", sourceToken = null, targetToken = null } = {}) {
  const profile = profileFor(weaponName, { kind: "weapon" });
  if (!profile) return false;
  return playWeaponSequence(profile, sourceToken, targetToken, { impactOnly: false });
}

export async function playWeaponImpact({ weaponName = "", sourceToken = null, targetToken = null } = {}) {
  const profile = profileFor(weaponName, { kind: "weapon" });
  if (!profile) return false;
  return playWeaponSequence(profile, sourceToken, targetToken, { impactOnly: true });
}

export async function playThrownOrdnance({ itemName = "", sourceToken = null, targetToken = null } = {}) {
  const profile = profileFor(itemName, { kind: "gear", ordnance: true });
  if (!profile || profile.launchMode !== "thrown") return false;
  return playOrdnanceSequence(profile, sourceToken, targetToken, { includeExplosion: false });
}

export async function playMissileLaunch({ itemName = "", sourceToken = null, targetToken = null } = {}) {
  const profile = profileFor(itemName, { kind: "gear", ordnance: true });
  if (!profile || profile.launchMode !== "missile") return false;
  return playOrdnanceSequence(profile, sourceToken, targetToken, { includeExplosion: false });
}

export async function playExplosion({ itemName = "", targetToken = null } = {}) {
  const profile = profileFor(itemName, { kind: "gear", ordnance: true });
  if (!profile) return false;
  return playStandaloneExplosion(profile, targetToken);
}

/**
 * Play an animation that fills a MeasuredTemplate's footprint. For
 * instantaneous effects a one-shot explosion is centered on the template.
 * For persistent effects (`persistentRounds > 0`), a looping Sequencer
 * animation is attached to the template document so it stays visible until
 * the AOE expiry sweep deletes the template.
 *
 * The animationKey is a soft hint into the existing `profileFor()` registry;
 * when absent or unresolved, we fall back to a generic jb2a explosion so the
 * card still feels responsive.
 */
export async function playAreaEffect({
  template = null,
  animationKey = "",
  itemName = "",
  persistentRounds = 0
} = {}) {
  if (!template || !runtimeAvailable({ warn: false })) return false;

  // Resolve a profile by animation-key override, item-name lookup, or a
  // generic ordnance match. All three may miss in a world without JB2A.
  let profile = null;
  if (animationKey) profile = profileFor(animationKey, { kind: "gear", ordnance: true });
  if (!profile && itemName) profile = profileFor(itemName, { kind: "gear", ordnance: true });

  const explosionPath = profile ? firstAvailableDataPath(profile.explosion) : null;
  const loopPath = profile ? firstAvailableDataPath(profile.loop ?? profile.loopBelow ?? []) : null;

  // One-shot detonation for instantaneous effects.
  if (persistentRounds <= 0) {
    if (!explosionPath) return false;
    return playSequence(
      new globalThis.Sequence()
        .effect()
        .file(explosionPath)
        .atLocation({ x: template.x, y: template.y })
        .scale(profile?.explosionScale ?? 1)
        .opacity(0.9)
        .fadeOut(260)
    );
  }

  // Persistent cloud: attach a looping effect to the template doc and tag it
  // so the AOE expiry sweep can find and remove it. If no loop asset exists
  // for this item, we at least play the one-shot explosion so something
  // happens — better than silent placement.
  const effectName = `${SYSTEM_ID}.aoe.${template.id ?? template.uuid ?? Date.now()}`;
  const sequence = new globalThis.Sequence();

  if (explosionPath) {
    sequence
      .effect()
      .file(explosionPath)
      .atLocation({ x: template.x, y: template.y })
      .scale(profile?.explosionScale ?? 1)
      .opacity(0.85)
      .fadeOut(200);
  }

  if (loopPath) {
    sequence
      .effect()
      .file(loopPath)
      .attachTo(template)
      .persist(true)
      .name(effectName)
      .opacity(0.7);
  }

  return playSequence(sequence);
}

export async function startBarrierEffect({ actor = null, token = null, barrierId = "", sourceName = "" } = {}) {
  if (!actor || !token || !barrierId) return false;
  return startBarrierSequence(token, {
    id: barrierId,
    sourceName
  });
}

export async function stopBarrierEffect({ token = null, barrierId = "" } = {}) {
  if (!token || !barrierId) return false;
  return stopNamedEffect(barrierEffectName(token, barrierId), { label: "Barrier animation" });
}

export async function startCloudEffect({ actor = null, token = null, effectId = "", sourceName = "" } = {}) {
  if (!actor || !token || !effectId) return false;
  return startTemporaryEffectSequence(token, {
    id: effectId,
    sourceName
  });
}

export async function stopCloudEffect({ token = null, effectId = "" } = {}) {
  if (!token || !effectId) return false;
  return stopNamedEffect(temporaryEffectName(token, effectId), { label: "Effect animation" });
}

export async function playSupportEffect({ itemName = "", sourceToken = null, targetToken = null, phase = "apply" } = {}) {
  const profile = profileFor(itemName, { kind: "gear", support: true });
  if (!profile) return false;
  return playSupportSequence(profile, sourceToken, targetToken, { phase });
}

export async function syncBarrierEffectsForActor(actor) {
  if (!(actor instanceof Actor)) return;

  const desired = desiredBarrierEffects(actor);
  const desiredNames = new Set(desired.keys());
  const current = new Set(barrierEffectsForActor(actor));

  for (const effectName of current) {
    if (!desiredNames.has(effectName)) stopNamedEffect(effectName, { label: "Barrier animation" });
  }

  for (const [effectName, data] of desired.entries()) {
    if (current.has(effectName)) continue;
    await startBarrierSequence(data.token, data.barrier);
  }

  cacheEffects(activeBarrierEffects, actor, desiredNames);
}

export async function syncTemporaryEffectsForActor(actor) {
  if (!(actor instanceof Actor)) return;

  const desired = desiredTemporaryEffects(actor);
  const desiredNames = new Set(desired.keys());
  const current = new Set(temporaryEffectsForActor(actor));

  for (const effectName of current) {
    if (!desiredNames.has(effectName)) stopNamedEffect(effectName, { label: "Effect animation" });
  }

  for (const [effectName, data] of desired.entries()) {
    if (current.has(effectName)) continue;
    await startTemporaryEffectSequence(data.token, data.effect);
  }

  cacheEffects(activeTemporaryEffects, actor, desiredNames);
}

export function registerAnimationSettings() {
  game.settings.register(SYSTEM_ID, ANIMATION_SETTING, {
    name: game.i18n.localize("GAMMA_WORLD.Settings.PilotAnimations.Name"),
    hint: game.i18n.localize("GAMMA_WORLD.Settings.PilotAnimations.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: false,
    onChange: async () => {
      availableDataPaths.clear();
      missingSupportWarningShown = false;
      if (runtimeAvailable()) await syncSceneEffects();
      else {
        stopTrackedEffects(activeBarrierEffects);
        stopTrackedEffects(activeTemporaryEffects);
      }
    }
  });
}

export function registerAnimationHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;

  Hooks.on("ready", async () => {
    availableDataPaths.clear();
    primeAvailableDataPaths();
    await syncSceneEffects();
  });

  Hooks.on("canvasReady", async () => {
    await syncSceneEffects();
  });

  Hooks.on("updateActor", async (actor, changes) => {
    if (!["character", "monster"].includes(actor.type)) return;
    if (!(changes.flags?.[SYSTEM_ID])) return;
    await syncBarrierEffectsForActor(actor);
    await syncTemporaryEffectsForActor(actor);
  });

  Hooks.on("createToken", (tokenDocument) => {
    const actor = tokenDocument?.actor ?? game.actors?.get(tokenDocument?.actorId);
    if (!actor) return;
    globalThis.setTimeout(() => {
      syncBarrierEffectsForActor(actor);
      syncTemporaryEffectsForActor(actor);
    }, 0);
  });

  Hooks.on("deleteToken", (tokenDocument) => {
    clearEffectsForTokenDocument(tokenDocument, activeBarrierEffects);
    clearEffectsForTokenDocument(tokenDocument, activeTemporaryEffects);
  });
}

export function createAnimationApi() {
  return {
    playWeaponProjectile,
    playWeaponImpact,
    playThrownOrdnance,
    playMissileLaunch,
    playExplosion,
    playAreaEffect,
    playSupportEffect,
    startBarrierEffect,
    stopBarrierEffect,
    startCloudEffect,
    stopCloudEffect
  };
}
