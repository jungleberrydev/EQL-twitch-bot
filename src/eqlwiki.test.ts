import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanStatsblock, expandSpellHoverLinks } from "./eqlwiki.js";

describe("expandSpellHoverLinks", () => {
  it("expands page-only SpellHoverLink into a wiki link", () => {
    assert.equal(
      expandSpellHoverLinks("Adds {{SpellHoverLink|Divine Might Strike}} (melee proc)."),
      "Adds [[Divine Might Strike]] (melee proc).",
    );
  });

  it("keeps an explicit display label", () => {
    assert.equal(
      expandSpellHoverLinks("{{SpellHoverLink|Complete Heal|CH}}"),
      "[[Complete Heal|CH]]",
    );
  });

  it("ignores named template args like class=", () => {
    assert.equal(
      expandSpellHoverLinks("{{SpellHoverLink|Smite|class=Cleric}}"),
      "[[Smite]]",
    );
  });
});

describe("cleanStatsblock", () => {
  it("turns SpellHoverLink into a readable spell name", () => {
    const out = cleanStatsblock(
      "Adds {{SpellHoverLink|Divine Might Strike}} (melee proc).",
    );
    assert.equal(out, "Adds [Divine Might Strike](https://eqlwiki.com/Divine_Might_Strike) (melee proc).");
  });
});
