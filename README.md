# eql-twitch-bot

Tiny Twitch chat bot for [EQLwiki](https://eqlwiki.com) lookups. Sibling to The Chronicler Discord bot’s wiki commands — not part of that repo. See [CHANGELOG.md](CHANGELOG.md) for recent changes.

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
| `!eql stats` | Command usage counts (broadcaster/mods only; alias `usage`) |
| `!magelo` | Same as `!roster` |
| `!roster` | Link to [Norrath Roster](https://norrathroster.com); `!roster <name> <server>` opens a sheet |
| `!roster Flesh freeport` | Direct character sheet link when the name exists on that server |

Replies are plain text plus a wiki link (Twitch has no embeds).

### Usage stats

Every handled command (`!eql` lookups/help, `!magelo`, `!roster`, not-found) increments a counter persisted in JSON under `DATA_DIR` (default `./data/usage.json`). Docker mounts `./data:/app/data` so counts survive redeploys. In chat, mods/broadcaster can run `!eql stats` for a short summary.
## Quick start (after you have a token)

```bash
cd ~/projects/EQL-twitch-bot
cp .env.example .env   # if you don't already have .env
# edit .env — see "Your steps" below
npm install
npm run smoke -- "item SoulFire"   # wiki only, no Twitch login
npm run dev                        # connects to Twitch chat
```

In your stream chat (or the channel listed in `TWITCH_CHANNELS`), try: `!eql help`

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

`TWITCH_CHANNELS` is the channel(s) to join — usually **your streamer login**, not the bot’s. Comma-separate for multiple.

### 6. Run locally

```bash
npm run dev
```

You should see a “Connected … as …” log. In that channel’s chat: `!eql item SoulFire`.

### 7. Deploy to Lightsail (same host as Chronicler)

Production runs on the Chronicler Lightsail box as a **separate** Compose stack (`~/EQL-twitch-bot`), not inside the berrybot compose file.

From your Mac (needs `~/.ssh/lightsail/berrybot.pem` + a filled local `.env`):

```bash
cd ~/projects/EQL-twitch-bot
npm run deploy
# or: bash scripts/deploy.sh
```

That rsyncs code, scp’s `.env`, and runs `docker compose up -d --build` on the server.

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
| `TWITCH_CHANNELS` | yes | Comma-separated channels to join |
| `TWITCH_PREFIX` | no | Default `!eql` |
| `TWITCH_COOLDOWN_MS` | no | Default `2500` between replies per channel |
| `DATA_DIR` | no | Default `./data` (Docker: `/app/data`) |
| `USAGE_DB_PATH` | no | Default `$DATA_DIR/usage.json` |

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
