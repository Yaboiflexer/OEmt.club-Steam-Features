// OEmt.club Update: posts official Steam announcements for the games in games.json to one Discord channel.
//   node index.js         stay online, poll Steam every POLL_MINUTES, serve /updates
//   node index.js --once  one check then exit (for a scheduler such as Task Scheduler or GitHub Actions)
//   node index.js --dry   print the latest post per game, no Discord token needed
// Each check also runs !addgame / !removegame / !games typed in the commands channel since the last check.
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, Events, ActivityType, SlashCommandBuilder } = require('discord.js');

try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* no .env: rely on real environment variables */ }

// Pasted secrets often carry a trailing newline, quotes or a "Bot " prefix; any of those breaks the auth header.
const clean = (v) => (v ?? '').trim().replace(/^["']|["']$/g, '').trim();
const DISCORD_TOKEN = clean(process.env.DISCORD_TOKEN).replace(/^Bot\s+/i, '');
const CHANNEL_ID = clean(process.env.CHANNEL_ID);
const PING_ROLE_ID = clean(process.env.PING_ROLE_ID);
// Anyone who can type here can change the games list, so keep it a staff-only channel.
const COMMANDS_CHANNEL_ID = clean(process.env.COMMANDS_CHANNEL_ID) || CHANNEL_ID;
const POLL_MINUTES = Number(process.env.POLL_MINUTES) || 10;
const games = require('./games');
const STATE_FILE = path.join(__dirname, 'state.json');
const DRY = process.argv.includes('--dry');
const ONCE = process.argv.includes('--once');

const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } };
const saveState = (state) => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

// Only the developer's own announcements (patch notes), not press articles Steam also aggregates.
async function fetchNews(game, count = 5) {
	const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${game.appid}&count=${count}&maxlength=0&feeds=steam_community_announcements`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Steam news for ${game.name}: HTTP ${res.status}`);
	const data = await res.json();
	return data.appnews?.newsitems ?? [];
}

