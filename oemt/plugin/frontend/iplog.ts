// Drives the opt-in IP log: a check at startup, a repeating check every network.ip_check_minutes,
// and a check when a game starts. The backend decides whether logging is on; when it's off the
// calls return { skipped } without any lookup.
import { api } from './api';
import { onGameEvent } from './games';

let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

/** Views subscribe to refresh when a check finishes. */
export function onIpLogChanged(fn: () => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}
function changed() {
	listeners.forEach((fn) => {
		try {
			fn();
		} catch {
			/* ignore */
		}
	});
}

async function run(reason: 'startup' | 'auto', appid = '') {
	try {
		const r = await api.checkIp(reason, appid);
		if (!r.skipped) changed();
	} catch (err) {
		api.log('warn', 'ip_check_failed', String((err as Error)?.message ?? err));
	}
}

/** (Re)start the repeating check using the current setting. Safe to call again after settings change. */
export async function scheduleIpChecks() {
	if (timer) clearTimeout(timer);
	timer = undefined;
	let minutes = 30;
	try {
		const d = await api.ipLog(1);
		if (!d.enabled) return;
		minutes = d.check_minutes || 30;
	} catch {
		return;
	}
	const tick = () => {
		run('auto');
		timer = setTimeout(tick, minutes * 60_000);
	};
	timer = setTimeout(tick, minutes * 60_000);
}

export function startIpLogging(): () => void {
	run('startup');
	scheduleIpChecks();
	const stopGames = onGameEvent((e) => {
		if (!e.running || e.appid === 0) return;
		api.checkIp('session_start', String(e.appid)).then((r) => !r.skipped && changed(), () => undefined);
	});
	return () => {
		stopGames();
		if (timer) clearTimeout(timer);
		timer = undefined;
	};
}
