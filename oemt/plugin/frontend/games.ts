// Game lifetime events from Steam, fanned out to the backend (session tracking) and to the UI
// (live session updates). Steam reports appid 0 for non-Steam shortcuts; the backend ignores those.
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