// Store header art lives under a hashed path that changes with each art update, so ask the store for it.
const headers = new Map();
async function headerImage(game) {
	if (!headers.has(game.appid)) {
		try {
			const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${game.appid}&filters=basic`);
			headers.set(game.appid, (await res.json())[game.appid]?.data?.header_image ?? null);
		} catch {
			return null;
		}
	}
	return headers.get(game.appid);
}

const CLAN_IMAGE = 'https://clan.akamai.steamstatic.com/images';

function firstImage(raw) {
	const m = raw.match(/\[img src="([^"]+)"/i) || raw.match(/\[img\]([\s\S]*?)\[\/img\]/i) || raw.match(/<img[^>]+src="([^"]+)"/i);
	return m ? m[1].replace('{STEAM_CLAN_IMAGE}', CLAN_IMAGE) : null;
}

// Steam posts are BBCode (sometimes HTML); turn them into Discord markdown.
function toMarkdown(raw) {
	return raw
		.replace(/\[img[^\]]*\][\s\S]*?\[\/img\]|\[img[^\]]*\]/gi, '')
		.replace(/\[(previewyoutube|video)[^\]]*\][\s\S]*?\[\/\1\]/gi, '')
		.replace(/\[url=["']?([^\]"']+)["']?\]([\s\S]*?)\[\/url\]/gi, '[$2]($1)')
		.replace(/\[h[1-6]\]([\s\S]*?)\[\/h[1-6]\]/gi, '\n**$1**\n')
		.replace(/\[\/?(b|strong)\]/gi, '**')
		.replace(/\[\/?(i|em)\]/gi, '*')
		.replace(/\[\*\]/g, '• ')
		.replace(/\[\/\*\]/g, '')
		.replace(/\[\/(p|list|olist)\]/gi, '\n')
		.replace(/\[\/?[a-z0-9]+(=[^\]]*)?\]/gi, '')
		.replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n')
		.replace(/<li>/gi, '• ')
		.replace(/<[^>]+>/g, '')
		.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
		.replace(/\\([[\]])/g, '$1')
		.replace(/\*{4,}/g, '**')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n\n(?=• )/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

async function buildEmbed(game, item) {
	const link = `https://store.steampowered.com/news/app/${game.appid}/view/${item.gid}`;
	const body = clip(toMarkdown(item.contents), 1500);
	return new EmbedBuilder()
		.setColor(game.color ?? games.DEFAULT_COLOR)
		.setAuthor({ name: game.name, url: `https://store.steampowered.com/app/${game.appid}` })
		.setTitle(clip(item.title, 256))
		.setURL(link)
		.setDescription(`${body}\n\n[Read the full post on Steam](${link})`)
		.setImage(firstImage(item.contents) ?? (await headerImage(game)))
		.setTimestamp(item.date * 1000)
		.setFooter({ text: 'OEmt.club Update' });
}

async function buildMessage(game, item) {
	return {
		content: PING_ROLE_ID ? `<@&${PING_ROLE_ID}>` : undefined,
		embeds: [(await buildEmbed(game, item)).toJSON()],
		allowed_mentions: { roles: PING_ROLE_ID ? [PING_ROLE_ID] : [] },
	};
}

// Discord snowflake for a moment in time, so "messages after X" can start from a timestamp.
const snowflakeAt = (ms) => String((BigInt(ms) - 1420070400000n) << 22n);

async function runCommand(text, state) {
	const [, name, arg = ''] = text.trim().match(/^!(\w+)\s*([\s\S]*)$/) ?? [];
	switch (name?.toLowerCase()) {
		case 'addgame': {
			if (!arg) return 'Usage: `!addgame <game name | Steam app ID | store link>`';
			try {
				const { status, app, announced } = await games.addGame(arg);
				if (status === 'exists') return `**${app.name}** is already tracked.`;
				const lines = [`Added **${app.name}** (\`${app.appid}\`). Its latest update posts in <#${CHANNEL_ID}> now.`];
				if (!announced) lines.push(`It has no official Steam announcements yet, so nothing posts until it does.`);
				if (app.others.length) lines.push(`Wrong game? \`!removegame ${app.appid}\`, then \`!addgame <app ID>\` with one of: ${app.others.map((o) => `${o.name} (\`${o.appid}\`)`).join(', ')}`);
				return lines.join('\n');
			} catch (e) {
				return `Couldn't add that: ${e.message}.`;
			}
		}
		case 'removegame': {
			if (!arg) return 'Usage: `!removegame <game name | Steam app ID>`';
			const { status, game } = games.removeGame(arg);
			if (status !== 'removed') return `No tracked game matches "${arg}". \`!games\` lists them.`;
			delete state[game.appid]; // re-adding it later posts its latest update again
			return `Removed **${game.name}**.`;
		}
		case 'games': {
			const list = games.load();
			return `Tracking ${list.length} game${list.length === 1 ? '' : 's'}:\n${list.map((g) => `• ${g.name} (\`${g.appid}\`)`).join('\n')}\n\n\`!addgame <name>\` · \`!removegame <name>\``;
		}
		default:
			return null;
	}
}

// Commands typed since the last check. The first check starts an hour back, so commands typed
// before the bot ever ran still count. Needs the Message Content intent to read message text.
async function handleCommands(rest, state) {
	const after = state.lastCommandId ?? snowflakeAt(Date.now() - 60 * 60_000);
	let messages;
	try {
		messages = await rest.get(Routes.channelMessages(COMMANDS_CHANNEL_ID), { query: new URLSearchParams({ after, limit: '50' }) });
	} catch (e) {
		console.error(`Could not read commands channel: ${e.message}`);
		return;
	}
	messages.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
	state.lastCommandId = messages.at(-1)?.id ?? after;
	for (const msg of messages) {
		if (msg.author.bot || !msg.content?.startsWith('!')) continue;
		const reply = await runCommand(msg.content, state);
		if (!reply) continue;
		console.log(`[command] ${msg.author.username}: ${msg.content}`);
		await rest.post(Routes.channelMessages(COMMANDS_CHANNEL_ID), {
			body: { content: reply, message_reference: { message_id: msg.id, fail_if_not_exists: false }, allowed_mentions: { parse: [] } },
		}).catch((e) => console.error(`Could not reply to command: ${e.message}`));
	}
}

// State is the newest post date seen per game. A game with no state gets only its latest post,
// so the first start (or a newly added game) shows the current patch without flooding the channel.
async function checkAll(rest, send) {
	const state = loadState();
	await handleCommands(rest, state);
	for (const game of games.load()) {
		let items;
		try {
			items = await fetchNews(game);
		} catch (e) {
			console.error(e.message);
			continue;
		}
		if (!items.length) continue;
		const seen = state[game.appid] ?? Math.max(...items.map((i) => i.date)) - 1;
		const fresh = items.filter((i) => i.date > seen).sort((a, b) => a.date - b.date);
		for (const item of fresh) {
			try {
				await send(game, item);
			} catch (e) {
				console.error(`[${game.name}] could not post "${item.title}": ${e.message}`);
				process.exitCode = 1; // --once runs show as failed (bad token, missing channel access)
				break;
			}
			state[game.appid] = item.date;
			console.log(`[${game.name}] posted "${item.title}"`);
		}
	}
	saveState(state);
}

async function dryRun() {
	for (const game of games.load()) {
		const [item] = await fetchNews(game, 1);
		if (!item) { console.log(`== ${game.name}: no posts`); continue; }
		const embed = (await buildEmbed(game, item)).toJSON();
		console.log(`== ${game.name} | ${embed.title}\n${embed.url}\nimage: ${embed.image?.url}\n${clip(embed.description, 400)}\n`);
	}
}

const updatesCommand = new SlashCommandBuilder()
	.setName('updates')
	.setDescription('Show the latest official update for a game')
	.addStringOption((o) => o
		.setName('game')
		.setDescription('Which game')
		.setRequired(true)
		.addChoices(...games.load().slice(0, 25).map((g) => ({ name: g.name, value: String(g.appid) }))));

async function main() {
	if (DRY) return dryRun();
	if (!DISCORD_TOKEN || !CHANNEL_ID) {
		console.error('Set DISCORD_TOKEN and CHANNEL_ID in discord-bot/.env (copy .env.example).');
		process.exit(1);
	}

	const rest = new REST().setToken(DISCORD_TOKEN);
	const send = async (game, item) => rest.post(Routes.channelMessages(CHANNEL_ID), { body: await buildMessage(game, item) });
	if (ONCE) return checkAll(rest, send);

	const client = new Client({ intents: [GatewayIntentBits.Guilds] });

	client.once(Events.ClientReady, async (c) => {
		console.log(`Online as ${c.user.tag}, checking Steam every ${POLL_MINUTES} min`);
		c.user.setActivity(games.load().map((g) => g.name).join(' · '), { type: ActivityType.Watching });
		await c.application.commands.set([updatesCommand.toJSON()]);

		let busy = false;
		const tick = async () => {
			if (busy) return;
			busy = true;
			try { await checkAll(rest, send); } finally { busy = false; }
		};
		await tick();
		setInterval(tick, POLL_MINUTES * 60_000);
	});

	client.on(Events.InteractionCreate, async (i) => {
		if (!i.isChatInputCommand() || i.commandName !== 'updates') return;
		const game = games.load().find((g) => String(g.appid) === i.options.getString('game'));
		await i.deferReply();
		try {
			const [item] = await fetchNews(game, 1);
			await i.editReply(item ? { embeds: [await buildEmbed(game, item)] } : `No posts found for ${game.name}.`);
		} catch {
			await i.editReply('Steam did not answer. Try again in a minute.');
		}
	});

	await client.login(DISCORD_TOKEN);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
