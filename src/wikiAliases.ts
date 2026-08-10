/**
 * Chat nicknames / abbreviations → EQLwiki page titles.
 * Keys are normalized: lowercase, with spaces/underscores/hyphens/apostrophes removed.
 * Exact-key match only — never fuzzy-expand short tokens into unrelated pages.
 */
const WIKI_ALIASES: Record<string, string> = {
  // Classic haste / travel
  fbss: "Flowing Black Silk Sash",
  jboots: "Journeyman's Boots",
  jboot: "Journeyman's Boots",
  gebs: "Golden Efreeti Boots",
  geb: "Golden Efreeti Boots",
  dwb: "Dwarven Work Boots",

  // Weapons
  yak: "Short Sword of the Ykesha",
  ssoy: "Short Sword of the Ykesha",
  ssoty: "Short Sword of the Ykesha",
  ifs: "Imbued Fighters Staff",
  tstaff: "Tranquil Staff",
  bbc: "Bone Bladed Claymore",
  pgt: "Polished Granite Tomahawk",
  sbd: "Serrated Bone Dirk",
  sbh: "Shiny Brass Halberd",
  btc: "Bladed Thulian Claws",
  fcgs: "Fungus Covered Great Staff",
  ebw: "Electrum-Bladed Wakizashi",
  bws: "Burnished Wooden Stave",
  swb: "Spiroc Wingblade",
  fotg: "Fang of the Garou",
  ghoulbane: "Ghoulbane",
  earthcaller: "Earthcaller",
  raincaller: "Rain Caller",
  martune: "Martune Rapier",
  howlingharpoon: "Howling Harpoon",

  // Armor / cloaks / faces
  hbc: "Hooded Black Cloak",
  cof: "Cloak of Flames",
  smr: "Shining Metallic Robes",
  rote: "Robe of the Oracle",
  ods: "Obulus Death Shroud",
  tme: "Tobrin's Mystical Eyepatch",
  tobrin: "Tobrin's Mystical Eyepatch",
  guise: "Guise of the Deceiver",
  pearlescent: "Pearlescent Mask",
  cem: "Crown of Elemental Mastery",
  neshika: "Collar of Neshika",
  cgs: "Charred Guardian Shield",
  ors: "Ornate Rune Shield",
  pmm: "Polished Mithril Mask",
  ssb: "Skull-shaped Barbute",
  wdc: "White Dragonscale Cloak",

  // Misc classics
  gbs: "Glowing Black Stone",
  rbb: "Runed Bolster Belt",
  tbb: "Thick Banded Belt",
  fishbone: "Fishbone Earring",
  manastone: "Manastone",
  rota: "Ring of the Ancients",
  iot: "Idol of the Thorned",
  cbb: "Chipped Bone Bracelet",
  pbb: "Polished Bone Bracelet",
  pfwr: "Platinum Fire Wedding Ring",
  heb: "Holgresh Elder Beads",
  ivandyr: "Ivandyr's Hoop",
};

/** Collapse to the alias lookup key (`J Boots` → `jboots`). */
export function normalizeAliasKey(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/[\s'_-]+/g, "");
}

/**
 * Expand a known chat abbreviation to its wiki title.
 * Unknown queries are returned trimmed, unchanged.
 */
export function expandWikiAlias(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;
  return WIKI_ALIASES[normalizeAliasKey(trimmed)] ?? trimmed;
}

/** Test/helper: known alias keys (normalized). */
export function listWikiAliasKeys(): string[] {
  return Object.keys(WIKI_ALIASES).sort();
}
