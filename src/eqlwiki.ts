import { expandWikiAlias } from "./wikiAliases.js";

const API_BASE = "https://eqlwiki.com/api.php";
const SITE_BASE = "https://eqlwiki.com";
const USER_AGENT =
  "eql-twitch-bot/1.0 (Twitch chat; EQLwiki lookup; contact via bot owner)";

/** Discord attachment filename for Lucy / wiki icons (legacy path). */
export const EQ_ICON_ATTACHMENT = "eq_icon.png";

/** Itempage fields that may hold a Lucy icon id (lowercased keys). */
const ITEM_ICON_ID_FIELDS = [
  "lucy_img_id",
  "lucy_img",
  "lucyimgid",
  "lucy_id",
  "icon_id",
  "iconid",
  "item_icon",
  "itemicon",
] as const;

/** Itempage fields that may point at a wiki File: title or filename. */
const ITEM_IMAGE_FILE_FIELDS = [
  "second_image",
  "item_icon_file",
  "icon_file",
  "iconfile",
  "image",
  "imagefilename",
  "img",
] as const;

export type EqItemLookupResult =
  | { ok: true; item: EqItem }
  | {
      ok: false;
      reason: "not_found" | "not_item" | "ambiguous";
      suggestions?: string[];
    };

export type EqWikiLookupResult =
  | { ok: true; page: EqWikiPage }
  | { ok: false; reason: "not_found" | "ambiguous"; suggestions?: string[] };

export type EqPageKind =
  | "item"
  | "spell"
  | "npc"
  | "zone"
  | "faction"
  | "generic";

export interface EqItem {
  name: string;
  pageTitle: string;
  pageUrl: string;
  statsblock: string;
  /** Direct wiki icon URL (works for some icons, e.g. SoulFire). */
  thumbnailUrl: string | null;
  /**
   * Alternate URL when Discord's media proxy returns 0×0 for thumbnailUrl
   * (e.g. Reaper of the Dead / Item_579).
   */
  thumbnailFallbackUrl: string | null;
  /** Optional attachment bytes when AttachFiles is available. */
  thumbnailAttachment: Buffer | null;
  lucyImgId: string | null;
}

export interface EqWikiPage {
  kind: EqPageKind;
  name: string;
  pageTitle: string;
  pageUrl: string;
  description: string;
  thumbnailUrl: string | null;
  thumbnailFallbackUrl: string | null;
  thumbnailAttachment: Buffer | null;
}

export type EqZoneLookupResult =
  | { ok: true; page: EqWikiPage }
  | {
      ok: false;
      reason: "not_found" | "not_zone" | "ambiguous";
      suggestions?: string[];
    };

export type EqMobLookupResult =
  | { ok: true; page: EqWikiPage }
  | {
      ok: false;
      reason: "not_found" | "not_mob" | "ambiguous";
      suggestions?: string[];
    };

export type EqSpellLookupResult =
  | { ok: true; page: EqWikiPage }
  | {
      ok: false;
      reason: "not_found" | "not_spell" | "ambiguous";
      suggestions?: string[];
    };

export type EqFactionLookupResult =
  | { ok: true; page: EqWikiPage }
  | {
      ok: false;
      reason: "not_found" | "not_faction" | "ambiguous";
      suggestions?: string[];
    };

async function wikiFetch(params: Record<string, string>): Promise<unknown> {
  const url = new URL(API_BASE);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`EQLwiki API HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * Fulltext search titles (case-insensitive). Used when OpenSearch misses
 * unusual casing like SOULFIRE / SoUlFiRe.
 */
async function searchTitlesCaseInsensitive(
  query: string,
  limit: number,
): Promise<string[]> {
  const data = (await wikiFetch({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: String(Math.min(Math.max(limit, 1), 25)),
    srnamespace: "0",
    format: "json",
  })) as {
    query?: {
      search?: Array<{ title: string }>;
    };
  };

  return data.query?.search?.map((hit) => hit.title) ?? [];
}

/** OpenSearch titles for autocomplete / ambiguity (with CI fallback). */
export async function searchWikiTitles(
  query: string,
  limit = 10,
): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const capped = Math.min(Math.max(limit, 1), 25);

  const data = (await wikiFetch({
    action: "opensearch",
    search: trimmed,
    limit: String(capped),
    format: "json",
  })) as [string, string[], string[], string[]];

  const openTitles = Array.isArray(data?.[1]) ? data[1] : [];
  if (openTitles.length > 0) return openTitles;

  // OpenSearch is often case-sensitive for non-prefix casing; fall back.
  return searchTitlesCaseInsensitive(trimmed, capped);
}

/** @deprecated Prefer searchWikiTitles — kept for callers that still import it. */
export const searchItemTitles = searchWikiTitles;

function findCaseInsensitiveTitle(
  query: string,
  titles: string[],
): string | undefined {
  const needle = query.toLowerCase();
  return titles.find((t) => t.toLowerCase() === needle);
}

/** Build an EQLwiki page URL from a page title (spaces → underscores). */
export function pageUrlForTitle(title: string): string {
  return `${SITE_BASE}/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

/**
 * Extract the inner body of the first matching {{TemplateName ...}} block.
 * Template name match is case-insensitive.
 */
function extractTemplateBody(
  wikitext: string,
  templateName: string,
): string | null {
  const lower = wikitext.toLowerCase();
  const needle = `{{${templateName.toLowerCase()}`;
  const start = lower.indexOf(needle);
  if (start === -1) return null;

  // Skip past "{{Name" — allow optional whitespace before "|" or newline
  let i = start + 2 + templateName.length;
  while (i < wikitext.length && /[ \t]/.test(wikitext[i]!)) i += 1;

  let depth = 1;
  while (i < wikitext.length && depth > 0) {
    if (wikitext.startsWith("{{", i)) {
      depth += 1;
      i += 2;
      continue;
    }
    if (wikitext.startsWith("}}", i)) {
      depth -= 1;
      if (depth === 0) {
        return wikitext.slice(start + 2 + templateName.length, i);
      }
      i += 2;
      continue;
    }
    i += 1;
  }
  return null;
}

function parseTemplateFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  // Split on |fieldname = at start of a parameter (not nested pipes in links).
  const parts = body.split(/\n\|/);
  // First chunk may be empty or leftover after {{Template
  for (let idx = 0; idx < parts.length; idx++) {
    let part = parts[idx]!;
    if (idx === 0) {
      part = part.replace(/^\s*\|/, "");
    }
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim();
    if (key) fields[key] = value;
  }
  return fields;
}

