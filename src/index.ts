import tmi from "tmi.js";
import { config } from "./config.js";
import { ChannelStore, ensureChannelsFile } from "./channels.js";
import {
  handleEqlCommand,
  handleRosterLinkCommand,
} from "./handler.js";
import { startInstallHttp } from "./installHttp.js";
import { UsageStore, isChannelPrivileged } from "./usage.js";

const lastReplyAt = new Map<string, number>();
const usage = new UsageStore(config.usageDbPath);

function onCooldown(channel: string): boolean {
  const now = Date.now();
  const last = lastReplyAt.get(channel) ?? 0;
  return now - last < config.cooldownMs;
}

function markReplied(channel: string): void {
  lastReplyAt.set(channel, Date.now());
}

async function main(): Promise<void> {
  console.log(`Usage stats file: ${config.usageDbPath}`);

  const ensured = ensureChannelsFile(
    config.channelsFile,
    config.bootstrapChannels,
  );
  if (ensured.channels.length === 0) {
    throw new Error(
      "No channels to join — set TWITCH_CHANNELS or add via self-serve install",
    );
  }
  const store = new ChannelStore(config.channelsFile, ensured.channels);
  console.log(`Channels file: ${config.channelsFile} (${store.list().join(", ")})`);

  const client = new tmi.Client({
    options: { skipUpdatingEmotesets: true },
    connection: { reconnect: true, secure: true },
    identity: {
      username: config.username,
      password: config.oauthToken,
    },
    channels: store.list(),
  });

  client.on("connected", (addr, port) => {
    console.log(
      `Connected to ${addr}:${port} as ${config.username}; channels: ${store
        .list()
        .map((c) => `#${c}`)
        .join(", ")}; prefix: ${config.prefix}`,
    );
  });

  client.on("message", (channel, tags, message, self) => {
    if (self) return;
    if (tags.username?.toLowerCase() === config.username) return;

    void (async () => {
      if (onCooldown(channel)) return;

      const reply =
        (await handleRosterLinkCommand(message, { usage })) ??
        (await handleEqlCommand(message, config.prefix, {
          usage,
          isPrivileged: isChannelPrivileged(channel, tags),
        }));
      if (!reply) return;

      if (onCooldown(channel)) return;
      markReplied(channel);

      try {
        await client.say(channel, reply);
      } catch (err) {
        console.error(`Failed to send reply in ${channel}:`, err);
      }
    })();
  });

  let installHttp: { close: () => Promise<void> } | undefined;

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, disconnecting…`);
    try {
      if (installHttp) await installHttp.close();
      await client.disconnect();
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await client.connect();

  if (config.installHttp.enabled) {
    installHttp = startInstallHttp(config.installHttp, store, {
      join: async (login) => {
        const added = store.add(login);
        if (added) {
          await client.join(login);
          console.log(`Joined #${login} (self-serve install)`);
          return "joined";
        }
        // Already in store — still ensure IRC join after reconnect gaps.
        try {
          await client.join(login);
        } catch {
          /* already joined */
        }
        return "already";
      },
      part: async (login) => {
        const removed = store.remove(login);
        try {
          await client.part(login);
        } catch {
          /* not in channel */
        }
        if (removed) {
          console.log(`Left #${login} (self-serve remove)`);
          return "left";
        }
        return "absent";
      },
    });
  } else {
    console.warn(
      "Self-serve install disabled — set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to enable",
    );
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
