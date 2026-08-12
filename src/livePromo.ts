import type { Client } from "tmi.js";
import { fetchLiveLogins, type HelixCredentials } from "./twitchHelix.js";

export type LivePromoOptions = {
  client: Client;
  getChannels: () => string[];
  credentials: HelixCredentials;
  intervalMs: number;
  /** Tips to rotate through (one tip per tick, same tip in all live channels). */
  messages: string[];
  /** Delay between outbound says when multiple channels are live. */
  sayGapMs?: number;
};

/** Pick the tip for this tick (shared across all live channels). */
export function selectPromoMessage(messages: string[], tickIndex: number): string {
  if (messages.length === 0) {
    throw new Error("Live promo requires at least one message");
  }
  return messages[tickIndex % messages.length]!;
}

/**
 * Periodically announce in channels that are currently live.
 * Rotates through `messages` one tip per interval tick.
 * Returns a stop function for graceful shutdown.
 */
export function startLivePromo(opts: LivePromoOptions): () => void {
  const sayGapMs = opts.sayGapMs ?? 750;
  const messages = opts.messages.map((m) => m.trim()).filter(Boolean);
  if (messages.length === 0) {
    throw new Error("Live promo requires at least one message");
  }

  let running = false;
  let stopped = false;
  let tickIndex = 0;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const channels = opts.getChannels();
      if (channels.length === 0) return;

      const live = await fetchLiveLogins(opts.credentials, channels);
      if (live.size === 0) {
        console.log("Live promo: no joined channels currently live");
        return;
      }

      const message = selectPromoMessage(messages, tickIndex);
      tickIndex += 1;

      const targets = channels.filter((c) => live.has(c));
      console.log(
        `Live promo: announcing in ${targets.length} live channel(s): ${targets
          .map((c) => `#${c}`)
          .join(", ")}`,
      );

      for (const login of targets) {
        if (stopped) break;
        try {
          await opts.client.say(`#${login}`, message);
        } catch (err) {
          console.error(`Live promo: failed to say in #${login}:`, err);
        }
        if (sayGapMs > 0) {
          await sleep(sayGapMs);
        }
      }
    } catch (err) {
      console.error("Live promo tick failed:", err);
    } finally {
      running = false;
    }
  };

  console.log(
    `Live promo enabled — ${messages.length} tip(s), every ${Math.round(opts.intervalMs / 1000)}s while channels are live`,
  );
  const timer = setInterval(() => void tick(), opts.intervalMs);
  // First pass after a short delay so IRC is settled.
  const first = setTimeout(() => void tick(), Math.min(30_000, opts.intervalMs));

  return () => {
    stopped = true;
    clearInterval(timer);
    clearTimeout(first);
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
