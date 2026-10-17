# OEmt.club Update bot

Posts official Steam patch notes for **Counter-Strike 2**, **Hood Warfare 2** and **Rust** to one Discord channel, and answers `/updates game:<name>` with the latest post.

Games live in `games.json` (Steam app ID + embed color). Add a line there to track another Steam game.

## Setup

1. Add the bot to your server (you must be the app owner, the bot is private):
   https://discord.com/oauth2/authorize?client_id=1560909992230649916&permissions=248832&scope=bot+applications.commands
2. Developer Portal > OEmt.club Update > Bot > **Reset Token**, copy it.
3. Copy `.env.example` to `.env`, paste the token into `DISCORD_TOKEN`, and set `CHANNEL_ID` (and `PING_ROLE_ID` if you want a role pinged).
4. `npm install`, then `npm start` (or double-click `start.bat`).

The first start posts the current latest update for each game. From then on, only new posts are sent to the channel.

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Stay online, check Steam every `POLL_MINUTES`, serve `/updates` |
| `npm run once` | Check once and exit (for Task Scheduler, cron or GitHub Actions) |
| `npm run dry` | Print the latest post per game; needs no token |

## Hosting

Discord does not run bots. This process has to run somewhere: your PC (online only while it is on), a VPS, or a scheduler running `npm run once`.

### GitHub Actions (current setup)

`.github/workflows/discord-updates.yml` runs `npm run once` every 10 minutes from `main` and keeps `state.json` in the Actions cache between runs. The bot shows offline and `/updates` does not answer in this mode; new patch notes are still posted.

Add these under **Settings > Secrets and variables > Actions > New repository secret**:

| Secret | Value |
| --- | --- |
| `DISCORD_TOKEN` | Bot token from the Developer Portal |
| `DISCORD_CHANNEL_ID` | ID of the channel to post in |
| `DISCORD_PING_ROLE_ID` | Optional: role to ping on each update |

Run it once by hand from **Actions > Discord game updates > Run workflow**. That first run posts the current latest update for each game; later runs post only new ones.