/** Convert a wiki page title into a Discord markdown link. */
export function wikiPageToMarkdownLink(
  pageTitle: string,
  displayText?: string,
): string {
  const title = pageTitle.trim();
  const label = (displayText ?? title).trim() || title;
  return `[${label}](${pageUrlForTitle(title)})`;
}

/**
 * Wiki `Slot:` tokens → character gear slot keys.
 * Paired slots (EAR/FINGER/WRIST) expand to both numbered keys.
 */
const WIKI_SLOT_TO_KEYS: Record<string, readonly string[]> = {
  EAR: ["ear1", "ear2"],
  FINGER: ["finger1", "finger2"],
  WRIST: ["wrist1", "wrist2"],
  NECK: ["neck"],
  FACE: ["face"],
  HEAD: ["head"],
  ARMS: ["arms"],
  HANDS: ["hands"],
  SHOULDERS: ["shoulders"],
  CHEST: ["chest"],
  BACK: ["back"],
  WAIST: ["waist"],
  LEGS: ["legs"],
  FEET: ["feet"],
  PRIMARY: ["primary"],
  SECONDARY: ["secondary"],
  RANGE: ["range"],
  AMMO: ["ammo"],
};

export type ParsedItemSlots = {
  /** Tokens from the Slot: line, e.g. PRIMARY SECONDARY → ["PRIMARY", "SECONDARY"] */
  wikiTokens: string[];
  /** Allowed gear slot keys (ear1/ear2 for EAR, etc.) */
  slotKeys: string[];
};

/**
 * Parse allowed equip slots from a cleaned Itempage statsblock.
 * Returns null when there is no `Slot:` line.
 */
export function parseItemSlots(statsblock: string): ParsedItemSlots | null {
  let slotValue: string | null = null;
  for (const line of statsblock.split("\n")) {
    const match = /^Slot:\s*(.+)$/i.exec(line.trim());
    if (match) {
      slotValue = match[1]!.trim();
      break;
    }
  }
  if (!slotValue) return null;

  // Drop any leftover markdown links; Slot lines are usually plain tokens.
  const cleaned = slotValue.replace(/\[[^\]]*\]\([^)]*\)/g, " ").trim();
  const tokens = cleaned
    .toUpperCase()
    .split(/[\s,+/]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const wikiTokens: string[] = [];
  const slotKeys = new Set<string>();
  for (const token of tokens) {
    const keys = WIKI_SLOT_TO_KEYS[token];
    if (!keys) continue;
    wikiTokens.push(token);
    for (const key of keys) slotKeys.add(key);
  }

  return {
    wikiTokens: wikiTokens.length > 0 ? wikiTokens : tokens,
    slotKeys: [...slotKeys],
  };
}

/**
 * Parse container capacity from a cleaned Itempage statsblock
 * (`Capacity: N`). Distinct from equip `Slot:` (EAR/HEAD/…).
 * Returns null when missing or not a positive integer.
 */
