// The tracked games list (games.json) and the Steam lookups behind adding and removing games.
// Used by the bot, its Discord commands and add-game.js.
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, 'games.json');
const DEFAULT_COLOR = '#5865F2';

const load = () => JSON.parse(fs.readFileSync(FILE, 'utf8'));

// One game per line, matching the hand-written file.
const format = (games) => `[\n${games.map((g) => `  { ${Object.entries(g).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`).join(',\n')}\n]\n`;
const save = (games) => fs.writeFileSync(FILE, format(games));

async function getJson(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Steam answered HTTP ${res.status}`);
	return res.json();
}

const appIdOf = (q) => q.match(/\/app\/(\d+)/)?.[1] ?? (/^\d+$/.test(q) ? q : null);

// Name, app ID or store URL -> { name, appid, others }; `others` are runner-up search hits.
async function findApp(query) {
	const id = appIdOf(query);
	if (id) {
		const entry = (await getJson(`https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic`))[id];
		if (!entry?.success) throw new Error(`no Steam game has app ID ${id}`);
		return { name: entry.data.name, appid: Number(id), others: [] };
	}
	const { items = [] } = await getJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&cc=us&l=en`);
	const apps = items.filter((i) => i.type === 'app');
	if (!apps.length) throw new Error(`no Steam game matches "${query}"`);
	const hit = apps.find((i) => i.name.toLowerCase() === query.toLowerCase()) ?? apps[0];
	const others = apps.filter((i) => i !== hit).slice(0, 4).map((i) => ({ name: i.name, appid: i.id }));
	return { name: hit.name, appid: hit.id, others };
}

async function hasAnnouncements(appid) {
	const news = await getJson(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=1&maxlength=1&feeds=steam_community_announcements`);
	return Boolean(news.appnews?.newsitems?.length);
}

async function addGame(query, color = DEFAULT_COLOR) {
	const games = load();
	const app = await findApp(query.trim());
	if (games.some((g) => g.appid === app.appid)) return { status: 'exists', app };
	games.push({ name: app.name, appid: app.appid, color });
	save(games);
	return { status: 'added', app, announced: await hasAnnouncements(app.appid) };
}

// Matches app ID, exact name, or a name fragment that fits exactly one tracked game.
function removeGame(query) {
	const games = load();
	const q = query.trim().toLowerCase();
	const id = appIdOf(q);
	let i = games.findIndex((g) => (id ? String(g.appid) === id : g.name.toLowerCase() === q));
	if (i < 0 && !id) {
		const partial = games.flatMap((g, at) => (g.name.toLowerCase().includes(q) ? [at] : []));
		if (partial.length === 1) i = partial[0];
	}
	if (i < 0) return { status: 'missing' };
	const [game] = games.splice(i, 1);
	save(games);
	return { status: 'removed', game };
}

module.exports = { load, addGame, removeGame, DEFAULT_COLOR };
