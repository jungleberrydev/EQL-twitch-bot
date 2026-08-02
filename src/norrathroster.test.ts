import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  characterFirstName,
  characterSheetUrl,
  guildPageUrl,
  pickCharacterMatches,
  pickGuildMatches,
  resolveServer,
  type RosterCharacterSummary,
  type RosterGuildSummary,
} from "./norrathroster.js";
import { parseRosterLinkCommand } from "./handler.js";
import {
  ROSTER_LINK_REPLY,
  TWITCH_MSG_LIMIT,
  formatGuildMemberSummary,
  formatRosterGuildNotFound,
  formatRosterGuildUsage,
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

describe("guildPageUrl", () => {
  it("builds the public guild path with encoding", () => {
    assert.equal(
      guildPageUrl("rivervale", "Severely Artistic"),
      "https://norrathroster.com/guilds/rivervale/Severely%20Artistic",
    );
  });
});

describe("pickGuildMatches", () => {
  const guilds: RosterGuildSummary[] = [
    {
      name: "Severely Artistic",
      server: "rivervale",
      serverName: "Rivervale",
      memberCount: 4,
    },
    {
      name: "Solace",
      server: "rivervale",
      serverName: "Rivervale",
      memberCount: 1,
    },
    {
      name: "Artistic Endeavor",
      server: "rivervale",
      serverName: "Rivervale",
      memberCount: 2,
    },
  ];

  it("prefers exact name match", () => {
    const hits = pickGuildMatches(guilds, "severely artistic");
    assert.deepEqual(
      hits.map((g) => g.name),
      ["Severely Artistic"],
    );
  });

  it("falls back to substring matches", () => {
    const hits = pickGuildMatches(guilds, "Artistic");
    assert.deepEqual(
      hits.map((g) => g.name).sort(),
      ["Artistic Endeavor", "Severely Artistic"],
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
      lookup: { target: "character", name: "Flesh", server: "freeport" },
    });
    assert.deepEqual(parseRosterLinkCommand("!magelo Flesh the Bold Rivervale"), {
      kind: "magelo",
      lookup: {
        target: "character",
        name: "Flesh the Bold",
        server: "Rivervale",
      },
    });
  });

  it("parses guild subcommand with multi-word name", () => {
    assert.deepEqual(
      parseRosterLinkCommand("!roster guild Severely Artistic rivervale"),
      {
        kind: "roster",
        lookup: {
          target: "guild",
          name: "Severely Artistic",
          server: "rivervale",
        },
      },
    );
    assert.deepEqual(parseRosterLinkCommand("!magelo GUILD Solace Freeport"), {
      kind: "magelo",
      lookup: { target: "guild", name: "Solace", server: "Freeport" },
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

  it("marks incomplete guild lookups", () => {
    assert.deepEqual(parseRosterLinkCommand("!roster guild"), {
      kind: "roster",
      lookup: "incomplete_guild",
    });
    assert.deepEqual(parseRosterLinkCommand("!roster guild Severely"), {
      kind: "roster",
      lookup: "incomplete_guild",
    });
  });
});

describe("roster reply helpers", () => {
  it("keeps bare reply and usage under the Twitch limit", () => {
    assert.ok(ROSTER_LINK_REPLY.includes("https://norrathroster.com"));
    assert.ok(ROSTER_LINK_REPLY.includes("!roster guild <name> <server>"));
    assert.ok(ROSTER_LINK_REPLY.length <= TWITCH_MSG_LIMIT);
    assert.ok(formatRosterUsage("roster").includes("!roster <name> <server>"));
    assert.ok(
      formatRosterGuildUsage("roster").includes("!roster guild <name> <server>"),
    );
    assert.ok(formatRosterNotFound("Flesh", "Freeport").includes("Flesh"));
    assert.ok(
      formatRosterGuildNotFound("Severely Artistic", "Rivervale").includes(
        "Severely Artistic",
      ),
    );
    assert.equal(formatGuildMemberSummary(1), "1 member");
    assert.equal(formatGuildMemberSummary(4), "4 members");
    assert.ok(formatRosterInvalidServer("xyz").includes("xyz"));
  });
});
