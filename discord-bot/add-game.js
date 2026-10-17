// Add a Steam game from the command line (Discord's !addgame does the same):
//   npm run add-game -- "apex legends"
//   npm run add-game -- 252490
//   npm run add-game -- https://store.steampowered.com/app/730/ --color "#DE9B35"
const { addGame, DEFAULT_COLOR } = require('./games');

const args = process.argv.slice(2);
const colorAt = args.indexOf('--color');
const color = colorAt >= 0 ? args.splice(colorAt, 2)[1] : DEFAULT_COLOR;
const query = args.join(' ').trim();

async function main() {
	if (!query) {
		console.error('Usage: npm run add-game -- "<game name | Steam app ID | store URL>" [--color "#RRGGBB"]');
		process.exit(1);
	}
	if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`--color must look like #RRGGBB, got "${color}"`);

	const { status, app } = await addGame(query, color);
	if (status === 'exists') return console.log(`${app.name} (${app.appid}) is already tracked.`);
	console.log(`Added ${app.name} (${app.appid}). Its Steam record posts on the next check.`);
	if (app.others.length) console.log(`Not the right game? Remove it and add by app ID: ${app.others.map((o) => `${o.name} (${o.appid})`).join(', ')}`);
}

main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
