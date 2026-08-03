import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { TWITCH_MSG_LIMIT } from "./format.js";
import {
  emptyCounts,
  formatUsageStats,
  incrementCounts,
  isChannelPrivileged,
  UsageStore,
} from "./usage.js";
import { parseEqlCommand } from "./handler.js";

describe("incrementCounts", () => {
  it("bumps kind and total", () => {
    const next = incrementCounts(emptyCounts(), "item");
    assert.equal(next.item, 1);
    assert.equal(next.total, 1);
    assert.equal(next.mob, 0);
  });

  it("stacks multiple increments", () => {
    let counts = emptyCounts();
    counts = incrementCounts(counts, "mob");
    counts = incrementCounts(counts, "mob");
    counts = incrementCounts(counts, "wiki");
    assert.equal(counts.mob, 2);
    assert.equal(counts.wiki, 1);
    assert.equal(counts.total, 3);
  });
});

describe("formatUsageStats", () => {
  it("includes total and kinds under the Twitch limit", () => {
    const counts = {
      ...emptyCounts(),
      total: 42,
      item: 10,
      mob: 5,
      zone: 3,
      spell: 2,
      faction: 1,
      wiki: 15,
      help: 6,
    };
    const out = formatUsageStats(counts);
    assert.match(out, /^EQLwiki usage — total: 42 \|/);
    assert.match(out, /item: 10/);
    assert.match(out, /wiki: 15/);
    assert.ok(!out.includes("unknown"));
    assert.ok(out.length <= TWITCH_MSG_LIMIT);
  });

  it("shows unknown only when non-zero", () => {
    const withUnknown = { ...emptyCounts(), total: 1, unknown: 1 };
    assert.match(formatUsageStats(withUnknown), /unknown: 1/);
  });
});

describe("isChannelPrivileged", () => {
  it("allows broadcaster by channel login match", () => {
    assert.equal(
      isChannelPrivileged("#jungleberry", { username: "jungleberry" }),
      true,
    );
  });

  it("allows mod badge / mod flag", () => {
    assert.equal(
      isChannelPrivileged("#chan", {
        username: "helper",
        mod: true,
      }),
      true,
    );
    assert.equal(
      isChannelPrivileged("#chan", {
        username: "helper",
        badges: { moderator: "1" },
      }),
      true,
    );
  });

  it("rejects regular viewers", () => {
    assert.equal(
      isChannelPrivileged("#chan", { username: "viewer" }),
      false,
    );
  });
});

describe("UsageStore", () => {
  it("persists across instances", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-usage-"));
    const file = path.join(dir, "usage.json");
    try {
      const a = new UsageStore(file);
      a.increment("item");
      a.increment("help");
      const b = new UsageStore(file);
      const counts = b.getCounts();
      assert.equal(counts.item, 1);
      assert.equal(counts.help, 1);
      assert.equal(counts.total, 2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("tracks per-channel totals and lastUsedAt", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-usage-"));
    const file = path.join(dir, "usage.json");
    try {
      const store = new UsageStore(file);
      store.increment("item", "#Alpha");
      store.increment("item", "alpha");
      store.increment("wiki", "beta");
      store.increment("help", "beta");
      store.increment("mob"); // global only

      const report = store.getReport();
      assert.equal(report.total, 5);
      assert.equal(report.byKind.item, 2);
      assert.equal(report.byKind.wiki, 1);
      assert.equal(report.byKind.help, 1);
      assert.equal(report.byKind.mob, 1);
      assert.equal(report.channels.length, 2);
      assert.equal(report.channels[0]?.channel, "alpha");
      assert.equal(report.channels[0]?.total, 2);
      assert.equal(report.channels[0]?.byKind.item, 2);
      assert.ok(typeof report.channels[0]?.lastUsedAt === "number");
      assert.equal(report.channels[1]?.channel, "beta");
      assert.equal(report.channels[1]?.total, 2);

      const reloaded = new UsageStore(file).getReport();
      assert.equal(reloaded.channels[0]?.total, 2);
      assert.equal(reloaded.channels[1]?.byKind.wiki, 1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads legacy flat usage.json without channels", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-usage-"));
    const file = path.join(dir, "usage.json");
    try {
      fs.writeFileSync(
        file,
        JSON.stringify({ total: 3, item: 2, wiki: 1 }, null, 2),
        "utf8",
      );
      const report = new UsageStore(file).getReport();
      assert.equal(report.total, 3);
      assert.equal(report.byKind.item, 2);
      assert.deepEqual(report.channels, []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("parseEqlCommand stats", () => {
  it("parses stats and usage aliases", () => {
    assert.deepEqual(parseEqlCommand("!eqlwiki stats", "!eqlwiki"), {
      kind: "stats",
    });
    assert.deepEqual(parseEqlCommand("!eqlwiki usage", "!eqlwiki"), {
      kind: "stats",
    });
  });
});

describe("magelo and roster usage kinds", () => {
  it("bumps magelo/roster and total", () => {
    let counts = emptyCounts();
    counts = incrementCounts(counts, "magelo");
    counts = incrementCounts(counts, "roster");
    assert.equal(counts.magelo, 1);
    assert.equal(counts.roster, 1);
    assert.equal(counts.total, 2);
  });

  it("includes magelo and roster in stats output", () => {
    const counts = {
      ...emptyCounts(),
      total: 3,
      magelo: 2,
      roster: 1,
    };
    const out = formatUsageStats(counts);
    assert.match(out, /magelo: 2/);
    assert.match(out, /roster: 1/);
  });
});
