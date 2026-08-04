import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateUpgradedStatsText,
  extractItemLevel,
  itemNameWithLevel,
  parseItemLevelQuery,
  stripItemLevel,
  upgradeDamageValue,
  upgradeStatValue,
  upgradeWeightValue,
} from "./itemUpgrades.js";

describe("upgradeStatValue", () => {
  it("scales positives with +10%/tier and at least +1 per tier", () => {
    assert.equal(upgradeStatValue(5, 0), 5);
    assert.equal(upgradeStatValue(5, 1), 6);
    assert.equal(upgradeStatValue(5, 4), 9);
    assert.equal(upgradeStatValue(15, 4), 21);
    assert.equal(upgradeStatValue(0, 5), 0);
  });

  it("improves negatives toward zero and never goes positive", () => {
    const swordChaByTier = [-5, -4, -3, -2, -1, 0, 0, 0, 0, 0, 0];
    for (let t = 0; t <= 10; t++) {
      assert.equal(upgradeStatValue(-5, t), swordChaByTier[t]);
    }
    assert.equal(upgradeStatValue(-1, 3), 0);
    assert.equal(upgradeStatValue(-15, 2), -13);
    assert.equal(upgradeStatValue(-15, 10), -5);
    assert.equal(upgradeStatValue(-1, 10), 0);
  });
});

describe("upgradeDamageValue", () => {
  it("uses base + floor(base * tier / 10) with no +1 floor", () => {
    // Rusty Dagger — small DMG must not get base+tier
    assert.equal(upgradeDamageValue(3, 0), 3);
    assert.equal(upgradeDamageValue(3, 1), 3);
    assert.equal(upgradeDamageValue(3, 4), 4);
    assert.equal(upgradeDamageValue(3, 10), 6);
    // Larger weapons still roughly double at +10
    assert.equal(upgradeDamageValue(23, 1), 25);
    assert.equal(upgradeDamageValue(23, 10), 46);
    assert.equal(upgradeDamageValue(33, 10), 66);
  });
});

describe("upgradeWeightValue", () => {
  it("drops weight by 10% of base per tier", () => {
    assert.equal(upgradeWeightValue(4.0, 4), 2.4);
    assert.equal(upgradeWeightValue(0, 4), 0);
  });
});

describe("calculateUpgradedStatsText", () => {
  it("rewrites scaling tokens in a statsblock", () => {
    assert.equal(
      calculateUpgradedStatsText("STR: +5 CHA: -5 HP: +15", 4),
      "STR: +9 CHA: -1 HP: +21",
    );
    assert.equal(
      calculateUpgradedStatsText("CHA: -1 AGI: +1", 3),
      "CHA: 0 AGI: +4",
    );
  });

  it("scales DMG without the primary-stat +1 floor", () => {
    assert.equal(
      calculateUpgradedStatsText(
        "Skill: Piercing Atk Delay: 24 DMG: 3 WT: 2.5",
        10,
      ),
      "Skill: Piercing Atk Delay: 24 DMG: 6 WT: 0.1",
    );
  });

  it("leaves text unchanged at tier 0", () => {
    assert.equal(
      calculateUpgradedStatsText("STR: +5", 0),
      "STR: +5",
    );
  });
});

describe("itemNameWithLevel", () => {
  it("appends +N once", () => {
    assert.equal(itemNameWithLevel("SoulFire", 1), "SoulFire +1");
    assert.equal(itemNameWithLevel("SoulFire +1", 1), "SoulFire +1");
    assert.equal(itemNameWithLevel("SoulFire", 0), "SoulFire");
  });
});

describe("parseItemLevelQuery", () => {
  it("splits trailing +N from the item name", () => {
    assert.deepEqual(parseItemLevelQuery("SoulFire +1"), {
      name: "SoulFire",
      level: 1,
    });
    assert.deepEqual(parseItemLevelQuery("Fiery Avenger +2"), {
      name: "Fiery Avenger",
      level: 2,
    });
    assert.deepEqual(parseItemLevelQuery("SoulFire"), {
      name: "SoulFire",
      level: 0,
    });
  });

  it("clamps tiers above 10", () => {
    assert.deepEqual(parseItemLevelQuery("SoulFire +99"), {
      name: "SoulFire",
      level: 10,
    });
  });

  it("extracts and strips independently", () => {
    assert.equal(extractItemLevel("SoulFire +3"), 3);
    assert.equal(extractItemLevel("SoulFire"), null);
    assert.equal(stripItemLevel("SoulFire +3"), "SoulFire");
  });
});
