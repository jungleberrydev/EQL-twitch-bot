import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEqlCommand, parseRosterLinkCommand } from "./handler.js";
import {
  ROSTER_LINK_REPLY,
  TWITCH_MSG_LIMIT,
  clampChat,
  flattenWikiText,
  formatAmbiguousChat,
  formatLookupReply,
} from "./format.js";

describe("flattenWikiText", () => {
  it("collapses newlines and strips light markdown", () => {
    assert.equal(
      flattenWikiText("**SoulFire**\nAC: 0\n[wiki](https://x)"),
      "SoulFire AC: 0 wiki",
    );
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
    assert.deepEqual(parseRosterLinkCommand("!magelo"), {
      kind: "magelo",
      lookup: null,
    });
    assert.deepEqual(parseRosterLinkCommand("!MAGELO"), {
      kind: "magelo",
      lookup: null,
    });
    assert.deepEqual(parseRosterLinkCommand("!roster"), {
      kind: "roster",
      lookup: null,
    });
    assert.deepEqual(parseRosterLinkCommand("  !Roster  "), {
      kind: "roster",
      lookup: null,
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
