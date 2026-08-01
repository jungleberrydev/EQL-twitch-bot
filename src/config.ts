import path from "node:path";
import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function parseChannels(name: string): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean);
}

/** Normalize Twitch IRC oauth password (accepts with or without oauth: prefix). */
function normalizeOauthToken(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().startsWith("oauth:")) return trimmed;
  return `oauth:${trimmed}`;
}

const channels = parseChannels("TWITCH_CHANNELS");
if (channels.length === 0) {
  throw new Error(
    "Missing required env var: TWITCH_CHANNELS (comma-separated login names)",
  );
}

const dataDir = optional("DATA_DIR") ?? "./data";

export const config = {
  username: required("TWITCH_USERNAME").toLowerCase(),
  oauthToken: normalizeOauthToken(required("TWITCH_OAUTH_TOKEN")),
  channels,
  /**
   * Chat command prefix. Default `!eql` so messages look like
   * `!eql item SoulFire` or `!eql SoulFire`.
   */
  prefix: (optional("TWITCH_PREFIX") ?? "!eql").toLowerCase(),
  /** Minimum ms between bot replies in the same channel. */
  cooldownMs: Number(process.env.TWITCH_COOLDOWN_MS || 2500),
  /** Directory for durable bot data (mounted volume in Docker). */
  dataDir,
  /** JSON file for !eql command usage counters. */
  usageDbPath: optional("USAGE_DB_PATH") ?? path.join(dataDir, "usage.json"),
};
