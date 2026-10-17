// How regularly GitHub actually fires the scheduled check (cron asks for every 10 minutes).
//   npm run stats                  since tracking started
//   npm run stats -- <ISO time>    since another point, e.g. 2026-10-18T00:00:00Z
const REPO = 'Yaboiflexer/OEmt.club-Steam-Features';
const WORKFLOW = 'discord-updates.yml';
const TRACKING_START = '2026-10-17T07:25:21Z';
const INTERVAL_MIN = 10;

const since = process.argv[2] ?? TRACKING_START;

async function fetchScheduledRuns() {
	const runs = [];
	for (let page = 1; ; page++) {
		const url = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?event=schedule&created=%3E%3D${since}&per_page=100&page=${page}`;
		const res = await fetch(url, {
			headers: {
				Accept: 'application/vnd.github+json',
				'User-Agent': 'oemt-update-bot',
				...(process.env.GITHUB_TOKEN && { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }),
			},
		});
		if (!res.ok) throw new Error(`GitHub API: HTTP ${res.status}`);
		const { workflow_runs: batch } = await res.json();
		runs.push(...batch);
		if (batch.length < 100) return runs;
	}
}

const minutes = (ms) => ms / 60_000;
const fmt = (n) => `${n.toFixed(1)} min`;

async function main() {
	const runs = await fetchScheduledRuns();
	const times = runs.map((r) => Date.parse(r.created_at)).sort((a, b) => a - b);
	const elapsed = minutes(Date.now() - Date.parse(since));
	const expected = Math.floor(elapsed / INTERVAL_MIN);
	const failed = runs.filter((r) => r.conclusion === 'failure').length;

	console.log(`Scheduled runs since ${since} (${(elapsed / 60).toFixed(1)} h ago)`);
	console.log(`  runs:      ${times.length} of ~${expected} asked for (${expected ? Math.round((times.length / expected) * 100) : 0}%)`);
	console.log(`  failed:    ${failed}`);
	if (times.length) console.log(`  last run:  ${fmt(minutes(Date.now() - times.at(-1)))} ago`);
	if (times.length < 2) {
		console.log('  gaps:      need at least 2 scheduled runs');
		return;
	}

	const gaps = times.slice(1).map((t, i) => minutes(t - times[i])).sort((a, b) => a - b);
	const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
	console.log(`  avg gap:   ${fmt(avg)}`);
	console.log(`  median:    ${fmt(gaps[Math.floor(gaps.length / 2)])}`);
	console.log(`  min / max: ${fmt(gaps[0])} / ${fmt(gaps.at(-1))}`);
}

main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