export function parseItemCapacity(statsblock: string): number | null {
  const match = /Capacity:\s*(\d+)/i.exec(statsblock);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/**
 * Expand `{{SpellHoverLink|Page}}` / `{{SpellHoverLink|Page|Label}}` into
 * wiki links. Named args like `class=Cleric` are ignored (not a display label).
 */
export function expandSpellHoverLinks(raw: string): string {
  return raw.replace(
    /\{\{\s*SpellHoverLink\s*\|\s*([^|{}]+?)(?:\s*\|\s*([^|{}]*?))?\s*\}\}/gi,
    (_m, page: string, second?: string) => {
      const title = page.trim();
      if (!title) return "";
      const label = second?.trim();
      if (label && !label.includes("=")) return `[[${title}|${label}]]`;
      return `[[${title}]]`;
    },
  );
}

/** Convert wiki/HTML fragments into Discord-friendly text. */
export function cleanStatsblock(raw: string): string {
  let text = expandSpellHoverLinks(raw);

  // <br> often already sits before a newline in wikitext — collapse to one break
  text = text.replace(/<br\s*\/?>\s*/gi, "\n");
  text = text.replace(/<\/?[^>]+>/g, "");

  // [[Page|Label]] → [Label](url); [[Page]] → [Page](url)
  text = text.replace(/\[\[([^\]|]+)\|([^\]]*)\]\]/g, (_m, page: string, label: string) =>
    wikiPageToMarkdownLink(page, label),
  );
  text = text.replace(/\[\[([^\]]+)\]\]/g, (_m, page: string) =>
    wikiPageToMarkdownLink(page),
  );

  // External [url label]
  text = text.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/gi, "$1");
  text = text.replace(/\[https?:\/\/[^\]]+\]/gi, "");

  text = text.replace(/'{2,}/g, "");
  text = text.replace(/&nbsp;/gi, " ");
  text = text.replace(/&amp;/gi, "&");
  text = text.replace(/&lt;/gi, "<");
  text = text.replace(/&gt;/gi, ">");
  text = text.replace(/&quot;/gi, '"');

  // Collapse spaces within lines; keep newlines
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

/** Remove {{...}} template blocks (handles nesting). */
function stripTemplates(raw: string): string {
  let text = raw;
  let guard = 0;
  while (guard++ < 50) {
    const start = text.indexOf("{{");
    if (start === -1) break;
    let i = start + 2;
    let depth = 1;
    while (i < text.length && depth > 0) {
      if (text.startsWith("{{", i)) {
        depth += 1;
        i += 2;
        continue;
      }
      if (text.startsWith("}}", i)) {
        depth -= 1;
        i += 2;
        continue;
      }
      i += 1;
    }
    if (depth !== 0) break;
    text = text.slice(0, start) + text.slice(i);
  }
  return text;
}

async function fetchPageWikitext(
  title: string,
): Promise<{ title: string; wikitext: string } | null> {
  const data = (await wikiFetch({
    action: "query",
    titles: title,
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    redirects: "1",
    format: "json",
  })) as {
    query?: {
      pages?: Record<
        string,
        {
          missing?: string;
          title: string;
          revisions?: Array<{
            slots?: { main?: { "*"?: string } };
          }>;
        }
      >;
    };
  };

  const pages = data.query?.pages;
  if (!pages) return null;

  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined) return null;

  const wikitext = page.revisions?.[0]?.slots?.main?.["*"];
  if (!wikitext) return null;

  return { title: page.title, wikitext };
}

async function fetchWikiFileUrl(fileTitle: string): Promise<string | null> {
  let title = fileTitle.trim();
  const fileLink = title.match(/^\[\[\s*((?:File:)?[^|\]]+)/i);
  if (fileLink?.[1]) {
    title = fileLink[1].trim();
  } else {
    // Template fields sometimes include MediaWiki image options without the
    // surrounding [[File:...]] markup.
    title = title.split("|", 1)[0]!.trim();
  }
  if (!title) return null;

  const normalized = /^File:/i.test(title) ? title : `File:${title}`;

  const data = (await wikiFetch({
    action: "query",
    titles: normalized,
    prop: "imageinfo",
    iiprop: "url",
    format: "json",
  })) as {
    query?: {
      pages?: Record<
        string,
        {
          missing?: string;
          imageinfo?: Array<{ url?: string }>;
        }
      >;
    };
  };

  const page = data.query?.pages && Object.values(data.query.pages)[0];
  if (!page || page.missing !== undefined) return null;
  return page.imageinfo?.[0]?.url ?? null;
}

/**
 * Discord's media proxy returns 0×0 for some EQLwiki icons (Item_579 /
 * Reaper of the Dead) while peers like Item_519 (SoulFire) work as direct
 * URLs. wsrv.nl re-encodes broken icons — but only with an *unencoded*
 * `url=` path, and that same proxy breaks SoulFire. Callers should try the
 * direct wiki URL first, then this fallback when Discord reports 0×0.
 */
export function toWsrvThumbnailUrl(wikiUrl: string): string {
  const bare = wikiUrl.replace(/^https?:\/\//i, "");
  return `https://wsrv.nl/?url=${bare}&output=png`;
}

async function fetchImageBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "image/*,*/*" },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function prepareThumbnail(url: string | null): Promise<{
  url: string | null;
  fallbackUrl: string | null;
  attachment: Buffer | null;
}> {
  if (!url) return { url: null, fallbackUrl: null, attachment: null };

  try {
    const bytes = await fetchImageBytes(url);
    if (!bytes) return { url: null, fallbackUrl: null, attachment: null };
    return {
      url,
      fallbackUrl: toWsrvThumbnailUrl(url),
      attachment: null,
    };
  } catch {
    // Never fail the whole lookup because the icon is broken.
    return {
      url,
      fallbackUrl: toWsrvThumbnailUrl(url),
      attachment: null,
    };
  }
}

/** Pull a Lucy-style numeric id out of raw template values. */
function extractLucyImgId(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) return value;

  // item_579.png / Item 579.png / [[File:Item_579.png]]
  const match = value.match(/(?:item[_\s-]?)(\d+)\.png/i) ?? value.match(/\b(\d+)\b/);
  return match?.[1] ?? null;
}

async function fetchItemIconUrl(lucyImgId: string): Promise<string | null> {
  const id = lucyImgId.trim();
  if (!/^\d+$/.test(id)) return null;

  // Try common File title formats (MediaWiki usually normalizes these).
  for (const title of [
    `File:Item_${id}.png`,
    `File:Item ${id}.png`,
    `File:item_${id}.png`,
    `File:item ${id}.png`,
  ]) {
    const url = await fetchWikiFileUrl(title);
    if (url) return url;
  }
  return null;
}

