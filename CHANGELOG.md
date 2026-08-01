# Changelog

All notable changes to eql-twitch-bot are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Version numbers match `package.json` when cut; otherwise newer work lands under Unreleased.

## [Unreleased]

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
