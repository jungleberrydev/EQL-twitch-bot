/** Twitch chat hard limit; leave a little headroom. */
export const TWITCH_MSG_LIMIT = 480;

function markdownLinkRe(): RegExp {
  return /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
}

/** Pull `[Label](url)` pairs from Discord-style wiki markdown. */
export function extractMarkdownLinks(
  text: string,
): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(markdownLinkRe())) {
    const label = match[1]!.trim();
    const url = match[2]!.trim();
    if (!label || !url || seen.has(url)) continue;
    seen.add(url);
    links.push({ label, url });
  }
  return links;
}

/**
 * Links from `Effect:` lines in a cleaned item statsblock
 * (usually spell pages such as Promised Renewal).
 */
export function extractEffectLinks(
  text: string,
): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (!/^\s*Effect:/i.test(line)) continue;
    for (const match of line.matchAll(markdownLinkRe())) {
      const label = match[1]!.trim();
      const url = match[2]!.trim();
      if (!label || !url || seen.has(url)) continue;
      seen.add(url);
      links.push({ label, url });
    }
  }
  return links;
}

/**
 * Collapse wiki / Discord markdown into a single chat-safe line.
 * HTTP markdown links become `Label url` so Twitch can still click them
 * (item Effect: spell pages, mob loot, etc.).
 */
export function flattenWikiText(text: string): string {
  // Preserve link targets before stripping emphasis markers like `_`
  // (wiki URLs often contain underscores: Promised_Renewal).
  const placeholders: string[] = [];
  let out = text
    .replace(/\r\n|\r|\n/g, " ")
    .replace(markdownLinkRe(), (_m, label: string, url: string) => {
      const i = placeholders.length;
      placeholders.push(`${label} ${url}`);
      return `\u0000L${i}\u0000`;
    })
    .replace(/[*_`~]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  out = out.replace(/\u0000L(\d+)\u0000/g, (_m, idx: string) => {
    return placeholders[Number(idx)] ?? "";
  });

  return out.replace(/\s+/g, " ").trim();
}

export function clampChat(message: string, limit = TWITCH_MSG_LIMIT): string {
  if (message.length <= limit) return message;
  if (limit <= 1) return "…";

  let cut = message.slice(0, limit - 1);
  // Avoid leaving a truncated https://… stump in chat.
  const danglingUrl = cut.search(/https?:\/\/\S*$/);
  if (danglingUrl >= 0) {
    cut = cut.slice(0, danglingUrl).trimEnd();
  } else {
    const lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > Math.floor((limit - 1) / 2)) {
      cut = cut.slice(0, lastSpace).trimEnd();
    }
  }
  if (!cut) return "…";
  return `${cut}…`;
}

/**
 * Build `Name: url — summary` so the wiki link sits early and stays
 * clickable when the summary must be truncated.
 *
 * Item `Effect:` spell links are listed right after the primary URL so
 * they stay clickable even when the stats summary is cut short.
 */
export function formatLookupReply(opts: {
  name: string;
  description: string;
  pageUrl: string;
  limit?: number;
}): string {
  const limit = opts.limit ?? TWITCH_MSG_LIMIT;
  const name = flattenWikiText(opts.name) || "EQLwiki";
  const url = opts.pageUrl.trim();
  const effectLinks = extractEffectLinks(opts.description).filter(
    (link) => link.url !== url,
  );

  let summary = flattenWikiText(opts.description);
  // Effect URLs are hoisted into the head — drop duplicates from the body.
  for (const link of effectLinks) {
    summary = summary.replaceAll(` ${link.url}`, "");
  }
  summary = summary.replace(/\s+/g, " ").trim();

  if (!url) {
    const body = summary ? `${name} — ${summary}` : name;
    return clampChat(body, limit);
  }

  const effectHead = effectLinks
    .map((link) => `${flattenWikiText(link.label)}: ${link.url}`)
    .join(" | ");
  const head = effectHead
    ? `${name}: ${url} | ${effectHead}`
    : `${name}: ${url}`;
  if (!summary) return preferUrl(head, url, limit);

  const sep = " — ";
  const full = `${head}${sep}${summary}`;
  if (full.length <= limit) return full;

  // Prefer keeping URLs intact; truncate summary only.
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
  "EQLwiki: !eql item|mob|zone|spell|faction <name> — or !eql <query>. Character sheets: !magelo or !roster",
);

/** Shared reply for !magelo / !roster. */
export const ROSTER_LINK_REPLY =
  "Character sheets: https://norrathroster.com";
