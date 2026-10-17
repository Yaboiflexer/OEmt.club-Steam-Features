// Steam's app info records (PICS): the data behind SteamDB's "Last Record Update" and history pages.
// SteamDB does not allow scraping, so this reads the same records from Steam directly, logged in anonymously.
const SteamUser = require('steam-user');

// { depots: { branches: { public: { buildid: 1 } } } } -> { 'depots/branches/public/buildid': '1' }
function flatten(obj, prefix = '', out = {}) {
	for (const [k, v] of Object.entries(obj)) {
		if (v !== null && typeof v === 'object') flatten(v, `${prefix}${k}/`, out);
		else out[`${prefix}${k}`] = String(v);
	}
	return out;
}

// appids -> { [appid]: { changenumber, values } }. Apps Steam hides from anonymous users are left out.
async function fetchRecords(appids, timeoutMs = 30_000) {
	const client = new SteamUser({ autoRelogin: false });
	client.on('error', () => {}); // a late disconnect after logOff is not worth crashing over
	try {
		await new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('Steam login timed out')), timeoutMs);
			client.once('loggedOn', () => { clearTimeout(timer); resolve(); });
			client.once('error', (e) => { clearTimeout(timer); reject(e); });
			client.logOn({ anonymous: true });
		});
		const { apps } = await client.getProductInfo(appids.map(Number), [], true);
		const records = {};
		for (const [id, app] of Object.entries(apps)) {
			if (app.appinfo) records[id] = { changenumber: app.changenumber, values: flatten(app.appinfo) };
		}
		return records;
	} finally {
		client.logOff();
	}
}

// Field-level differences between two flattened records, sorted by path.
function diffRecords(before, after) {
	const changes = [];
	for (const [key, to] of Object.entries(after)) {
		if (!(key in before)) changes.push({ key, to });
		else if (before[key] !== to) changes.push({ key, from: before[key], to });
	}
	for (const [key, from] of Object.entries(before)) if (!(key in after)) changes.push({ key, from });
	return changes.sort((a, b) => a.key.localeCompare(b.key));
}

module.exports = { fetchRecords, diffRecords };
