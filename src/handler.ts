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
  formatAmbiguousChat,
  formatLookupReply,
} from "./format.js";

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
]);

export type ParsedEqlCommand =
  | { kind: "help" }
  | { kind: "typed"; type: string; query: string }
  | { kind: "wiki"; query: string }
  | null;

/**
 * Parse a chat message against the bot prefix.
 * Examples (prefix `!eql`):
 *   !eql help
 *   !eql item SoulFire
 *   !eql SoulFire
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

  if (TYPED.has(first)) {
    if (!remainder) {
      return { kind: "help" };
    }
    const type = first === "npc" ? "mob" : first;
    return { kind: "typed", type, query: remainder };
  }

  return { kind: "wiki", query: rest };
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
          return `Found ${result.suggestions?.[0] ?? query} on EQLwiki, but it is not an item. Try !eql wiki or !eql mob / !eql zone.`;
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
          return `Found ${result.suggestions?.[0] ?? query}, but it is not an NPC/mob page. Try !eql wiki or !eql item.`;
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
          return `Found ${result.suggestions?.[0] ?? query}, but it is not a zone page. Try !eql wiki.`;
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
          return `Found ${result.suggestions?.[0] ?? query}, but it is not a spell page. Try !eql wiki.`;
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
          return `Found ${result.suggestions?.[0] ?? query}, but it is not a faction page. Try !eql wiki.`;
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
): Promise<string | null> {
  const parsed = parseEqlCommand(message, prefix);
  if (!parsed) return null;

  if (parsed.kind === "help") {
    return HELP_TEXT;
  }

  try {
    if (parsed.kind === "typed") {
      return await runTypedLookup(parsed.type, parsed.query);
    }
    return await runTypedLookup("wiki", parsed.query);
  } catch (err) {
    console.error("EQLwiki lookup failed:", err);
    return "Failed to reach EQLwiki. Try again in a moment.";
  }
}
