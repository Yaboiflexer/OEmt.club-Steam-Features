# OEmt.club Update bot

Posts SteamDB-style record updates for the games in `games.json` (Counter-Strike 2, Hood Warfare 2 and Rust to start) to one Discord channel. Games are added and removed from Discord.

Each post shows the game's **Last Record Update**, its **changelist** (linked to that change on SteamDB), the **public build** (old → new when it moved) and a diff of every field that changed in the record: builds, branches, depots and so on. That is the same data SteamDB's history page shows. SteamDB does not allow scraping, so the bot reads the records from Steam itself (PICS, anonymous login through `steam-user`) and links to SteamDB for the full view.

A game seen for the first time (first run, or just added) gets one status card with its current changelist and build. After that, only changes post.

## Managing games from Discord

Type these in the commands channel (the updates channel unless `DISCORD_COMMANDS_CHANNEL_ID` is set). Anyone who can type there can use them, so keep it staff-only.

| Command | What it does |
| --- | --- |
| `!addgame <name, Steam app ID or store link>` | Track a Steam game. Its status card posts right away. |
| `!removegame <name or app ID>` | Stop tracking a game. Part of the name is enough if it matches one game. |
| `!games` | List tracked games. |

The bot reads commands on each check, so it replies within one check (about 10 minutes on GitHub Actions). Changes are committed to `games.json` automatically. Reading commands needs **Message Content Intent** on in the Developer Portal (Bot page).

From a terminal, `npm run add-game -- "<name>"` does the same as `!addgame`.

## Setup

1. Add the bot to your server (you must be the app owner, the bot is private):
   https://discord.com/oauth2/authorize?client_id=1560909992230649916&permissions=248832&scope=bot+applications.commands
2. Developer Portal > OEmt.club Update > Bot > **Reset Token**, copy it.
3. Copy `.env.example` to `.env`, paste the token into `DISCORD_TOKEN`, and set `CHANNEL_ID` (and `PING_ROLE_ID` if you want a role pinged).
4. `npm install`, then `npm start` (or double-click `start.bat`).

The first start posts a status card for each game. From then on, only record changes are sent to the channel.

## npm scripts

| Script | What it does |
| --- | --- |
| `npm start` | Stay online, check Steam every `POLL_MINUTES`, serve `/updates` (current record card) |
| `npm run once` | Check once and exit (for Task Scheduler, cron or GitHub Actions) |
| `npm run dry` | Print each game's current changelist and build; needs no token |
| `npm run add-game -- "<name>"` | Add a game to `games.json` |
| `npm run stats` | How often GitHub actually ran the scheduled check |

## Hosting

Discord does not run bots. This process has to run somewhere: your PC (online only while it is on), a VPS, or a scheduler running `npm run once`.

### GitHub Actions (current setup)

`.github/workflows/discord-updates.yml` runs `npm run once` every 10 minutes from `main`, keeps `state.json` in the Actions cache between runs, and commits `games.json` when Discord commands change it. The bot shows offline and `/updates` does not answer in this mode; record posts and `!` commands still work.

Add these under **Settings > Secrets and variables > Actions > New repository secret**:

| Secret | Value |
| --- | --- |
| `DISCORD_TOKEN` | Bot token from the Developer Portal |
| `DISCORD_CHANNEL_ID` | ID of the channel to post in |
| `DISCORD_PING_ROLE_ID` | Optional: role to ping on each update |
| `DISCORD_COMMANDS_CHANNEL_ID` | Optional: separate staff channel for `!` commands |

Run it once by hand from **Actions > Discord game updates > Run workflow**. That first run posts a status card for each game; later runs post only record changes.
