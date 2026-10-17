// OEmt.club Update: SteamDB-style record updates for the games in games.json, posted to one Discord channel.
// Each post shows a game's Last Record Update, changelist, public build and the fields that changed,
// read straight from Steam (SteamDB does not allow scraping) with links to the matching SteamDB pages.
//   node index.js         stay online, check every POLL_MINUTES, serve /updates
//   node index.js --once  one check then exit (for a scheduler such as Task Scheduler or GitHub Actions)
//   node index.js --dry   print each game's current record, no Discord token needed
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
const { fetchRecords, diffRecords } = require('./steam-records');
const STATE_FILE = path.join(__dirname, 'state.json');
const DRY = process.argv.includes('--dry');
const ONCE = process.argv.includes('--once');

const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } };
const saveState = (state) => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const short = (v) => clip(String(v).replace(/\s+/g, ' '), 70);
const unix = () => Math.floor(Date.now() / 1000);

const BUILD_KEY = 'depots/branches/public/buildid';
const BUILD_TIME_KEY = 'depots/branches/public/timeupdated';

// SteamDB-style card: when the record changed, its changelist, the public build, and what changed.
// Without `before` it is a status card for a game seen for the first time.
function buildRecordEmbed(game, record, before) {
	const history = `https://steamdb.info/app/${game.appid}/history/?changeid=${record.changenumber}`;
	const build = record.values[BUILD_KEY];
	const builtAt = record.values[BUILD_TIME_KEY];
	const lines = [];
	if (before) lines.push(`**Last Record Update:** <t:${unix()}:f> (<t:${unix()}:R>)`);
	lines.push(`**Changelist:** [#${record.changenumber}](${history})`);
	if (before && before.values[BUILD_KEY] !== build) lines.push(`**Public build:** \`${before.values[BUILD_KEY] ?? 'none'}\` → \`${build}\`${builtAt ? `, pushed <t:${builtAt}:R>` : ''}`);
	else if (build) lines.push(`**Public build:** \`${build}\`${builtAt ? `, updated <t:${builtAt}:f>` : ''}`);

	if (before) {
		const changes = diffRecords(before.values, record.values);
		const rows = [];
		for (const c of changes) {
			if ('from' in c) rows.push(`- ${c.key}: ${short(c.from)}`);
			if ('to' in c) rows.push(`+ ${c.key}: ${short(c.to)}`);
		}
		let block = '';
		let shown = 0;
		for (const row of rows) {
			if (block.length + row.length > 3200) break;
			block += `${row}\n`;
			shown++;
		}
		if (shown < rows.length) block += `… ${rows.length - shown} more lines on SteamDB\n`;
		lines.push(changes.length ? `**Changes (${changes.length}):**\n\`\`\`diff\n${block}\`\`\`` : 'No field changes in the public record (Steam bumped the changelist only).');
	} else {
		lines.push('Now tracking this record. Every change from here gets its own post.');
	}

	return new EmbedBuilder()
		.setColor(game.color ?? games.DEFAULT_COLOR)
		.setAuthor({ name: game.name, url: `https://steamdb.info/app/${game.appid}/` })
		.setTitle(before ? 'Steam record updated' : 'Steam record')
		.setURL(history)
		.setDescription(lines.join('\n'))
		.setTimestamp()
		.setFooter({ text: 'OEmt.club Update · Steam app info' });
}

const post = (rest, embed) => rest.post(Routes.channelMessages(CHANNEL_ID), {
	body: {
		content: PING_ROLE_ID ? `<@&${PING_ROLE_ID}>` : undefined,
		embeds: [embed.toJSON()],
		allowed_mentions: { roles: PING_ROLE_ID ? [PING_ROLE_ID] : [] },
	},
});

