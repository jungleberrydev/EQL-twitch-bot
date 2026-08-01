/** Twitch chat hard limit; leave a little headroom. */
export const TWITCH_MSG_LIMIT = 480;

/** Collapse wiki / Discord markdown into a single chat-safe line. */
export function flattenWikiText(text: string): string {
  return text
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/[*_`~]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function clampChat(message: string, limit = TWITCH_MSG_LIMIT): string {
  if (message.length <= limit) return message;
  if (limit <= 1) return "…";
  return `${message.slice(0, limit - 1)}…`;
}

/**
 * Build `Name: url — summary` so the wiki link sits early and stays
 * clickable when the summary must be truncated.
 */
export function formatLookupReply(opts: {
  name: string;
  description: string;
  pageUrl: string;
  limit?: number;
}): string {
  const limit = opts.limit ?? TWITCH_MSG_LIMIT;
  const name = flattenWikiText(opts.name) || "EQLwiki";
  const summary = flattenWikiText(opts.description);
  const url = opts.pageUrl.trim();

  if (!url) {
    const body = summary ? `${name} — ${summary}` : name;
    return clampChat(body, limit);
  }

  const head = `${name}: ${url}`;
  if (!summary) return preferUrl(head, url, limit);

  const sep = " — ";
  const full = `${head}${sep}${summary}`;
  if (full.length <= limit) return full;

  // Prefer keeping the full URL; truncate summary only.
  const summaryBudget = limit - head.length - sep.length;
  if (summaryBudget <= 1) return preferUrl(head, url, limit);

  return `${head}${sep}${clampChat(summary, summaryBudget)}`;
}

/** Keep an intact URL when the name+url head itself exceeds the limit. */
function preferUrl(head: string, url: string, limit: number): string {
  if (head.length <= limit) return head;
  if (url.length <= limit) return url;
  return clampChat(url, limit);
}

export function formatAmbiguousChat(
  query: string,
  suggestions: string[],
  limit = TWITCH_MSG_LIMIT,
  source = "EQLwiki",
): string {
  const list = suggestions
    .slice(0, 5)
    .map((t) => flattenWikiText(t))
    .filter(Boolean)
    .join(", ");
  return clampChat(
    list
      ? `Multiple ${source} matches for "${flattenWikiText(query)}": ${list}`
      : `Multiple ${source} matches for "${flattenWikiText(query)}". Try a more specific name.`,
    limit,
  );
}

export const HELP_TEXT = clampChat(
  "EQLwiki: !eql item|mob|zone|spell|faction <name> — or !eql <query>. Sheets: !roster <name> <server> (or !magelo)",
);

/** Shared reply for bare !magelo / !roster. */
export const ROSTER_LINK_REPLY =
  "Character sheets: https://norrathroster.com — lookup: !roster <name> <server>";

export function formatRosterUsage(command: "magelo" | "roster"): string {
  return clampChat(
    `Usage: !${command} <name> <server> — or !${command} alone for https://norrathroster.com`,
  );
}

export function formatRosterNotFound(
  name: string,
  serverName: string,
): string {
  return clampChat(
    `No Norrath Roster sheet for ${flattenWikiText(name)} on ${flattenWikiText(serverName)}.`,
  );
}

export function formatRosterInvalidServer(serverInput: string): string {
  return clampChat(
    `Unknown server "${flattenWikiText(serverInput)}". Try: qeynos, freeport, oggok, neriak, rivervale, halas, erudin, paineel`,
  );
}