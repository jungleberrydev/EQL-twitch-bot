import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEqlCommand, parseRosterLinkCommand } from "./handler.js";
import {
  ROSTER_LINK_REPLY,
  TWITCH_MSG_LIMIT,
  clampChat,
  extractEffectLinks,
  flattenWikiText,
  formatAmbiguousChat,
  formatLookupReply,
} from "./format.js";

describe("flattenWikiText", () => {
  it("collapses newlines and keeps http markdown links as bare URLs", () => {
    assert.equal(
      flattenWikiText("**SoulFire**\nAC: 0\n[wiki](https://x.example/page)"),
      "SoulFire AC: 0 wiki https://x.example/page",
    );
  });

  it("preserves underscores inside wiki URLs", () => {
    assert.equal(
      flattenWikiText(
        "Effect: [Promised Renewal](https://eqlwiki.com/Promised_Renewal)",
      ),
      "Effect: Promised Renewal https://eqlwiki.com/Promised_Renewal",
    );
  });
});

describe("extractEffectLinks", () => {
  it("pulls spell links from Effect: lines only", () => {
    const stats = [
      "Slot: PRIMARY",
      "Effect: [Promised Renewal](https://eqlwiki.com/Promised_Renewal) (Any Slot)",
      "Loot: [Iron Ration](https://eqlwiki.com/Iron_Ration)",
    ].join("\n");
    assert.deepEqual(extractEffectLinks(stats), [
      {
        label: "Promised Renewal",
        url: "https://eqlwiki.com/Promised_Renewal",
      },
    ]);
  });
});

describe("formatLookupReply", () => {
  it("puts the URL after the name", () => {
    const url = "https://eqlwiki.com/SoulFire";
    const out = formatLookupReply({
      name: "SoulFire",
      description: "A fire spell",
      pageUrl: url,
    });
    assert.equal(out, `SoulFire: ${url} — A fire spell`);
  });

  it("lists item Effect: spell links beside the item URL", () => {
    const itemUrl = "https://eqlwiki.com/SoulFire";
    const effectUrl = "https://eqlwiki.com/Promised_Renewal";
    const out = formatLookupReply({
      name: "SoulFire",
      description: [
        "Slot: PRIMARY SECONDARY",
        `Effect: [Promised Renewal](${effectUrl}) (Any Slot/Can Equip, Casting Time: Instant)`,
        "WT: 0.0 Size: TINY",
      ].join("\n"),
      pageUrl: itemUrl,
    });
    assert.ok(out.startsWith(`SoulFire: ${itemUrl} | Promised Renewal: ${effectUrl}`));
    assert.match(out, /Effect: Promised Renewal \(Any Slot/);
    assert.ok(!out.includes(`${effectUrl} (Any`));
  });

  it("keeps Effect: URLs when truncating the stats summary", () => {
    const itemUrl = "https://eqlwiki.com/SoulFire";
    const effectUrl = "https://eqlwiki.com/Promised_Renewal";
    const out = formatLookupReply({
      name: "SoulFire",
      description: [
        `Effect: [Promised Renewal](${effectUrl})`,
        "A".repeat(600),
      ].join("\n"),
      pageUrl: itemUrl,
      limit: 120,
    });
    assert.ok(out.includes(itemUrl));
    assert.ok(out.includes(effectUrl));
    assert.ok(out.length <= 120);
  });

  it("keeps the URL when truncating", () => {
    const url = "https://eqlwiki.com/SoulFire";
    const out = formatLookupReply({
      name: "SoulFire",
      description: "A".repeat(600),
      pageUrl: url,
      limit: 80,
    });
    assert.ok(out.startsWith(`SoulFire: ${url}`));
    assert.ok(out.includes(url));
    assert.ok(out.length <= 80);
  });

  it("prefers the bare URL when name+url exceeds the limit", () => {
    const url = "https://eqlwiki.com/VeryLongPageNameThatTakesSpace";
    const out = formatLookupReply({
      name: "Very Long Item Name Here",
      description: "stats",
      pageUrl: url,
      limit: url.length,
    });
    assert.equal(out, url);
  });

  it("fits under the default Twitch limit", () => {
    const out = formatLookupReply({
      name: "SoulFire",
      description: "B".repeat(1000),
      pageUrl: "https://eqlwiki.com/SoulFire",
    });
    assert.ok(out.length <= TWITCH_MSG_LIMIT);
    assert.ok(out.includes("https://eqlwiki.com/SoulFire"));
  });
});

describe("formatAmbiguousChat", () => {
  it("lists a few suggestions", () => {
    const out = formatAmbiguousChat("soul", ["SoulFire", "SoulBind"]);
    assert.match(out, /SoulFire/);
    assert.match(out, /SoulBind/);
  });
});

describe("clampChat", () => {
  it("adds an ellipsis when over limit", () => {
    assert.equal(clampChat("abcdef", 4), "abc…");
  });

  it("does not leave a truncated URL stump", () => {
    const out = clampChat("stats https://eqlwiki.com/Promised_Renewal more", 30);
    assert.ok(!out.includes("https://eqlwiki.com/Promi"));
    assert.ok(out.endsWith("…"));
    assert.ok(out.length <= 30);
  });
});

describe("parseEqlCommand", () => {
  const prefix = "!eql";

  it("parses typed item lookup", () => {
    assert.deepEqual(parseEqlCommand("!eql item SoulFire", prefix), {
      kind: "typed",
      type: "item",
      query: "SoulFire",
    });
  });

  it("maps npc to mob", () => {
    assert.deepEqual(parseEqlCommand("!eql npc a gnoll", prefix), {
      kind: "typed",
      type: "mob",
      query: "a gnoll",
    });
  });

  it("treats bare query as wiki", () => {
    assert.deepEqual(parseEqlCommand("!eql SoulFire", prefix), {
      kind: "wiki",
      query: "SoulFire",
    });
  });

  it("returns help", () => {
    assert.deepEqual(parseEqlCommand("!eql", prefix), { kind: "help" });
    assert.deepEqual(parseEqlCommand("!eql help", prefix), { kind: "help" });
  });

  it("ignores unrelated chat", () => {
    assert.equal(parseEqlCommand("hello there", prefix), null);
    assert.equal(parseEqlCommand("!item SoulFire", prefix), null);
  });
});

describe("parseRosterLinkCommand", () => {
  it("parses !magelo and !roster case-insensitively", () => {
    assert.deepEqual(parseRosterLinkCommand("!magelo"), { kind: "magelo" });
    assert.deepEqual(parseRosterLinkCommand("!MAGELO"), { kind: "magelo" });
    assert.deepEqual(parseRosterLinkCommand("!roster"), { kind: "roster" });
    assert.deepEqual(parseRosterLinkCommand("  !Roster  "), { kind: "roster" });
  });

  it("accepts optional trailing args", () => {
    assert.deepEqual(parseRosterLinkCommand("!magelo please"), {
      kind: "magelo",
    });
    assert.deepEqual(parseRosterLinkCommand("!roster sheets"), {
      kind: "roster",
    });
  });

  it("ignores unrelated chat", () => {
    assert.equal(parseRosterLinkCommand("!eql help"), null);
    assert.equal(parseRosterLinkCommand("magelo"), null);
    assert.equal(parseRosterLinkCommand("!magelos"), null);
  });

  it("uses the shared short reply text", () => {
    assert.ok(ROSTER_LINK_REPLY.includes("https://norrathroster.com"));
    assert.ok(ROSTER_LINK_REPLY.length <= TWITCH_MSG_LIMIT);
  });
});