// Compares each game's Steam record with the one saved last check and posts when the changelist moved.
// A game with no saved record (first run, or just added) gets a status card instead of a diff.
// Returns how many cards were posted.
async function checkRecords(rest, state) {
	const list = games.load();
	let records;
	try {
		records = await fetchRecords(list.map((g) => g.appid));
	} catch (e) {
		console.log(`::warning::Steam records not checked: ${e.message}`);
		return 0;
	}
	let posted = 0;
	state.records ??= {};
	for (const game of list) {
		const record = records[game.appid];
		if (!record) {
			console.log(`[${game.name}] Steam returned no public record`);
			continue;
		}
		const before = state.records[game.appid];
		if (before?.changenumber === record.changenumber) continue;
		try {
			await post(rest, buildRecordEmbed(game, record, before));
		} catch (e) {
			console.error(`[${game.name}] could not post record update: ${e.message}`);
			process.exitCode = 1; // --once runs show as failed (bad token, missing channel access)
			continue;
		}
		state.records[game.appid] = record;
		posted++;
		console.log(`[${game.name}] record ${before ? `${before.changenumber} -> ` : ''}${record.changenumber}`);
	}
	return posted;
}

const helpEmbed = () => new EmbedBuilder()
	.setColor(games.DEFAULT_COLOR)
	.setDescription([
		'📋 **Bot commands** (staff)',
		'`!addgame <name | Steam app ID | store link>` track a game',
		'`!removegame <name | app ID>` stop tracking a game',
		'`!games` list tracked games',
		'*Commands run at the next check. Your message is removed and the reply clears itself.*',
	].join('\n'));

// <t:…:R> counts down in every Discord client by itself, so nothing has to run between checks.
const timerEmbed = () => {
	const now = unix();
	const next = now + POLL_MINUTES * 60;
	return new EmbedBuilder()
		.setColor(games.DEFAULT_COLOR)
		.setDescription([
			`⏱️ **Next update check** <t:${next}:R> · <t:${next}:t>`,
			`Last check <t:${now}:R> · tracking ${games.load().map((g) => g.name).join(' · ')}`,
			'*GitHub can start a check a few minutes late.*',
		].join('\n'));
};

// The command guide and the countdown stay at the bottom of the channel, in that order. They are
// edited in place, and reposted below everything only when this check posted something.
async function updateFooter(rest, state, postedBelow) {
	const footer = [
		{ key: 'helpMessageId', body: { embeds: [helpEmbed().toJSON()] } },
		{ key: 'statusMessageId', body: { embeds: [timerEmbed().toJSON()] } },
	];
	if (!postedBelow && footer.every((m) => state[m.key])) {
		try {
			for (const m of footer) await rest.patch(Routes.channelMessage(CHANNEL_ID, state[m.key]), { body: m.body });
			return;
		} catch { /* one was deleted: repost both so the order holds */ }
	}
	for (const m of footer) {
		if (state[m.key]) await rest.delete(Routes.channelMessage(CHANNEL_ID, state[m.key])).catch(() => {});
		delete state[m.key];
	}
	for (const m of footer) {
		try {
			state[m.key] = (await rest.post(Routes.channelMessages(CHANNEL_ID), { body: m.body })).id;
		} catch (e) {
			console.error(`Could not post ${m.key.replace('MessageId', '')} message: ${e.message}`);
		}
	}
}

// Discord snowflake for a moment in time, so "messages after X" can start from a timestamp.
const snowflakeAt = (ms) => String((BigInt(ms) - 1420070400000n) << 22n);

