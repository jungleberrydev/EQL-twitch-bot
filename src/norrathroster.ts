/** Public Norrath Roster API (https://norrathroster.com). */

export const NORRATH_ROSTER_ORIGIN = "https://norrathroster.com";

const USER_AGENT =
  "eql-twitch-bot/1.0 (Twitch chat; Norrath Roster lookup; contact via bot owner)";

/** Same server keys as norrath-roster `EQ_SERVERS`. */
export const EQ_SERVERS = [
  { key: "qeynos", name: "Qeynos" },
  { key: "freeport", name: "Freeport" },
  { key: "oggok", name: "Oggok" },
  { key: "neriak", name: "Neriak" },
  { key: "rivervale", name: "Rivervale" },
  { key: "halas", name: "Halas" },
  { key: "erudin", name: "Erudin" },
  { key: "paineel", name: "Paineel" },
] as const;

export type EqServer = (typeof EQ_SERVERS)[number];

export type RosterCharacterSummary = {
  id: number;
  name: string;
  server: string;
  serverName: string;
  classSummary: string;
};

export type RosterLookupResult =
  | { ok: true; character: RosterCharacterSummary }
  | {
      ok: false;
      reason: "not_found" | "ambiguous" | "invalid_server";
      suggestions?: string[];
    };

/** Resolve a server key or display name (case-insensitive). */
export function resolveServer(input: string): EqServer | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  return (
    EQ_SERVERS.find((s) => s.key === q || s.name.toLowerCase() === q) ?? null
  );
}

/** First whitespace-separated token — unique per server on Norrath Roster. */
export function characterFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0]!;
}

export function characterSheetUrl(id: number): string {
  return `${NORRATH_ROSTER_ORIGIN}/characters/${id}`;
}

/**
 * Prefer exact full-name matches, else exact first-name matches
 * (case-insensitive). Ignores loose substring hits from the roster search.
 */
export function pickCharacterMatches(
  characters: RosterCharacterSummary[],
  query: string,
): RosterCharacterSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const qFirst = characterFirstName(query).toLowerCase();

  const exactFull = characters.filter(
    (c) => c.name.trim().toLowerCase() === q,
  );
  if (exactFull.length) return exactFull;

  return characters.filter(
    (c) => characterFirstName(c.name).toLowerCase() === qFirst,
  );
}

type ApiCharacter = {
  id?: unknown;
  name?: unknown;
  server?: unknown;
  serverName?: unknown;
  classSummary?: unknown;
};

function mapSummary(raw: ApiCharacter): RosterCharacterSummary | null {
  const id = typeof raw.id === "number" ? raw.id : Number(raw.id);
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const server = typeof raw.server === "string" ? raw.server.trim() : "";
  if (!Number.isFinite(id) || id <= 0 || !name || !server) return null;
  return {
    id,
    name,
    server,
    serverName:
      typeof raw.serverName === "string" && raw.serverName.trim()
        ? raw.serverName.trim()
        : server,
    classSummary:
      typeof raw.classSummary === "string" ? raw.classSummary.trim() : "",
  };
}

/**
 * Look up a public character sheet by name + server via
 * `GET /api/characters?q=&server=`.
 */
export async function lookupCharacter(
  name: string,
  serverInput: string,
): Promise<RosterLookupResult> {
  const server = resolveServer(serverInput);
  if (!server) {
    return { ok: false, reason: "invalid_server" };
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return { ok: false, reason: "not_found" };
  }

  const url = new URL("/api/characters", NORRATH_ROSTER_ORIGIN);
  url.searchParams.set("q", trimmedName);
  url.searchParams.set("server", server.key);

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Norrath Roster API HTTP ${res.status}`);
  }

  const data = (await res.json()) as { characters?: ApiCharacter[] };
  const mapped = (data.characters ?? [])
    .map(mapSummary)
    .filter((c): c is RosterCharacterSummary => c !== null);

  const matches = pickCharacterMatches(mapped, trimmedName);
  if (matches.length === 0) {
    return { ok: false, reason: "not_found" };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      suggestions: matches.slice(0, 5).map((c) => c.name),
    };
  }
  return { ok: true, character: matches[0]! };
}
