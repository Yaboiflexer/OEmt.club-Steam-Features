// Game lifetime events from Steam, fanned out to the backend (session tracking) and to the UI
// (launch confirmation). Steam reports appid 0 for non-Steam shortcuts; the backend ignores those.
import { api } from './api';

export interface LifetimeEvent { appid: number; instance: number; running: boolean }
type Listener = (e: LifetimeEvent) => void;

const listeners = new Set<Listener>();

export function onGameEvent(fn: Listener): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

export function startLifetimeTracking(): () => void {
	const reg = SteamClient.GameSessions.RegisterForAppLifetimeNotifications((n) => {
		const e = { appid: n.unAppID, instance: n.nInstanceID, running: n.bRunning };
		api.sessionEvent(e.appid, e.instance, e.running).catch((err) => api.log('warn', 'session_event_failed', String(err?.message ?? err)));
		listeners.forEach((fn) => {
			try {
				fn(e);
			} catch {
				/* a broken listener must not stop the others */
			}
		});
	});
	return () => reg.unregister();
}

export const NO_START_TIMEOUT_MS = 60_000;

export type LaunchResult = { ok: true; warning?: string } | { ok: false; reason: string };

/**
 * Validate with the backend, ask Steam to launch, and record the outcome. Steam performs the launch;
 * OEmt only records "started" if Steam reports the game running within 60 s, else "no_start_detected".
 */
export async function launchGame(appid: string, onStarted?: () => void): Promise<LaunchResult> {
	const check = await api.prepareLaunch(appid);
	if (!check.allowed || !check.url) return { ok: false, reason: check.reason ?? 'Launch was refused' };

	let settled = false;
	const stop = onGameEvent((e) => {
		if (settled || !e.running || String(e.appid) !== appid) return;
		settled = true;
		clearTimeout(timer);
		stop();
		api.recordLaunch(appid, 'started').catch(() => undefined);
		onStarted?.();
	});
	const timer = setTimeout(() => {
		if (settled) return;
		settled = true;
		stop();
		api.recordLaunch(appid, 'no_start_detected', `no lifetime start within ${NO_START_TIMEOUT_MS / 1000}s`).catch(() => undefined);
	}, NO_START_TIMEOUT_MS);

	try {
		SteamClient.URL.ExecuteSteamURL(check.url);
	} catch (err) {
		settled = true;
		clearTimeout(timer);
		stop();
		const reason = String((err as Error)?.message ?? err);
		api.recordLaunch(appid, 'failed', reason).catch(() => undefined);
		return { ok: false, reason: `Steam refused the launch: ${reason}` };
	}
	api.recordLaunch(appid, 'requested').catch(() => undefined);
	return { ok: true, warning: check.warning };
}
