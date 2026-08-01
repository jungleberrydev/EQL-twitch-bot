import tmi from "tmi.js";
import { config } from "./config.js";
import { handleEqlCommand } from "./handler.js";

const lastReplyAt = new Map<string, number>();

function onCooldown(channel: string): boolean {
  const now = Date.now();
  const last = lastReplyAt.get(channel) ?? 0;
  return now - last < config.cooldownMs;
}

function markReplied(channel: string): void {
  lastReplyAt.set(channel, Date.now());
}

async function main(): Promise<void> {
  const client = new tmi.Client({
    options: { skipUpdatingEmotesets: true },
    connection: { reconnect: true, secure: true },
    identity: {
      username: config.username,
      password: config.oauthToken,
    },
    channels: config.channels,
  });

  client.on("connected", (addr, port) => {
    console.log(
      `Connected to ${addr}:${port} as ${config.username}; channels: ${config.channels
        .map((c) => `#${c}`)
        .join(", ")}; prefix: ${config.prefix}`,
    );
  });

  client.on("message", (channel, tags, message, self) => {
    if (self) return;
    if (tags.username?.toLowerCase() === config.username) return;

    void (async () => {
      if (onCooldown(channel)) return;

      const reply = await handleEqlCommand(message, config.prefix);
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

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, disconnecting…`);
    try {
      await client.disconnect();
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await client.connect();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
