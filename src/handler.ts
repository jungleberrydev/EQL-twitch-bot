import {
  lookupFaction,
  lookupItem,
  lookupMob,
  lookupSpell,
  lookupWikiPage,
  lookupZone,
} from "./eqlwiki.js";
import {
  HELP_TEXT,
  ROSTER_LINK_REPLY,
  formatAmbiguousChat,
  formatGuildMemberSummary,
  formatLookupReply,
  formatRosterGuildNotFound,
  formatRosterGuildUsage,
  formatRosterInvalidServer,
  formatRosterNotFound,
  formatRosterUsage,
} from "./format.js";
import {
  characterSheetUrl,
  guildPageUrl,
  lookupCharacter,
  lookupGuild,
  resolveServer,
} from "./norrathroster.js";
import {
  UsageStore,
  emptyCounts,
  formatUsageStats,
  usageKindFromType,
  type UsageKind,
} from "./usage.js";

const TYPED = new Set([
  "item",
  "mob",
  "npc",
  "zone",
  "spell",
  "faction",
  "wiki",
  "help",
  "commands",
  "stats",
  "usage",
]);

/** Standalone chat triggers that share the Norrath Roster link reply. */
export const ROSTER_LINK_COMMANDS = ["magelo", "roster"] as const;
export type RosterLinkCommand = (typeof ROSTER_LINK_COMMANDS)[number];

export type ParsedEqlCommand =
  | { kind: "help" }
  | { kind: "stats" }
  | { kind: "typed"; type: string; query: string }
  | { kind: "wiki"; query: string }
  | null;

export type HandleEqlOptions = {
  usage?: UsageStore;
  /** Twitch channel login (with or without #) for per-channel usage. */
  channel?: string;
  /** Broadcaster or mod — required for !eqlwiki stats. */
  isPrivileged?: boolean;
};

export type ParsedRosterLinkCommand =
  | { kind: RosterLinkCommand; lookup: null }
  | { kind: RosterLinkCommand; lookup: "incomplete" }
  | { kind: RosterLinkCommand; lookup: "incomplete_guild" }
  | {
      kind: RosterLinkCommand;
      lookup: { target: "character" | "guild"; name: string; server: string };
    };

/**
 * Parse standalone `!magelo` / `!roster` (case-insensitive).
 * With args: `!roster <name> <server>` or `!roster guild <name> <server>`
 * (server is the last token).
 */
export function parseRosterLinkCommand(
  message: string,
): ParsedRosterLinkCommand | null {
  const trimmed = message.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  for (const cmd of ROSTER_LINK_COMMANDS) {
    const bang = `!${cmd}`;
    if (lower === bang) return { kind: cmd, lookup: null };
    if (lower.startsWith(`${bang} `) || lower.startsWith(`${bang}\t`)) {
      const rest = trimmed.slice(bang.length).trim();
      if (!rest) return { kind: cmd, lookup: null };
      const parts = rest.split(/\s+/).filter(Boolean);
      const first = parts[0]?.toLowerCase();
      if (first === "guild") {
        const guildParts = parts.slice(1);
        if (guildParts.length < 2) {
          return { kind: cmd, lookup: "incomplete_guild" };
        }
        const server = guildParts[guildParts.length - 1]!;
        const name = guildParts.slice(0, -1).join(" ");
        return { kind: cmd, lookup: { target: "guild", name, server } };
      }
      if (parts.length < 2) {
        return { kind: cmd, lookup: "incomplete" };
      }
      const server = parts[parts.length - 1]!;
      const name = parts.slice(0, -1).join(" ");
      return { kind: cmd, lookup: { target: "character", name, server } };
    }
  }
  return null;
}