async function runCommand(text, state) {
	const [, name, arg = ''] = text.trim().match(/^!(\w+)\s*([\s\S]*)$/) ?? [];
	switch (name?.toLowerCase()) {
		case 'addgame': {
			if (!arg) return 'Usage: `!addgame <game name | Steam app ID | store link>`';
			try {
				const { status, app } = await games.addGame(arg);
				if (status === 'exists') return `**${app.name}** is already tracked.`;
				const lines = [`Added **${app.name}** (\`${app.appid}\`). Its Steam record posts in <#${CHANNEL_ID}> now.`];
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
			delete state.records?.[game.appid]; // re-adding it later starts with a fresh status card
			return `Removed **${game.name}**.`;
		}
		case 'games': {
			const list = games.load();
			return `Tracking ${list.length} game${list.length === 1 ? '' : 's'}:\n${list.map((g) => `• [${g.name}](<https://steamdb.info/app/${g.appid}/>) (\`${g.appid}\`)`).join('\n')}\n\n\`!addgame <name>\` · \`!removegame <name>\``;
		}
		default:
			return null;
	}
}

// Bot replies to commands are temporary: each check deletes the ones left by earlier checks.
async function clearOldReplies(rest, state) {
	for (const { channel, id } of state.tempMessages ?? []) {
		await rest.delete(Routes.channelMessage(channel, id)).catch(() => {}); // already gone is fine
	}
	state.tempMessages = [];
}

// Commands typed since the last check. The first check starts an hour back, so commands typed
// before the bot ever ran still count. Needs the Message Content intent to read message text.
// The command message is deleted (needs Manage Messages) and the reply is removed next check,
// so the channel keeps only the record posts. Returns how many replies were posted.
async function handleCommands(rest, state) {
	await clearOldReplies(rest, state);
	const after = state.lastCommandId ?? snowflakeAt(Date.now() - 60 * 60_000);
	let messages;
	try {
		messages = await rest.get(Routes.channelMessages(COMMANDS_CHANNEL_ID), { query: new URLSearchParams({ after, limit: '50' }) });
	} catch (e) {
		console.error(`Could not read commands channel: ${e.message}`);
		return 0;
	}
	messages.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
	state.lastCommandId = messages.at(-1)?.id ?? after;
	let replies = 0;
	for (const msg of messages) {
		if (msg.author.bot || !msg.content?.startsWith('!')) continue;
		const reply = await runCommand(msg.content, state);
		if (!reply) continue;
		console.log(`[command] ${msg.author.username}: ${msg.content}`);
		await rest.delete(Routes.channelMessage(COMMANDS_CHANNEL_ID, msg.id))
			.catch((e) => console.error(`Could not delete command message (bot needs Manage Messages): ${e.message}`));
		try {
			// <@id> shows who asked without pinging them; the command it answers is already deleted.
			const sent = await rest.post(Routes.channelMessages(COMMANDS_CHANNEL_ID), {
				body: { content: `<@${msg.author.id}> ${reply}`, allowed_mentions: { parse: [] } },
			});
			state.tempMessages.push({ channel: COMMANDS_CHANNEL_ID, id: sent.id });
			replies++;
		} catch (e) {
			console.error(`Could not reply to command: ${e.message}`);
		}
	}
	return replies;
}

async function checkAll(rest) {
	const state = loadState();
	const replies = await handleCommands(rest, state);
	const cards = await checkRecords(rest, state);
	await updateFooter(rest, state, cards > 0 || (replies > 0 && COMMANDS_CHANNEL_ID === CHANNEL_ID));
	saveState(state);
}

async function dryRun() {
	const list = games.load();
	const records = await fetchRecords(list.map((g) => g.appid));
	for (const game of list) {
		const r = records[game.appid];
		if (!r) { console.log(`== ${game.name}: no public record`); continue; }
		const built = r.values[BUILD_TIME_KEY] ? new Date(r.values[BUILD_TIME_KEY] * 1000).toISOString() : '?';
		console.log(`== ${game.name} | changelist #${r.changenumber} | public build ${r.values[BUILD_KEY]} (${built}) | ${Object.keys(r.values).length} fields`);
		console.log(`   https://steamdb.info/app/${game.appid}/history/?changeid=${r.changenumber}`);
	}
}

const updatesCommand = new SlashCommandBuilder()
	.setName('updates')
	.setDescription("Show a game's current Steam record")
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
	if (ONCE) {
		await checkAll(rest);
		process.exit(); // the Steam connection can keep the event loop alive after logOff
	}

	const client = new Client({ intents: [GatewayIntentBits.Guilds] });

	client.once(Events.ClientReady, async (c) => {
		console.log(`Online as ${c.user.tag}, checking every ${POLL_MINUTES} min`);
		c.user.setActivity(games.load().map((g) => g.name).join(' · '), { type: ActivityType.Watching });
		await c.application.commands.set([updatesCommand.toJSON()]);

		let busy = false;
		const tick = async () => {
			if (busy) return;
			busy = true;
			try { await checkAll(rest); } finally { busy = false; }
		};
		await tick();
		setInterval(tick, POLL_MINUTES * 60_000);
	});

	client.on(Events.InteractionCreate, async (i) => {
		if (!i.isChatInputCommand() || i.commandName !== 'updates') return;
		const game = games.load().find((g) => String(g.appid) === i.options.getString('game'));
		await i.deferReply();
		try {
			const record = (await fetchRecords([game.appid]))[game.appid];
			await i.editReply(record ? { embeds: [buildRecordEmbed(game, record)] } : `Steam has no public record for ${game.name}.`);
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
