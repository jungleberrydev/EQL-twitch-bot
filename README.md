# eql-twitch-bot

Tiny Twitch chat bot for [EQLwiki](https://eqlwiki.com) lookups. Sibling to The Chronicler Discord bot’s wiki commands — not part of that repo.

## Chat commands

Prefix defaults to `!eql`:

| Command | What it does |
|---------|----------------|
| `!eql item SoulFire` | Item lookup |
| `!eql mob a gnoll` | NPC / mob lookup (`npc` also works) |
| `!eql zone West Freeport` | Zone lookup |
| `!eql spell Complete Healing` | Spell lookup |
| `!eql faction Guards of Qeynos` | Faction lookup |
| `!eql SoulFire` | General wiki lookup |
| `!eql help` | Short usage blurb |

Replies are plain text plus a wiki link (Twitch has no embeds).

## Setup

1. Create a Twitch account for the bot (or use an existing one).
2. Get an OAuth token with `chat:read` and `chat:edit` (e.g. [Twitch Token Generator](https://twitchtokengenerator.com/) or your own Twitch app).
3. Copy env and fill it in:

```bash
cp .env.example .env
# TWITCH_USERNAME, TWITCH_OAUTH_TOKEN, TWITCH_CHANNELS
```

4. Run:

```bash
npm install
npm run dev
# or
npm run build && npm start
```

Docker:

```bash
docker compose up -d --build
```

## Env

| Variable | Required | Notes |
|----------|----------|--------|
| `TWITCH_USERNAME` | yes | Bot login |
| `TWITCH_OAUTH_TOKEN` | yes | With or without `oauth:` prefix |
| `TWITCH_CHANNELS` | yes | Comma-separated channels to join |
| `TWITCH_PREFIX` | no | Default `!eql` |
| `TWITCH_COOLDOWN_MS` | no | Default `2500` between replies per channel |

## Notes

- EQLwiki client logic lives in `src/eqlwiki.ts` (ported from Chronicler). If Discord lookup behavior changes upstream, sync this file when you care.
- No Discord, music, moderation, or roster DB — wiki chat only.