/** Handle `!magelo` / `!roster`; returns a chat reply or null if ignored. */
export async function handleRosterLinkCommand(
  message: string,
  opts: { usage?: UsageStore; channel?: string } = {},
): Promise<string | null> {
  const parsed = parseRosterLinkCommand(message);
  if (!parsed) return null;
  recordUsage(opts.usage, parsed.kind, opts.channel);

  if (parsed.lookup === null) {
    return ROSTER_LINK_REPLY;
  }
  if (parsed.lookup === "incomplete") {
    return formatRosterUsage(parsed.kind);
  }
  if (parsed.lookup === "incomplete_guild") {
    return formatRosterGuildUsage(parsed.kind);
  }

  const { target, name, server } = parsed.lookup;
  try {
    if (target === "guild") {
      const result = await lookupGuild(name, server);
      if (!result.ok) {
        if (result.reason === "invalid_server") {
          return formatRosterInvalidServer(server);
        }
        if (result.reason === "ambiguous" && result.suggestions?.length) {
          return formatAmbiguousChat(name, result.suggestions, undefined, "roster");
        }
        const known = resolveServer(server);
        return formatRosterGuildNotFound(name, known?.name ?? server);
      }

      const guild = result.guild;
      return formatLookupReply({
        name: `${guild.name} (${guild.serverName})`,
        description: formatGuildMemberSummary(guild.memberCount),
        pageUrl: guildPageUrl(guild.server, guild.name),
      });
    }

    const result = await lookupCharacter(name, server);
    if (!result.ok) {
      if (result.reason === "invalid_server") {
        return formatRosterInvalidServer(server);
      }
      if (result.reason === "ambiguous" && result.suggestions?.length) {
        return formatAmbiguousChat(name, result.suggestions, undefined, "roster");
      }
      const known = resolveServer(server);
      return formatRosterNotFound(name, known?.name ?? server);
    }

    const sheet = result.character;
    return formatLookupReply({
      name: `${sheet.name} (${sheet.serverName})`,
      description: sheet.classSummary,
      pageUrl: characterSheetUrl(sheet.id),
    });
  } catch (err) {
    console.error("Norrath Roster lookup failed:", err);
    return "Failed to reach Norrath Roster. Try again in a moment.";
  }
}

/**
 * Parse a chat message against the bot prefix.
 * Examples (prefix `!eqlwiki`):
 *   !eqlwiki help
 *   !eqlwiki item SoulFire
 *   !eqlwiki SoulFire
 *   !eqlwiki stats
 */
export function parseEqlCommand(
  message: string,
  prefix: string,
): ParsedEqlCommand {
  const trimmed = message.trim();
  const p = prefix.trim().toLowerCase();
  if (!p) return null;

  const lower = trimmed.toLowerCase();
  if (lower === p || lower === `${p} help` || lower === `${p} commands`) {
    return { kind: "help" };
  }
  if (lower === `${p} stats` || lower === `${p} usage`) {
    return { kind: "stats" };
  }

  if (!lower.startsWith(`${p} `) && !lower.startsWith(`${p}\t`)) {
    return null;
  }

  const rest = trimmed.slice(p.length).trim();
  if (!rest) return { kind: "help" };

  const space = rest.search(/\s/);
  const first = (space === -1 ? rest : rest.slice(0, space)).toLowerCase();
  const remainder = space === -1 ? "" : rest.slice(space).trim();

  if (first === "help" || first === "commands") {
    return { kind: "help" };
  }

  if (first === "stats" || first === "usage") {
    return { kind: "stats" };
  }

  if (TYPED.has(first)) {
    if (!remainder) {
      return { kind: "help" };
    }
    const type = first === "npc" ? "mob" : first;
    return { kind: "typed", type, query: remainder };
  }

  return { kind: "wiki", query: rest };
}

function recordUsage(
  usage: UsageStore | undefined,
  kind: UsageKind,
  channel?: string,
): void {
  if (!usage) return;
  try {
    usage.increment(kind, channel);
  } catch (err) {
    console.error("Failed to record usage:", err);
  }
}

