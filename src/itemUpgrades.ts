/**
 * EQLwiki item-tier scaling (ported from norrath-roster `itemUpgrades.ts`).
 * Pure string math on a cleaned Itempage statsblock — no DB/API.
 */

const MAX_ITEM_TIER = 10;

/**
 * Numeric stats documented as scaling with item tier. Metadata such as item
 * level requirements, effect levels, capacity, haste, and weapon delay is
 * intentionally excluded. Weapon DMG uses a separate rule (see
 * `upgradeDamageValue`).
 */
const SCALING_STAT =
  /^(?:AC|STR|STA|AGI|DEX|WIS|INT|CHA|HP|MANA|ENDURANCE|END|ATK|ATTACK|MR|FR|CR|DR|PR|SV\s+(?:MAGIC|FIRE|COLD|DISEASE|POISON|CORRUPTION)|HP\s+REGEN|MANA\s+REGEN|ENDURANCE\s+REGEN|HEROIC\s+(?:STR|STA|AGI|DEX|WIS|INT|CHA))$/i;

const DAMAGE_STAT = /^(?:DMG|DAMAGE)$/i;

/** Label + value pairs that may scale (`STR: +7`, `WT: 5.0`). */
const SCALING_TOKEN_RE =
  /([A-Z][A-Z ]*):\s*([+-]?\d+(?:\.\d+)?)/gi;

function clampTier(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.min(MAX_ITEM_TIER, Math.max(0, Math.trunc(level)));
}

/**
 * Each tier is a cumulative +10%. Calculations round down, with at least one
 * point gained by a present positive stat at the start of every tier.
 * Negatives follow EQLwiki `ext.itemLevelSlider`: MIN(0, B + fullLevel) —
 * improve toward zero by +1 per tier, never crossing above 0.
 */
export function upgradeStatValue(base: number, level: number): number {
  const tier = clampTier(level);
  if (tier === 0 || base === 0) return base;
  if (base < 0) return Math.min(0, base + tier);
  return Math.max(Math.floor(base * (1 + tier / 10)), base + tier);
}

/**
 * Weapon damage — EQLwiki `ext.itemLevelSlider` `scaleDamage`:
 * `base + floor(base * tier / 10)`. No +1-per-tier floor (unlike primary stats).
 */
export function upgradeDamageValue(base: number, level: number): number {
  const tier = clampTier(level);
  if (tier === 0 || base <= 0) return base;
  return base + Math.floor((base * tier) / 10);
}

/** Weight falls by 10% of its base value per tier, never below 0.1. */
export function upgradeWeightValue(base: number, level: number): number {
  const tier = clampTier(level);
  if (tier === 0 || base <= 0) return base;
  return Math.max(0.1, Math.floor(base * (1 - tier / 10) * 10) / 10);
}

function formatScaledValue(original: string, value: number): string {
  if (original.startsWith("+") && value >= 0) return `+${value}`;
  if (original.includes(".")) return value.toFixed(1);
  return String(value);
}

/**
 * Apply EQLwiki's published tier rules to a statsblock. Unknown fields are
 * preserved verbatim.
 */
export function calculateUpgradedStatsText(
  statsText: string,
  level: number,
): string {
  const tier = clampTier(level);
  if (tier === 0 || !statsText.trim()) return statsText;

  let out = "";
  let cursor = 0;
  SCALING_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SCALING_TOKEN_RE.exec(statsText)) !== null) {
    const full = match[0]!;
    const label = match[1]!;
    const raw = match[2]!;
    const start = match.index;

    out += statsText.slice(cursor, start);

    const trimmedLabel = label.trim();
    const isWeight = /^(?:WT|WEIGHT)$/i.test(trimmedLabel);
    const isDamage = DAMAGE_STAT.test(trimmedLabel);
    const isScalingStat = SCALING_STAT.test(trimmedLabel);
    let upgraded: string | null = null;

    if (isWeight) {
      const base = Number(raw);
      if (Number.isFinite(base)) {
        const next = upgradeWeightValue(base, tier);
        if (next !== base) upgraded = next.toFixed(1);
      }
    } else if (isDamage) {
      const base = Number(raw);
      if (Number.isInteger(base)) {
        const next = upgradeDamageValue(base, tier);
        if (next !== base) upgraded = formatScaledValue(raw, next);
      }
    } else if (isScalingStat) {
      const base = Number(raw);
      if (Number.isInteger(base)) {
        const next = upgradeStatValue(base, tier);
        if (next !== base) upgraded = formatScaledValue(raw, next);
      }
    }

    out += upgraded == null ? full : `${label}: ${upgraded}`;
    cursor = start + full.length;
  }
  out += statsText.slice(cursor);
  return out;
}

/** Append ` +N` when the item has an upgrade level (idempotent). */
export function itemNameWithLevel(
  name: string,
  level: number | null | undefined,
): string {
  const tier = typeof level === "number" ? clampTier(level) : 0;
  if (tier === 0 || !name.trim()) return name;
  if (/\s\+\d+\s*$/.test(name)) return name;
  return `${name} +${tier}`;
}

/**
 * Extract a trailing ` +N` upgrade tier from a chat query
 * (e.g. "SoulFire +2" → 2). Returns null when absent or not a positive int.
 * Clamps to the max published tier (10).
 */
export function extractItemLevel(raw: string): number | null {
  const cleaned = raw.trim();
  const match = /\+(\d+)\s*$/.exec(cleaned);
  if (!match) return null;
  const level = Number(match[1]);
  if (!Number.isInteger(level) || level <= 0) return null;
  return clampTier(level);
}

/** Strip a trailing ` +N` suffix so the base wiki title can be looked up. */
export function stripItemLevel(raw: string): string {
  return raw.trim().replace(/\s*\+\d+\s*$/, "").trim();
}

/**
 * Split an item chat query into base name + upgrade tier.
 * `SoulFire +1` → `{ name: "SoulFire", level: 1 }`
 */
export function parseItemLevelQuery(query: string): {
  name: string;
  level: number;
} {
  const level = extractItemLevel(query) ?? 0;
  const name = level > 0 ? stripItemLevel(query) : query.trim();
  return { name: name || query.trim(), level };
}
