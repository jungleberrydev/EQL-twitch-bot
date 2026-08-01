import fs from "node:fs";
import path from "node:path";
import { TWITCH_MSG_LIMIT, clampChat } from "./format.js";

export const USAGE_KINDS = [
  "item",
  "mob",
  "zone",
  "spell",
  "faction",
  "wiki",
  "help",
  "unknown",
] as const;

export type UsageKind = (typeof USAGE_KINDS)[number];

export type UsageCounts = Record<UsageKind, number> & { total: number };

const KIND_SET = new Set<string>(USAGE_KINDS);

export function emptyCounts(): UsageCounts {
  return {
    item: 0,
    mob: 0,
    zone: 0,
    spell: 0,
    faction: 0,
    wiki: 0,
    help: 0,
    unknown: 0,
    total: 0,
  };
}

/** Pure increment — returns a new counts object. */
export function incrementCounts(
  counts: UsageCounts,
  kind: UsageKind,
): UsageCounts {
  return {
    ...counts,
    [kind]: (counts[kind] ?? 0) + 1,
    total: (counts.total ?? 0) + 1,
  };
}

/** Map a parsed command type string to a usage kind. */
export function usageKindFromType(type: string): UsageKind {
  return KIND_SET.has(type) ? (type as UsageKind) : "unknown";
}

/**
 * Short Twitch-safe summary of command usage.
 * Example: `EQLwiki usage — total 42 | item 10 | mob 5 | …`
 */
export function formatUsageStats(
  counts: UsageCounts,
  limit = TWITCH_MSG_LIMIT,
): string {
  // Omit unknown when zero to keep the chat reply short.
  const kinds = USAGE_KINDS.filter(
    (k) => k !== "unknown" || (counts.unknown ?? 0) > 0,
  );
  const parts = kinds.map((k) => `${k} ${counts[k] ?? 0}`);
  const body = `EQLwiki usage — total ${counts.total ?? 0} | ${parts.join(" | ")}`;
  return clampChat(body, limit);
}

function normalizeLoaded(raw: unknown): UsageCounts {
  const base = emptyCounts();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  for (const key of [...USAGE_KINDS, "total"] as const) {
    const n = obj[key];
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) {
      base[key] = Math.floor(n);
    }
  }
  return base;
}

/** File-backed usage counters (JSON). Safe for this tiny scale. */
export class UsageStore {
  private counts: UsageCounts;
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.counts = this.load();
  }

  getCounts(): UsageCounts {
    return { ...this.counts };
  }

  increment(kind: UsageKind): UsageCounts {
    this.counts = incrementCounts(this.counts, kind);
    this.save();
    return this.getCounts();
  }

  private load(): UsageCounts {
    try {
      if (!fs.existsSync(this.filePath)) return emptyCounts();
      const text = fs.readFileSync(this.filePath, "utf8");
      return normalizeLoaded(JSON.parse(text) as unknown);
    } catch (err) {
      console.error(`Failed to load usage stats from ${this.filePath}:`, err);
      return emptyCounts();
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.filePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(this.counts, null, 2)}\n`, "utf8");
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error(`Failed to save usage stats to ${this.filePath}:`, err);
    }
  }
}

/** Broadcaster or mod via tmi userstate tags. */
export function isChannelPrivileged(
  channel: string,
  tags: {
    mod?: boolean | string;
    badges?: { [key: string]: string | undefined } | null;
    username?: string;
  },
): boolean {
  const login = (tags.username ?? "").toLowerCase();
  const chan = channel.replace(/^#/, "").toLowerCase();
  if (login && login === chan) return true;
  if (tags.badges?.broadcaster != null) return true;
  if (tags.mod === true || tags.mod === "1") return true;
  if (tags.badges?.moderator != null) return true;
  return false;
}