/** Resolve uncommon Lucy fields that contain a file stem instead of an id. */
async function fetchItemIconUrlFromRaw(raw: string): Promise<string | null> {
  let value = raw.trim();
  const fileLink = value.match(/^\[\[\s*((?:File:)?[^|\]]+)/i);
  if (fileLink?.[1]) {
    value = fileLink[1].trim();
  } else {
    value = value.split("|", 1)[0]!.trim();
  }
  if (!value) return null;

  const withoutFilePrefix = value.replace(/^File:/i, "");
  if (!/^[\w .'-]+$/u.test(withoutFilePrefix)) return null;

  const hasExtension = /\.(?:png|gif|jpe?g|webp)$/i.test(withoutFilePrefix);
  const candidates = hasExtension
    ? [value, `File:Item_${withoutFilePrefix}`]
    : [
        `File:Item_${withoutFilePrefix}.png`,
        `File:${withoutFilePrefix}.png`,
      ];

  for (const candidate of candidates) {
    const url = await fetchWikiFileUrl(candidate);
    if (url) return url;
  }
  return null;
}

async function resolveItemThumbnail(
  fields: Record<string, string>,
): Promise<{
  lucyImgId: string | null;
  thumbnailUrl: string | null;
  thumbnailFallbackUrl: string | null;
  thumbnailAttachment: Buffer | null;
}> {
  try {
    let lucyImgId: string | null = null;
    let rawIconValue: string | null = null;
    for (const key of ITEM_ICON_ID_FIELDS) {
      const raw = fields[key];
      if (!raw) continue;
      rawIconValue ??= raw;
      lucyImgId = extractLucyImgId(raw);
      if (lucyImgId) break;
    }

    let thumbnailUrl: string | null = null;
    if (lucyImgId) {
      thumbnailUrl = await fetchItemIconUrl(lucyImgId);
    }

    if (!thumbnailUrl && rawIconValue) {
      thumbnailUrl = await fetchItemIconUrlFromRaw(rawIconValue);
    }

    if (!thumbnailUrl) {
      for (const key of ITEM_IMAGE_FILE_FIELDS) {
        const file = fields[key]?.trim();
        if (!file) continue;
        thumbnailUrl = await fetchWikiFileUrl(file);
        if (thumbnailUrl) break;
      }
    }

    const prepared = await prepareThumbnail(thumbnailUrl);
    return {
      lucyImgId,
      thumbnailUrl: prepared.url,
      thumbnailFallbackUrl: prepared.fallbackUrl,
      thumbnailAttachment: prepared.attachment,
    };
  } catch {
    return {
      lucyImgId: null,
      thumbnailUrl: null,
      thumbnailFallbackUrl: null,
      thumbnailAttachment: null,
    };
  }
}

async function fetchSpellIconUrl(spellicon: string): Promise<string | null> {
  const id = spellicon.trim();
  // Spell icons are numeric or single letters (e.g. G, Q)
  if (!/^[0-9A-Za-z]+$/.test(id)) return null;
  return fetchWikiFileUrl(`File:Spellicon_${id}.png`);
}

type ResolvePageResult =
  | { ok: true; title: string; wikitext: string }
  | { ok: false; reason: "not_found" | "ambiguous"; suggestions?: string[] };

async function resolveWikiPage(query: string): Promise<ResolvePageResult> {
  const trimmed = expandWikiAlias(query);
  if (!trimmed) {
    return { ok: false, reason: "not_found" };
  }

  // Direct title lookup (MediaWiki lowercases after the first letter via
  // redirects=1 for common forms like "soulfire" → Soulfire → SoulFire).
  let page = await fetchPageWikitext(trimmed);

  if (!page) {
    const suggestions = await searchWikiTitles(trimmed, 8);
    const exactCi = findCaseInsensitiveTitle(trimmed, suggestions);
    if (exactCi) {
      page = await fetchPageWikitext(exactCi);
    } else if (suggestions.length === 1) {
      page = await fetchPageWikitext(suggestions[0]!);
    } else if (suggestions.length > 1) {
      return { ok: false, reason: "ambiguous", suggestions };
    } else {
      return { ok: false, reason: "not_found" };
    }
  }

  if (!page) {
    return { ok: false, reason: "not_found" };
  }

  return { ok: true, title: page.title, wikitext: page.wikitext };
}

function itemFieldsFromWikitext(
  pageTitle: string,
  wikitext: string,
): { name: string; fields: Record<string, string>; statsblock: string } | null {
  const body = extractTemplateBody(wikitext, "Itempage");
  if (!body) return null;

  const fields = parseTemplateFields(body);
  return {
    name: (fields.itemname || pageTitle).trim(),
    fields,
    statsblock: cleanStatsblock(fields.statsblock ?? ""),
  };
}

async function itemFromWikitext(
  pageTitle: string,
  wikitext: string,
): Promise<EqItem | null> {
  const parsed = itemFieldsFromWikitext(pageTitle, wikitext);
  if (!parsed) return null;

  const thumb = await resolveItemThumbnail(parsed.fields);
  return {
    name: parsed.name,
    pageTitle,
    pageUrl: pageUrlForTitle(pageTitle),
    statsblock: parsed.statsblock,
    thumbnailUrl: thumb.thumbnailUrl,
    thumbnailFallbackUrl: thumb.thumbnailFallbackUrl,
    thumbnailAttachment: thumb.thumbnailAttachment,
    lucyImgId: thumb.lucyImgId,
  };
}

function bulletListFromWiki(raw: string): string {
  const cleaned = cleanStatsblock(raw);
  if (!cleaned) return "";

  return cleaned
    .split("\n")
    .map((line) => line.replace(/^\*\s*/, "").trim())
    .filter(Boolean)
    .map((line) => `• ${line}`)
    .join("\n");
}

function extractSpellEffects(slotsRaw: string): string[] {
  const effects: string[] = [];
  const re =
    /\{\{\s*SpellSlotRow(?:Smart)?\s*\|\s*([^|{}]+)\s*\|\s*([^|{}]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(slotsRaw)) !== null) {
    const effect = match[2]?.trim();
    if (effect) effects.push(effect);
  }
  return effects;
}

function joinDetailParts(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(" · ");
}

function fieldLine(
  label: string,
  value: string | undefined,
  cleaner: (s: string) => string = cleanStatsblock,
): string | null {
  if (!value?.trim()) return null;
  const cleaned = cleaner(value);
  if (!cleaned) return null;
  return `${label}: ${cleaned}`;
}

async function spellFromWikitext(
  pageTitle: string,
  wikitext: string,
): Promise<EqWikiPage | null> {
  // Spellpagesmart wraps Spellpage with the same field names — prefer outer.
  const body =
    extractTemplateBody(wikitext, "Spellpagesmart") ??
    extractTemplateBody(wikitext, "Spellpage");
  if (!body) return null;

  const fields = parseTemplateFields(body);
  const name = (fields.spellname || pageTitle).trim();
  const description = cleanStatsblock(fields.description ?? "");
  const classes = bulletListFromWiki(fields.classes ?? "");
  const effects = extractSpellEffects(fields.slots ?? "").map(
    (e) => `• ${cleanStatsblock(e)}`,
  );

  const detailLine = joinDetailParts([
    fieldLine("Mana", fields.mana, (s) => s.trim()),
    fieldLine("Casting", fields.casting_time, (s) => s.trim()),
    fieldLine("Duration", fields.duration, (s) => s.trim()),
    fieldLine("Range", fields.range, (s) => s.trim()),
  ]);
  const typeLine = joinDetailParts([
    fieldLine("Skill", fields.skill),
    fieldLine("Type", fields.spell_type, (s) => s.trim()),
    fieldLine("Resist", fields.resist, (s) => s.trim()),
    fieldLine("Target", fields.target_type, (s) => s.trim()),
  ]);

  const sections: string[] = [];
  if (description) sections.push(description);
  if (classes) sections.push(`**Classes**\n${classes}`);
  if (effects.length) sections.push(`**Effects**\n${effects.join("\n")}`);
  if (detailLine || typeLine) {
    sections.push([detailLine, typeLine].filter(Boolean).join("\n"));
  }

  const spellicon = fields.spellicon?.trim() || null;
  const rawThumb = spellicon ? await fetchSpellIconUrl(spellicon) : null;
  const prepared = await prepareThumbnail(rawThumb);

  return {
    kind: "spell",
    name,
    pageTitle,
    pageUrl: pageUrlForTitle(pageTitle),
    description: sections.join("\n\n") || "_No spell details on this page._",
    thumbnailUrl: prepared.url,
    thumbnailFallbackUrl: prepared.fallbackUrl,
    thumbnailAttachment: prepared.attachment,
  };
}

async function npcFromWikitext(
  pageTitle: string,
  wikitext: string,
): Promise<EqWikiPage | null> {
  const body =
    extractTemplateBody(wikitext, "Namedmobpage") ??
    extractTemplateBody(wikitext, "NPC");
  if (!body) return null;

  const fields = parseTemplateFields(body);
  const name = (fields.name || pageTitle).trim();
  const description = cleanStatsblock(fields.description ?? "");

  const identity = joinDetailParts([
    fields.level?.trim() ? `Level ${fields.level.trim()}` : null,
    cleanStatsblock(fields.race ?? "") || null,
    cleanStatsblock(fields.class ?? "") || null,
  ]);
  const zoneLine = fieldLine("Zone", fields.zone);
  const locationLine = fieldLine("Location", fields.location);
  const respawnLine = fieldLine("Respawn", fields.respawn_time, (s) => s.trim());
  const combatLine = joinDetailParts([
    fieldLine("HP", fields.hp, (s) => s.trim()),
    fieldLine("AC", fields.ac, (s) => s.trim()),
    fieldLine("Damage", fields.damage_per_hit, (s) => s.trim()),
    fieldLine("Special", fields.special),
  ]);

  // known_loot uses {{:ItemName}} transclusions — turn those into wiki links
  let lootPreview: string | null = null;
  const lootRaw = fields.known_loot ?? fields.common_loot;
  if (lootRaw?.trim()) {
    const lootText = cleanStatsblock(stripTemplates(expandTransclusions(lootRaw)))
      .split("\n")
      .map((l) =>
        l
          .replace(/^[\d.\-*]+\s*/, "")
          .replace(/\(\s*(Common|Uncommon|Rare|Ultra Rare)\s*\)/gi, "")
          .trim(),
      )
      .filter((l) => l && !/^\(?\s*(common|uncommon|rare|ultra\s*rare)\s*\)?$/i.test(l))
      .slice(0, 10);
    if (lootText.length) {
      lootPreview = `**Loot**\n${lootText.map((l) => `• ${l}`).join("\n")}`;
    }
  }

  const sections = [
    description,
    identity,
    zoneLine,
    locationLine,
    respawnLine,
    combatLine,
    lootPreview,
  ].filter((s): s is string => Boolean(s));

  let rawThumb: string | null = null;
  const imageFile = fields.imagefilename?.trim();
  if (imageFile) {
    rawThumb = await fetchWikiFileUrl(`File:${imageFile}`);
  }
  const prepared = await prepareThumbnail(rawThumb);

  return {
    kind: "npc",
    name,
    pageTitle,
    pageUrl: pageUrlForTitle(pageTitle),
    description: sections.join("\n\n") || "_No NPC details on this page._",
    thumbnailUrl: prepared.url,
    thumbnailFallbackUrl: prepared.fallbackUrl,
    thumbnailAttachment: prepared.attachment,
  };
}

/** Parse classic zoneTopTable rows: ! ''' Label: ''' \n | value */
function parseZoneTopTable(wikitext: string): Record<string, string> {
  const fields: Record<string, string> = {};
  // Stop at next row separator (|-) or next header (!), not at pipes inside [[links|labels]]
  const re =
    /!\s*'{0,3}\s*([^:'{]+?)\s*:?\s*'{0,3}\s*\n\|([\s\S]*?)(?=\n\|-|\n!|\n\|\})/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(wikitext)) !== null) {
    const key = match[1]!
      .replace(/\[\[|\]\]/g, "")
      .replace(/'{2,}/g, "")
      .trim()
      .toLowerCase();
    const value = match[2]!.trim();
    if (key && value) fields[key] = value;
  }
  return fields;
}

function isZonePage(wikitext: string): boolean {
  return (
    /class\s*=\s*["']zoneTopTable["']/i.test(wikitext) ||
    /Level of Monsters/i.test(wikitext)
  );
}

function extractZoneMapFile(wikitext: string): string | null {
  // Prefer an image near a == Map == section; otherwise first zone-looking File:
  const mapSection = wikitext.match(
    /==\s*Map\s*==([\s\S]{0,2500})/i,
  );
  const scope = mapSection?.[1] ?? wikitext;
  const fileMatch = scope.match(
    /\[\[\s*File:([^|\]]+\.(?:jpg|jpeg|png|gif|webp))/i,
  );
  return fileMatch?.[1]?.trim() ?? null;
}

function extractZoneIntro(wikitext: string): string {
  let prose = wikitext;
  prose = prose.replace(/^#REDIRECT\s*\[\[.*?\]\]\s*/i, "");
  prose = stripTemplates(prose);
  prose = prose.replace(/__\w+__/g, "");
  // Drop TOC / table scaffolding before the first real paragraph
  const tableStart = prose.search(/\{\||<div/i);
  if (tableStart > 0) {
    prose = prose.slice(0, tableStart);
  }
  prose = cleanStatsblock(prose);
  const paragraphs = prose.split(/\n{2,}/).filter(Boolean);
  return paragraphs.slice(0, 2).join("\n\n");
}

/** Expand {{:Page}} / {{Page}} transclusions into [[Page]] wiki links. */
function expandTransclusions(raw: string): string {
  return raw.replace(
    /\{\{\s*:?\s*([^|{}]+?)\s*(?:\|[^}]*)?\}\}/g,
    (_m, name: string) => `[[${name.trim()}]]`,
  );
}

/** Keep Discord fields readable: one line, capped length at a natural break. */
function formatZoneFieldValue(raw: string, maxLen = 280): string {
  let text = cleanStatsblock(expandTransclusions(raw))
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLen) return text;

  // Prefer cutting after a comma / closing paren / markdown link
  const slice = text.slice(0, maxLen);
  const breakAt = Math.max(
    slice.lastIndexOf("), "),
    slice.lastIndexOf("], "),
    slice.lastIndexOf(", "),
  );
  if (breakAt > maxLen * 0.5) {
    return `${slice.slice(0, breakAt + 1).trim()} …`;
  }
  return `${slice.trim()}…`;
}

async function zoneFromWikitext(
  pageTitle: string,
  wikitext: string,
): Promise<EqWikiPage | null> {
  if (!isZonePage(wikitext)) return null;

  const fields = parseZoneTopTable(wikitext);
  const intro = extractZoneIntro(wikitext);

  const pick = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const v = fields[key.toLowerCase()];
      if (v?.trim()) return v;
    }
    return undefined;
  };

  const detailLines = [
    fieldLine("Levels", pick("level of monsters"), (s) => s.trim()),
    fieldLine("Mobs", pick("types of monsters"), formatZoneFieldValue),
    fieldLine("Named", pick("notable npcs"), formatZoneFieldValue),
    fieldLine("Unique loot", pick("unique items"), formatZoneFieldValue),
    fieldLine("Quests", pick("related quests"), formatZoneFieldValue),
    fieldLine("Adjacent", pick("adjacent zones"), formatZoneFieldValue),
    fieldLine("/who", pick("name in /who"), (s) => s.trim()),
    fieldLine("Succor", pick("succor/evacuate", "succor", "evacuate")),
    fieldLine("ZEM", pick("zem value", "zem"), (s) =>
      cleanStatsblock(s).replace(/\n+/g, " ").trim(),
    ),
  ].filter((s): s is string => Boolean(s));

  const sections = [intro, detailLines.join("\n")].filter(Boolean);

  let rawThumb: string | null = null;
  const mapFile = extractZoneMapFile(wikitext);
  if (mapFile) {
    rawThumb = await fetchWikiFileUrl(`File:${mapFile}`);
  }
  const prepared = await prepareThumbnail(rawThumb);

  return {
    kind: "zone",
    name: pageTitle,
    pageTitle,
    pageUrl: pageUrlForTitle(pageTitle),
    description: sections.join("\n\n") || "_No zone details on this page._",
    thumbnailUrl: prepared.url,
    thumbnailFallbackUrl: prepared.fallbackUrl,
    thumbnailAttachment: prepared.attachment,
  };
}

/** Bullet list from Factionpage * lists, capped for Discord embeds. */
function cappedWikiList(raw: string | undefined, maxItems = 8): string | null {
  if (!raw?.trim()) return null;
  const lines = cleanStatsblock(raw)
    .split("\n")
    .map((line) => line.replace(/^\*\s*/, "").trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const shown = lines.slice(0, maxItems);
  const bullets = shown.map((line) => `• ${line}`);
  const extra = lines.length - shown.length;
  if (extra > 0) bullets.push(`• …and ${extra} more`);
  return bullets.join("\n");
}

function factionFromWikitext(
  pageTitle: string,
  wikitext: string,
): EqWikiPage | null {
  const body = extractTemplateBody(wikitext, "Factionpage");
  if (!body) return null;

  const fields = parseTemplateFields(body);
  const description = cleanStatsblock(fields.description ?? "");

  const sections: string[] = [];
  if (description) sections.push(description);

  const zonesRaise = cappedWikiList(fields.zones_raise, 8);
  const zonesLower = cappedWikiList(fields.zones_lower, 8);
  const questsRaise = cappedWikiList(fields.quests_raise, 6);
  const questsLower = cappedWikiList(fields.quests_lower, 6);

  if (zonesRaise) sections.push(`**Zones (raise)**\n${zonesRaise}`);
  if (zonesLower) sections.push(`**Zones (lower)**\n${zonesLower}`);
  if (questsRaise) sections.push(`**Quests (raise)**\n${questsRaise}`);
  if (questsLower) sections.push(`**Quests (lower)**\n${questsLower}`);

  return {
    kind: "faction",
    name: pageTitle,
    pageTitle,
    pageUrl: pageUrlForTitle(pageTitle),
    description: sections.join("\n\n") || "_No faction overview on this page._",
    thumbnailUrl: null,
    thumbnailFallbackUrl: null,
    thumbnailAttachment: null,
  };
}

function genericFromWikitext(pageTitle: string, wikitext: string): EqWikiPage {
  // Strip leading era/nav templates, then take prose.
  let prose = wikitext;
  // Remove redirect lines
  prose = prose.replace(/^#REDIRECT\s*\[\[.*?\]\]\s*/i, "");
  prose = stripTemplates(prose);
  prose = cleanStatsblock(prose);

  // Keep a short intro
  const paragraphs = prose.split(/\n{2,}/).filter(Boolean);
  const description =
    paragraphs.slice(0, 2).join("\n\n") || "_No summary available._";

  return {
    kind: "generic",
    name: pageTitle,
    pageTitle,
    pageUrl: pageUrlForTitle(pageTitle),
    description,
    thumbnailUrl: null,
    thumbnailFallbackUrl: null,
    thumbnailAttachment: null,
  };
}

async function pageFromWikitext(
  pageTitle: string,
  wikitext: string,
): Promise<EqWikiPage> {
  const item = await itemFromWikitext(pageTitle, wikitext);
  if (item) {
    return {
      kind: "item",
      name: item.name,
      pageTitle: item.pageTitle,
      pageUrl: item.pageUrl,
      description: item.statsblock || "_No statsblock on this item page._",
      thumbnailUrl: item.thumbnailUrl,
      thumbnailFallbackUrl: item.thumbnailFallbackUrl,
      thumbnailAttachment: item.thumbnailAttachment,
    };
  }

  const spell = await spellFromWikitext(pageTitle, wikitext);
  if (spell) return spell;

  const npc = await npcFromWikitext(pageTitle, wikitext);
  if (npc) return npc;

  const zone = await zoneFromWikitext(pageTitle, wikitext);
  if (zone) return zone;

  const faction = factionFromWikitext(pageTitle, wikitext);
  if (faction) return faction;

  return genericFromWikitext(pageTitle, wikitext);
}

/**
 * Resolve an item name to EQLwiki Itempage data (stats + Lucy icon).
 */
export async function lookupItem(name: string): Promise<EqItemLookupResult> {
  const resolved = await resolveWikiPage(name);
  if (!resolved.ok) {
    return resolved;
  }

  const item = await itemFromWikitext(resolved.title, resolved.wikitext);
  if (!item) {
    return { ok: false, reason: "not_item", suggestions: [resolved.title] };
  }

  return { ok: true, item };
}

/**
 * Resolve a zone page (zoneTopTable / Levels of Monsters layout).
 */
export async function lookupZone(name: string): Promise<EqZoneLookupResult> {
  const resolved = await resolveWikiPage(name);
  if (!resolved.ok) {
    return resolved;
  }

  const zone = await zoneFromWikitext(resolved.title, resolved.wikitext);
  if (!zone) {
    return { ok: false, reason: "not_zone", suggestions: [resolved.title] };
  }

  return { ok: true, page: zone };
}

/**
 * Resolve an NPC / named mob page (Namedmobpage template).
 */
export async function lookupMob(name: string): Promise<EqMobLookupResult> {
  const resolved = await resolveWikiPage(name);
  if (!resolved.ok) {
    return resolved;
  }

  const mob = await npcFromWikitext(resolved.title, resolved.wikitext);
  if (!mob) {
    return { ok: false, reason: "not_mob", suggestions: [resolved.title] };
  }

  return { ok: true, page: mob };
}

/**
 * Resolve a spell page (Spellpage / Spellpagesmart templates).
 */
export async function lookupSpell(name: string): Promise<EqSpellLookupResult> {
  const resolved = await resolveWikiPage(name);
  if (!resolved.ok) {
    return resolved;
  }

  const spell = await spellFromWikitext(resolved.title, resolved.wikitext);
  if (!spell) {
    return { ok: false, reason: "not_spell", suggestions: [resolved.title] };
  }

  return { ok: true, page: spell };
}

/**
 * Resolve a faction page (Factionpage template).
 */
export async function lookupFaction(
  name: string,
): Promise<EqFactionLookupResult> {
  const resolved = await resolveWikiPage(name);
  if (!resolved.ok) {
    return resolved;
  }

  const faction = factionFromWikitext(resolved.title, resolved.wikitext);
  if (!faction) {
    return { ok: false, reason: "not_faction", suggestions: [resolved.title] };
  }

  return { ok: true, page: faction };
}

/**
 * Resolve any EQLwiki page (item, spell, NPC, zone, faction, or generic prose).
 */
export async function lookupWikiPage(
  query: string,
): Promise<EqWikiLookupResult> {
  const resolved = await resolveWikiPage(query);
  if (!resolved.ok) {
    return resolved;
  }

  const page = await pageFromWikitext(resolved.title, resolved.wikitext);
  return { ok: true, page };
}

export type ClassSpellEntry = {
  level: number;
  name: string;
  kind: string | null;
  mana: string | null;
  maxEffect: string | null;
  description: string | null;
};

export type EqClassSpellsLookupResult =
  | {
      ok: true;
      className: string;
      pageTitle: string;
      pageUrl: string;
      fromLevel: number;
      toLevel: number;
      spells: ClassSpellEntry[];
    }
  | {
      ok: false;
      reason: "not_found" | "no_spells";
      className?: string;
      pageTitle?: string;
      pageUrl?: string;
    };

/** Strip nested {{...}} from a single template field value. */
function stripInlineTemplates(raw: string): string {
  return stripTemplates(raw).replace(/\s+/g, " ").trim();
}

/**
 * Parse `{{RadSpellRow2 ...}}` rows from a class-page level section.
 */
function parseRadSpellRows(section: string): Array<{
  name: string;
  kind: string | null;
  mana: string | null;
  maxEffect: string | null;
  description: string | null;
}> {
  const rows: Array<{
    name: string;
    kind: string | null;
    mana: string | null;
    maxEffect: string | null;
    description: string | null;
  }> = [];

  const lower = section.toLowerCase();
  let searchFrom = 0;
  while (searchFrom < section.length) {
    const needle = "{{radspellrow2";
    const start = lower.indexOf(needle, searchFrom);
    if (start === -1) break;

    let i = start + needle.length;
    while (i < section.length && /[ \t]/.test(section[i]!)) i += 1;

    let depth = 1;
    const bodyStart = i;
    while (i < section.length && depth > 0) {
      if (section.startsWith("{{", i)) {
        depth += 1;
        i += 2;
        continue;
      }
      if (section.startsWith("}}", i)) {
        depth -= 1;
        if (depth === 0) break;
        i += 2;
        continue;
      }
      i += 1;
    }
    if (depth !== 0) break;

    const body = section.slice(bodyStart, i);
    searchFrom = i + 2;

    const fields = parseTemplateFields(body);
    const name = fields.name?.trim();
    if (!name) continue;

    rows.push({
      name: stripInlineTemplates(name) || name,
      kind: fields.kind ? stripInlineTemplates(fields.kind) || null : null,
      mana: fields.mana ? stripInlineTemplates(fields.mana) || null : null,
      maxEffect: fields.max ? stripInlineTemplates(fields.max) || null : null,
      description: fields.description
        ? stripInlineTemplates(fields.description) || null
        : null,
    });
  }

  return rows;
}

/**
 * Extract per-level spell tables from a class page (e.g. Wizard, Cleric).
 * These pages use `==Level N==` headings with `{{RadSpellRow2}}` rows.
 */
export function parseClassSpellList(
  wikitext: string,
  fromLevel: number,
  toLevel: number,
): ClassSpellEntry[] {
  const low = Math.min(fromLevel, toLevel);
  const high = Math.max(fromLevel, toLevel);
  const spells: ClassSpellEntry[] = [];

  const headingRe = /^==Level\s+(\d+)==\s*$/gm;
  const headings: Array<{ level: number; index: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(wikitext)) !== null) {
    headings.push({
      level: Number(match[1]),
      index: match.index,
      end: match.index + match[0].length,
    });
  }

  for (let h = 0; h < headings.length; h++) {
    const heading = headings[h]!;
    if (heading.level < low || heading.level > high) continue;

    const sectionStart = heading.end;
    const nextHeading = headings[h + 1];
    const sectionEnd = nextHeading ? nextHeading.index : wikitext.length;
    const section = wikitext.slice(sectionStart, sectionEnd);

    for (const row of parseRadSpellRows(section)) {
      spells.push({
        level: heading.level,
        name: row.name,
        kind: row.kind,
        mana: row.mana,
        maxEffect: row.maxEffect,
        description: row.description,
      });
    }
  }

  return spells;
}

/**
 * Look up spells a class receives in a level range from that class's EQLwiki page.
 */
export async function lookupClassSpells(
  className: string,
  fromLevel: number,
  toLevel: number,
): Promise<EqClassSpellsLookupResult> {
  const title = className.trim();
  if (!title) {
    return { ok: false, reason: "not_found" };
  }

  const page = await fetchPageWikitext(title);
  if (!page) {
    return { ok: false, reason: "not_found", className: title };
  }

  const spells = parseClassSpellList(page.wikitext, fromLevel, toLevel);
  const pageUrl = pageUrlForTitle(page.title);

  if (spells.length === 0) {
    // Distinguish "page has no spell tables at all" vs "range is empty".
    const anySpells = parseClassSpellList(page.wikitext, 1, 60);
    if (anySpells.length === 0) {
      return {
        ok: false,
        reason: "no_spells",
        className: page.title,
        pageTitle: page.title,
        pageUrl,
      };
    }
  }

  return {
    ok: true,
    className: page.title,
    pageTitle: page.title,
    pageUrl,
    fromLevel: Math.min(fromLevel, toLevel),
    toLevel: Math.max(fromLevel, toLevel),
    spells,
  };
}
