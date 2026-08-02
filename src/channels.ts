import fs from "node:fs";
import path from "node:path";

/** Normalize a Twitch login (strip #, lowercase). */
export function normalizeLogin(raw: string): string {
  return raw.trim().replace(/^#/, "").toLowerCase();
}

export function loadChannels(filePath: string): string[] {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const login = normalizeLogin(item);
      if (!login || seen.has(login)) continue;
      seen.add(login);
      out.push(login);
    }
    return out;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw err;
  }
}

export function saveChannels(filePath: string, channels: string[]): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const normalized = [
    ...new Set(channels.map(normalizeLogin).filter(Boolean)),
  ].sort();
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, filePath);
}

/**
 * Merge bootstrap env channels into the durable list. Returns the full list
 * and whether the file was written (new channels from env).
 */
export function ensureChannelsFile(
  filePath: string,
  bootstrap: string[],
): { channels: string[]; wrote: boolean } {
  const fromFile = loadChannels(filePath);
  const seen = new Set(fromFile);
  let wrote = false;
  const merged = [...fromFile];
  for (const login of bootstrap.map(normalizeLogin).filter(Boolean)) {
    if (seen.has(login)) continue;
    seen.add(login);
    merged.push(login);
    wrote = true;
  }
  if (wrote || !fs.existsSync(filePath)) {
    saveChannels(filePath, merged);
    wrote = true;
  }
  return { channels: loadChannels(filePath), wrote };
}

export class ChannelStore {
  private channels: Set<string>;

  constructor(
    private readonly filePath: string,
    initial: string[],
  ) {
    this.channels = new Set(initial.map(normalizeLogin).filter(Boolean));
  }

  list(): string[] {
    return [...this.channels].sort();
  }

  has(login: string): boolean {
    return this.channels.has(normalizeLogin(login));
  }

  /** Persist and return true if newly added. */
  add(login: string): boolean {
    const normalized = normalizeLogin(login);
    if (!normalized) throw new Error("Invalid channel login");
    if (this.channels.has(normalized)) return false;
    this.channels.add(normalized);
    saveChannels(this.filePath, this.list());
    return true;
  }

  /** Persist and return true if removed. */
  remove(login: string): boolean {
    const normalized = normalizeLogin(login);
    if (!this.channels.has(normalized)) return false;
    this.channels.delete(normalized);
    saveChannels(this.filePath, this.list());
    return true;
  }
}
