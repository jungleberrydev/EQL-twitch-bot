import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  characterFirstName,
  characterSheetUrl,
  pickCharacterMatches,
  resolveServer,
  type RosterCharacterSummary,
} from "./norrathroster.js";
import { parseRosterLinkCommand } from "./handler.js";
import {
  ROSTER_LINK_REPLY,
  TWITCH_MSG_LIMIT,
  formatRosterInvalidServer,
  formatRosterNotFound,
  formatRosterUsage,
} from "./format.js";

function char(
  partial: Partial<RosterCharacterSummary> &
    Pick<RosterCharacterSummary, "id" | "name" | "server">,
): RosterCharacterSummary {
  return {
    serverName: partial.serverName ?? partial.server,
    classSummary: partial.classSummary ?? "",
    ...partial,
  };
}

describe("resolveServer", () => {
  it("matches keys and display names case-insensitively", () => {
    assert.equal(resolveServer("freeport")?.key, "freeport");
    assert.equal(resolveServer("Freeport")?.name, "Freeport");
    assert.equal(resolveServer("RIVERVALE")?.key, "rivervale");
    assert.equal(resolveServer("nope"), null);
  });
});

describe("characterFirstName", () => {
  it("uses the first whitespace token", () => {
    assert.equal(characterFirstName("Flesh"), "Flesh");
    assert.equal(characterFirstName("  Flesh Surename  "), "Flesh");
  });
});

describe("pickCharacterMatches", () => {
  const roster = [
    char({ id: 1, name: "Flesh", server: "freeport", serverName: "Freeport" }),
    char({
      id: 2,
      name: "Fleshburn",
      server: "freeport",
      serverName: "Freeport",
    }),
    char({
      id: 3,
      name: "Flesh the Bold",
      server: "freeport",
      serverName: "Freeport",
    }),
  ];

  it("prefers exact full-name match", () => {
    const hits = pickCharacterMatches(roster, "Flesh the Bold");
    assert.deepEqual(
      hits.map((c) => c.id),
      [3],
    );
  });

  it("falls back to exact first-name match", () => {
    const hits = pickCharacterMatches(
      [
        char({
          id: 3,
          name: "Flesh the Bold",
          server: "freeport",
          serverName: "Freeport",
        }),
        char({
          id: 2,
          name: "Fleshburn",
          server: "freeport",
          serverName: "Freeport",
        }),
      ],
      "Flesh",
    );
    assert.deepEqual(
      hits.map((c) => c.id),
      [3],
    );
  });

  it("ignores loose substring-only hits", () => {
    assert.deepEqual(pickCharacterMatches(roster, "burn"), []);
  });
});

describe("characterSheetUrl", () => {
  it("builds the public sheet path", () => {
    assert.equal(
      characterSheetUrl(32),
      "https://norrathroster.com/characters/32",
    );
  });
});

describe("parseRosterLinkCommand lookup args", () => {
  it("parses bare commands", () => {
    assert.deepEqual(parseRosterLinkCommand("!roster"), {
      kind: "roster",
      lookup: null,
    });
    assert.deepEqual(parseRosterLinkCommand("!magelo"), {
      kind: "magelo",
      lookup: null,
    });
  });

  it("parses name + server (server is last token)", () => {
    assert.deepEqual(parseRosterLinkCommand("!roster Flesh freeport"), {
      kind: "roster",
      lookup: { name: "Flesh", server: "freeport" },
    });
    assert.deepEqual(parseRosterLinkCommand("!magelo Flesh the Bold Rivervale"), {
      kind: "magelo",
      lookup: { name: "Flesh the Bold", server: "Rivervale" },
    });
  });

  it("marks a single trailing arg as incomplete", () => {
    assert.deepEqual(parseRosterLinkCommand("!roster Flesh"), {
      kind: "roster",
      lookup: "incomplete",
    });
    assert.deepEqual(parseRosterLinkCommand("!magelo please"), {
      kind: "magelo",
      lookup: "incomplete",
    });
  });
});

describe("roster reply helpers", () => {
  it("keeps bare reply and usage under the Twitch limit", () => {
    assert.ok(ROSTER_LINK_REPLY.includes("https://norrathroster.com"));
    assert.ok(ROSTER_LINK_REPLY.length <= TWITCH_MSG_LIMIT);
    assert.ok(formatRosterUsage("roster").includes("!roster <name> <server>"));
    assert.ok(formatRosterNotFound("Flesh", "Freeport").includes("Flesh"));
    assert.ok(formatRosterInvalidServer("xyz").includes("xyz"));
  });
});
