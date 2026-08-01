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
 * Build `Name — summary | url`, preferring the URL when truncating.
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

  const suffix = url ? ` | ${url}` : "";
  const prefix = summary ? `${name} — ${summary}` : name;
  const full = `${prefix}${suffix}`;
  if (full.length <= limit) return full;

  const bodyBudget = Math.max(0, limit - suffix.length);
  if (bodyBudget <= 1) return clampChat(url || name, limit);

  const body = clampChat(prefix, bodyBudget);
  return `${body}${suffix}`;
}

export function formatAmbiguousChat(
  query: string,
  suggestions: string[],
  limit = TWITCH_MSG_LIMIT,
): string {
  const list = suggestions
    .slice(0, 5)
    .map((t) => flattenWikiText(t))
    .filter(Boolean)
    .join(", ");
  return clampChat(
    list
      ? `Multiple EQLwiki matches for "${flattenWikiText(query)}": ${list}`
      : `Multiple EQLwiki matches for "${flattenWikiText(query)}". Try a more specific name.`,
    limit,
  );
}

export const HELP_TEXT = clampChat(
  "EQLwiki: !eql item|mob|zone|spell|faction <name> — or !eql <query> for a general lookup",
);