async function runTypedLookup(type: string, query: string): Promise<string> {
  switch (type) {
    case "item": {
      const result = await lookupItem(query);
      if (!result.ok) {
        if (result.reason === "ambiguous" && result.suggestions?.length) {
          return formatAmbiguousChat(query, result.suggestions);
        }
        if (result.reason === "not_item") {
          return `Found ${result.suggestions?.[0] ?? query} on EQLwiki, but it is not an item. Try !eqlwiki wiki or !eqlwiki mob / !eqlwiki zone.`;
        }
        return `No EQLwiki item found for ${query}.`;
      }
      return formatLookupReply({
        name: result.item.name,
        description:
          result.item.statsblock || "No statsblock on this item page.",
        pageUrl: result.item.pageUrl,
      });
    }
    case "mob": {
      const result = await lookupMob(query);
      if (!result.ok) {
        if (result.reason === "ambiguous" && result.suggestions?.length) {
          return formatAmbiguousChat(query, result.suggestions);
        }
        if (result.reason === "not_mob") {
          return `Found ${result.suggestions?.[0] ?? query}, but it is not an NPC/mob page. Try !eqlwiki wiki or !eqlwiki item.`;
        }
        return `No EQLwiki mob found for ${query}.`;
      }
      return formatLookupReply({
        name: result.page.name,
        description: result.page.description,
        pageUrl: result.page.pageUrl,
      });
    }
    case "zone": {
      const result = await lookupZone(query);
      if (!result.ok) {
        if (result.reason === "ambiguous" && result.suggestions?.length) {
          return formatAmbiguousChat(query, result.suggestions);
        }
        if (result.reason === "not_zone") {
          return `Found ${result.suggestions?.[0] ?? query}, but it is not a zone page. Try !eqlwiki wiki.`;
        }
        return `No EQLwiki zone found for ${query}.`;
      }
      return formatLookupReply({
        name: result.page.name,
        description: result.page.description,
        pageUrl: result.page.pageUrl,
      });
    }
    case "spell": {
      const result = await lookupSpell(query);
      if (!result.ok) {
        if (result.reason === "ambiguous" && result.suggestions?.length) {
          return formatAmbiguousChat(query, result.suggestions);
        }
        if (result.reason === "not_spell") {
          return `Found ${result.suggestions?.[0] ?? query}, but it is not a spell page. Try !eqlwiki wiki.`;
        }
        return `No EQLwiki spell found for ${query}.`;
      }
      return formatLookupReply({
        name: result.page.name,
        description: result.page.description,
        pageUrl: result.page.pageUrl,
      });
    }
    case "faction": {
      const result = await lookupFaction(query);
      if (!result.ok) {
        if (result.reason === "ambiguous" && result.suggestions?.length) {
          return formatAmbiguousChat(query, result.suggestions);
        }
        if (result.reason === "not_faction") {
          return `Found ${result.suggestions?.[0] ?? query}, but it is not a faction page. Try !eqlwiki wiki.`;
        }
        return `No EQLwiki faction found for ${query}.`;
      }
      return formatLookupReply({
        name: result.page.name,
        description: result.page.description,
        pageUrl: result.page.pageUrl,
      });
    }
    case "wiki":
    default: {
      const result = await lookupWikiPage(query);
      if (!result.ok) {
        if (result.reason === "ambiguous" && result.suggestions?.length) {
          return formatAmbiguousChat(query, result.suggestions);
        }
        return `No EQLwiki page found for ${query}.`;
      }
      return formatLookupReply({
        name: result.page.name,
        description: result.page.description,
        pageUrl: result.page.pageUrl,
      });
    }
  }
}

/** Handle a parsed command; returns a chat reply or null if ignored. */
export async function handleEqlCommand(
  message: string,
  prefix: string,
  opts: HandleEqlOptions = {},
): Promise<string | null> {
  const parsed = parseEqlCommand(message, prefix);
  if (!parsed) return null;

  if (parsed.kind === "stats") {
    if (!opts.isPrivileged) {
      return "Only the broadcaster or mods can use !eqlwiki stats.";
    }
    const counts = opts.usage?.getCounts() ?? emptyCounts();
    return formatUsageStats(counts);
  }

  if (parsed.kind === "help") {
    recordUsage(opts.usage, "help", opts.channel);
    return HELP_TEXT;
  }

  try {
    if (parsed.kind === "typed") {
      recordUsage(opts.usage, usageKindFromType(parsed.type), opts.channel);
      return await runTypedLookup(parsed.type, parsed.query);
    }
    recordUsage(opts.usage, "wiki", opts.channel);
    return await runTypedLookup("wiki", parsed.query);
  } catch (err) {
    console.error("EQLwiki lookup failed:", err);
    return "Failed to reach EQLwiki. Try again in a moment.";
  }
}
