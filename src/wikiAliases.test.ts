import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expandWikiAlias,
  listWikiAliasKeys,
  normalizeAliasKey,
} from "./wikiAliases.js";

describe("normalizeAliasKey", () => {
  it("lowercases and strips separators", () => {
    assert.equal(normalizeAliasKey(" FBSS "), "fbss");
    assert.equal(normalizeAliasKey("J Boots"), "jboots");
    assert.equal(normalizeAliasKey("t-staff"), "tstaff");
    assert.equal(normalizeAliasKey("Journeyman's"), "journeymans");
  });
});

describe("expandWikiAlias", () => {
  it("expands known item nicknames", () => {
    assert.equal(expandWikiAlias("fbss"), "Flowing Black Silk Sash");
    assert.equal(expandWikiAlias("YAK"), "Short Sword of the Ykesha");
    assert.equal(expandWikiAlias("ssoy"), "Short Sword of the Ykesha");
    assert.equal(expandWikiAlias("j boots"), "Journeyman's Boots");
    assert.equal(expandWikiAlias("hbc"), "Hooded Black Cloak");
    assert.equal(expandWikiAlias("pgt"), "Polished Granite Tomahawk");
    assert.equal(expandWikiAlias("cbb"), "Chipped Bone Bracelet");
    assert.equal(expandWikiAlias("ebw"), "Electrum-Bladed Wakizashi");
    assert.equal(expandWikiAlias("wdc"), "White Dragonscale Cloak");
    assert.equal(expandWikiAlias("fotg"), "Fang of the Garou");
  });

  it("leaves unknown queries unchanged", () => {
    assert.equal(expandWikiAlias("SoulFire"), "SoulFire");
    assert.equal(expandWikiAlias("  Rusty Dagger  "), "Rusty Dagger");
  });

  it("has a curated non-empty map", () => {
    assert.ok(listWikiAliasKeys().length >= 20);
    assert.ok(listWikiAliasKeys().includes("fbss"));
    assert.ok(listWikiAliasKeys().includes("yak"));
  });
});
