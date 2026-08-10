# eql-twitch-bot

Tiny Twitch chat bot for [EQLwiki](https://eqlwiki.com) lookups. Sibling to The Chronicler Discord bot’s wiki commands — not part of that repo. See [CHANGELOG.md](CHANGELOG.md) for recent changes.

## Chat commands

Prefix defaults to `!eqlwiki`:

| Command | What it does |
|---------|----------------|
| `!eqlwiki item SoulFire` | Item lookup |
| `!eqlwiki item SoulFire +1` | Item lookup with upgrade-tier stats (+1…+10) |
| `!eqlwiki fbss` / `!eqlwiki yak` | Common item abbreviations (see `src/wikiAliases.ts`) |
| `!eqlwiki mob a gnoll` | NPC / mob lookup (`npc` also works) |
| `!eqlwiki zone West Freeport` | Zone lookup |
| `!eqlwiki spell Complete Healing` | Spell lookup |
| `!eqlwiki faction Guards of Qeynos` | Faction lookup |
| `!eqlwiki SoulFire` | General wiki lookup |
| `!eqlwiki help` | Short usage blurb |
| `!eqlwiki stats` | Command usage counts (broadcaster/mods only; alias `usage`) |
| `!magelo` | Same as `!roster` |
| `!roster` | Link to [Norrath Roster](https://norrathroster.com); `!roster <name> <server>` opens a sheet |
| `!roster Flesh freeport` | Direct character sheet link when the name exists on that server |
| `!roster guild Severely Artistic rivervale` | Guild page link when the guild exists on that server |

Replies are plain text plus a wiki link (Twitch has no embeds).

### Usage stats

Every handled command (`!eqlwiki` lookups/help, `!magelo`, `!roster`, not-found) increments a counter persisted in JSON under `DATA_DIR` (default `./data/usage.json`). Counts are global and per-channel (with `lastUsedAt`). Docker mounts `./data:/app/data` so counts survive redeploys. In chat, mods/broadcaster can run `!eqlwiki stats` for a short global summary. Admin health reads the same data from `GET /status` (or `GET /usage`) on the install HTTP port.
## Quick start (after you have a token)

```bash
cd ~/projects/EQL-twitch-bot
cp .env.example .env   # if you don't already have .env
# edit .env — see "Your steps" below
npm install
npm run smoke -- "item SoulFire"   # wiki only, no Twitch login
npm run dev                        # connects to Twitch chat
```

In your stream chat (or the channel listed in `TWITCH_CHANNELS`), try: `!eqlwiki help`

## Your steps (Twitch — required once)

These need your browser / bot account. Nobody else can do them for you.

### 1. Bot Twitch account

You already created one. Note its **login** (username), all lowercase for `.env`.

### 2. Mod the bot in your stream channel

Logged into your **streamer** account → chat → mod the bot:

```
/mod BOT_USERNAME
```

Optional but recommended (higher chat limits / fewer “not verified” issues).

### 3. Register a Twitch application

1. Log into [Twitch Developer Console](https://dev.twitch.tv/console/apps) as the **bot** account (or any account you control; you’ll authorize as the bot in the next step).
2. **Register Your Application**
   - Name: e.g. `EQL Wiki Bot` (don’t put the word “Twitch” in the name)
   - OAuth Redirect URLs: `http://localhost:3000`
   - Category: **Chat Bot**
3. Create → open the app → copy **Client ID**. Generate a **Client Secret** and save it somewhere private.

### 4. Get a user access token (as the bot)

You need a **user** token for the bot with scopes `chat:read` and `chat:edit`.

**Easiest (browser, short-lived / fine for testing):**

1. Log out of Twitch in the browser, then log in as the **bot**.
2. Open this URL (replace `YOUR_CLIENT_ID`):

```
https://id.twitch.tv/oauth2/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000&response_type=token&scope=chat:read+chat:edit
```

3. Allow → browser lands on `http://localhost:3000/#access_token=...&...` (page may fail to load; that’s OK).
4. Copy the `access_token` value from the address bar.

**More durable (Twitch CLI, refreshable):**

```bash
brew install twitch-cli
twitch configure   # paste Client ID + Secret
# Log in as the BOT when the browser opens:
twitch token -u -s "chat:read chat:edit"
```

Paste the printed token into `.env` as `TWITCH_OAUTH_TOKEN` (with or without `oauth:` — both work).

> Tokens expire. If the bot suddenly can’t chat, re-run step 4.

### 5. Fill `.env`

```bash
cd ~/projects/EQL-twitch-bot
cp .env.example .env   # already done locally if you followed Quick start
```

Edit `.env`:

```
TWITCH_USERNAME=your_bot_login
TWITCH_OAUTH_TOKEN=oauth:paste_token_here
TWITCH_CHANNELS=your_streamer_login
```

`TWITCH_CHANNELS` is a **bootstrap** list merged into `data/channels.json` on boot. Streamers can also add/remove themselves via [norrathroster.com/twitch-bot](https://norrathroster.com/twitch-bot) (Twitch OAuth → bot joins at runtime).

For self-serve, add the Twitch app’s **Client ID** and **Client Secret** to `.env`, and register this OAuth redirect URL on the app:

```
https://norrathroster.com/api/twitch-bot/oauth/callback
```

```
TWITCH_CLIENT_ID=…
TWITCH_CLIENT_SECRET=…
```

Caddy on the Chronicler stack proxies `/api/twitch-bot/*` to this bot; Compose attaches to the external `berrybot_berrybot` network.

### 6. Run locally

```bash
npm run dev
```

You should see a “Connected … as …” log. In that channel’s chat: `!eqlwiki item SoulFire`.

### 7. Deploy to Lightsail (same host as Chronicler)

Production runs on the Chronicler Lightsail box as a **separate** Compose stack (`~/EQL-twitch-bot`), not inside the berrybot compose file.

From your Mac (needs `~/.ssh/lightsail/berrybot.pem` + a filled local `.env`):

```bash
cd ~/projects/EQL-twitch-bot
npm run deploy
# or: bash scripts/deploy.sh
```

That rsyncs code, scp’s `.env`, and runs `docker compose up -d --build` on the server.

Before deploy, cut a release if `[Unreleased]` has notes: promote them to a dated version in `CHANGELOG.md` and bump `package.json` (patch for fixes, minor for features).

Manual equivalent:

```bash
rsync -az --delete --exclude node_modules --exclude dist --exclude .git --exclude .env --exclude data \
  -e "ssh -i ~/.ssh/lightsail/berrybot.pem" \
  ./ ubuntu@52.45.134.246:~/EQL-twitch-bot/
scp -i ~/.ssh/lightsail/berrybot.pem .env ubuntu@52.45.134.246:~/EQL-twitch-bot/.env
ssh -i ~/.ssh/lightsail/berrybot.pem ubuntu@52.45.134.246 \
  'cd ~/EQL-twitch-bot && docker compose up -d --build && docker compose logs --tail=40'
```

Keep `.env` off git. Rebuild after code or token changes with `npm run deploy` again.

## Env reference

| Variable | Required | Notes |
|----------|----------|--------|
| `TWITCH_USERNAME` | yes | Bot login |
| `TWITCH_OAUTH_TOKEN` | yes | With or without `oauth:` prefix |
| `TWITCH_CHANNELS` | seed | Bootstrap channels merged into `channels.json` |
| `TWITCH_CLIENT_ID` | for install | Twitch app client ID (self-serve add/remove) |
| `TWITCH_CLIENT_SECRET` | for install | Twitch app client secret |
| `TWITCH_PREFIX` | no | Default `!eqlwiki` |
| `TWITCH_COOLDOWN_MS` | no | Default `2500` between replies per channel |
| `DATA_DIR` | no | Default `./data` (Docker: `/app/data`) |
| `USAGE_DB_PATH` | no | Default `$DATA_DIR/usage.json` |
| `CHANNELS_FILE` | no | Default `$DATA_DIR/channels.json` |
| `JOIN_API_PORT` | no | Default `3911` (internal, via Caddy) |

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Run bot (watch mode) |
| `npm start` | Run built `dist/` |
| `npm test` | Unit tests (parser/format) |
| `npm run smoke -- "item SoulFire"` | Live EQLwiki lookup, no Twitch |
| `npm run typecheck` / `npm run build` | TypeScript |

## Notes

- EQLwiki client logic lives in `src/eqlwiki.ts` (ported from Chronicler). Sync from `norrath-roster` when Discord wiki behavior changes and you care.
- No Discord, music, moderation, or roster DB — wiki chat only.
- Git remote should be SSH: `git@github.com:jungleberrydev/EQL-twitch-bot.git` (HTTPS password auth will fail).
