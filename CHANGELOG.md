# Changelog

All notable changes to eql-twitch-bot are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Version numbers match `package.json`. When shipping work to production (merge + deploy),
cut a release in the same change set: promote `[Unreleased]` notes into a dated version
section and bump `package.json`. Use `[Unreleased]` only while work is still in progress.

## [Unreleased]

## [1.3.1] - 2026-08-01

### Added

- `GET /status` — JSON `{ channelCount, channels }` for admin health (and ops).

## [1.3.0] - 2026-08-01

### Added

- Self-serve channel install/remove via Twitch OAuth (proxied at `norrathroster.com/api/twitch-bot/*`).
- Durable channel list in `data/channels.json` (seeded from `TWITCH_CHANNELS`); runtime `join`/`part` without redeploy.

## [1.2.0] - 2026-08-01

### Changed

- Default chat command prefix is now `!eqlwiki` (was `!eql`). Override with `TWITCH_PREFIX` if needed.

## [1.1.1] - 2026-08-01

### Fixed

- Expand `{{SpellHoverLink|…}}` wiki templates in spell (and other) summaries so chat shows the spell name instead of raw template text.

## [1.1.0] - 2026-08-01

### Added

- `!roster <name> <server>` / `!magelo <name> <server>` — look up a character via the Norrath Roster API and reply with the sheet URL when found.
- `!magelo` / `!roster` — standalone aliases that link to [Norrath Roster](https://norrathroster.com) character sheets (share cooldown and usage stats with `!eql`).
- Persistent command usage stats under `DATA_DIR` (default `./data/usage.json`); mods/broadcaster can run `!eql stats` (alias `usage`).
- Lightsail deploy script (`npm run deploy`) — rsync + Compose rebuild beside Chronicler.

### Changed

- Wiki lookup replies lead with `Name: url` so the EQLwiki link stays visible when Twitch truncates long stats.
- `!eql stats` leads with `total: N`.

### Removed

- Item Effect spell-page links in wiki replies (merged briefly, then reverted).

## [1.0.0] - 2026-07-31

### Added

- Twitch chat bot for EQLwiki lookups: `!eql item|mob|zone|spell|faction` plus general search and `!eql help`.
- Docker Compose stack, Twitch setup docs, and `npm run smoke` for wiki-only checks.
