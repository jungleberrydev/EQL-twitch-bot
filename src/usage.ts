import fs from "node:fs";
import path from "node:path";
import { TWITCH_MSG_LIMIT, clampChat } from "./format.js";
import { normalizeLogin } from "./channels.js";

export const USAGE_KINDS = [
  "item",
  "mob",
  "zone",
  "spell",
  "faction",
  "wiki",
  "help",
  "magelo",
  "roster",
  "unknown",
] as const;

export type UsageKind = (typeof USAGE_KINDS)[number];

export type UsageCounts = Record<UsageKind, number> & { total: number };

export type ChannelUsageRow = {
  channel: string;
  total: number;
  lastUsedAt: number | null;
  byKind: Record<UsageKind, number>;
};

/** Admin / HTTP snapshot of global + per-channel usage. */
export type UsageReport = {
  total: number;
  byKind: Record<UsageKind, number>;
  channels: ChannelUsageRow[];
};

type ChannelCounts = UsageCounts & { lastUsedAt: number | null };

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
    magelo: 0,
    roster: 0,
    unknown: 0,
    total: 0,
  };
}

function emptyChannelCounts(): ChannelCounts {
  return { ...emptyCounts(), lastUsedAt: null };
}

function byKindFromCounts(counts: UsageCounts): Record<UsageKind, number> {
  const out = {} as Record<UsageKind, number>;
  for (const kind of USAGE_KINDS) {
    out[kind] = counts[kind] ?? 0;
  }
  return out;
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
 * Example: `EQLwiki usage — total: 42 | item: 10 | mob: 5 | …`
 */
export function formatUsageStats(
  counts: UsageCounts,
  limit = TWITCH_MSG_LIMIT,
): string {
  // Omit unknown when zero to keep the chat reply short.
  const kinds = USAGE_KINDS.filter(
    (k) => k !== "unknown" || (counts.unknown ?? 0) > 0,
  );
  const parts = kinds.map((k) => `${k}: ${counts[k] ?? 0}`);
  // Lead with total (every handled command increments it), then per-type breakdown.
  const body = `EQLwiki usage — total: ${counts.total ?? 0} | ${parts.join(" | ")}`;
  return clampChat(body, limit);
}

function normalizeCounts(raw: unknown): UsageCounts {
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

function normalizeChannelEntry(raw: unknown): ChannelCounts {
  const base = emptyChannelCounts();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const counts = normalizeCounts(obj);
  Object.assign(base, counts);
  const last = obj.lastUsedAt;
  if (typeof last === "number" && Number.isFinite(last) && last > 0) {
    base.lastUsedAt = Math.floor(last);
  }
  return base;
}

function normalizeChannels(
  raw: unknown,
): Map<string, ChannelCounts> {
  const out = new Map<string, ChannelCounts>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const login = normalizeLogin(key);
    if (!login) continue;
    out.set(login, normalizeChannelEntry(value));
  }
  return out;
}

/** File-backed usage counters (JSON). Safe for this tiny scale. */
export class UsageStore {
  private counts: UsageCounts;
  private channels: Map<string, ChannelCounts>;
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    const loaded = this.load();
    this.counts = loaded.counts;
    this.channels = loaded.channels;
  }

  getCounts(): UsageCounts {
    return { ...this.counts };
  }

  /** Global totals plus per-channel rows sorted by total (desc), then login. */
  getReport(): UsageReport {
    const channels: ChannelUsageRow[] = [...this.channels.entries()]
      .map(([channel, row]) => ({
        channel,
        total: row.total ?? 0,
        lastUsedAt: row.lastUsedAt,
        byKind: byKindFromCounts(row),
      }))
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        return a.channel.localeCompare(b.channel);
      });

    return {
      total: this.counts.total ?? 0,
      byKind: byKindFromCounts(this.counts),
      channels,
    };
  }

  increment(kind: UsageKind, channel?: string): UsageCounts {
    this.counts = incrementCounts(this.counts, kind);
    const login = channel ? normalizeLogin(channel) : "";
    if (login) {
      const prev = this.channels.get(login) ?? emptyChannelCounts();
      const next: ChannelCounts = {
        ...incrementCounts(prev, kind),
        lastUsedAt: Date.now(),
      };
      this.channels.set(login, next);
    }
    this.save();
    return this.getCounts();
  }

  private load(): { counts: UsageCounts; channels: Map<string, ChannelCounts> } {
    try {
      if (!fs.existsSync(this.filePath)) {
        return { counts: emptyCounts(), channels: new Map() };
      }
      const text = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object") {
        return { counts: emptyCounts(), channels: new Map() };
      }
      const obj = parsed as Record<string, unknown>;
      return {
        counts: normalizeCounts(obj),
        channels: normalizeChannels(obj.channels),
      };
    } catch (err) {
      console.error(`Failed to load usage stats from ${this.filePath}:`, err);
      return { counts: emptyCounts(), channels: new Map() };
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const channelsObj: Record<string, ChannelCounts> = {};
      for (const login of [...this.channels.keys()].sort()) {
        channelsObj[login] = this.channels.get(login)!;
      }
      const payload = {
        ...this.counts,
        channels: channelsObj,
      };
      const tmp = `${this.filePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
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
