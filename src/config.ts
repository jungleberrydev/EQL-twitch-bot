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

/** Bootstrap channels from env (merged into durable channels.json on boot). */
const bootstrapChannels = parseChannels("TWITCH_CHANNELS");

const dataDir = optional("DATA_DIR") ?? "./data";

const twitchClientId = optional("TWITCH_CLIENT_ID") ?? "";
const twitchClientSecret = optional("TWITCH_CLIENT_SECRET") ?? "";
const installRedirectUri =
  optional("TWITCH_INSTALL_REDIRECT_URI") ??
  "https://norrathroster.com/api/twitch-bot/oauth/callback";
const installResultUrl =
  optional("TWITCH_INSTALL_RESULT_URL") ??
  "https://norrathroster.com/twitch-bot";
const installHttpPort = Number(process.env.JOIN_API_PORT || 3911);

/** Hourly by default; disable with PROMO_ENABLED=false. */
const promoIntervalMs = Number(process.env.PROMO_INTERVAL_MS || 3_600_000);
const promoEnabledEnv = optional("PROMO_ENABLED");
const promoHasCreds = Boolean(twitchClientId && twitchClientSecret);
const promoEnabled =
  promoHasCreds &&
  (promoEnabledEnv === undefined
    ? true
    : !["0", "false", "no", "off"].includes(promoEnabledEnv.toLowerCase()));

export const config = {
  username: required("TWITCH_USERNAME").toLowerCase(),
  oauthToken: normalizeOauthToken(required("TWITCH_OAUTH_TOKEN")),
  /** Env seed list — durable list lives in channelsFile. */
  bootstrapChannels,
  /**
   * Chat command prefix. Default `!eqlwiki` so messages look like
   * `!eqlwiki item SoulFire` or `!eqlwiki SoulFire`.
   */
  prefix: (optional("TWITCH_PREFIX") ?? "!eqlwiki").toLowerCase(),
  /** Minimum ms between bot replies in the same channel. */
  cooldownMs: Number(process.env.TWITCH_COOLDOWN_MS || 2500),
  /** Directory for durable bot data (mounted volume in Docker). */
  dataDir,
  /** JSON file for !eqlwiki command usage counters. */
  usageDbPath: optional("USAGE_DB_PATH") ?? path.join(dataDir, "usage.json"),
  /** Durable channel list (self-serve installs append here). */
  channelsFile:
    optional("CHANNELS_FILE") ?? path.join(dataDir, "channels.json"),
  installHttp: {
    enabled: Boolean(twitchClientId && twitchClientSecret),
    port: installHttpPort,
    clientId: twitchClientId,
    clientSecret: twitchClientSecret,
    redirectUri: installRedirectUri,
    resultUrl: installResultUrl,
  },
  /**
   * Hourly rotating tips in live channels (roster + bot intro by default).
   * Needs TWITCH_CLIENT_ID / SECRET (same as self-serve install).
   * PROMO_MESSAGE replaces the default rotation with a single tip.
   */
  promo: {
    enabled: promoEnabled,
    intervalMs: promoIntervalMs,
    message: optional("PROMO_MESSAGE"),
  },
};
