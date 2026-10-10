// Live integration state (Discord Rich Presence, now playing) shared by every view, with one timer:
// a slow background tick keeps Discord's status current and reconnects after Discord restarts, and a
// fast tick runs while a visible view shows the live state. Requests never overlap.
import { useEffect, useState } from 'react';
import { api, LiveStatus, MediaAction } from './api';

const SLOW_MS = 15_000;
const FAST_MS = 4_000;

type Listener = () => void;
let status: LiveStatus | undefined;
let lastError: string | undefined;
const listeners = new Set<Listener>();
let visibleViewers = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let inflight: Promise<void> | undefined;

function emit() {
	listeners.forEach((fn) => {
		try {
			fn();
		} catch {
			/* ignore */
		}
	});
}

/** Ask the backend for fresh state. Concurrent callers share one request. */
export function refresh(): Promise<void> {
	if (inflight) return inflight;
	inflight = api.integrationTick().then(
		(s) => {
			status = s;
			lastError = undefined;
		},
		(e) => {
			lastError = String(e?.message ?? e);
		},
	).finally(() => {
		inflight = undefined;
		emit();
	});
	return inflight;
}

function schedule() {
	if (!running) return;
	clearTimeout(timer);
	timer = setTimeout(() => refresh().finally(schedule), visibleViewers > 0 ? FAST_MS : SLOW_MS);
}

/** Start the background tick (plugin start). Safe to call twice. */
export function start() {
	if (running) return;
	running = true;
	refresh().finally(schedule);
}

export function stop() {
	running = false;
	clearTimeout(timer);
}

export const getStatus = () => status;
export const getError = () => lastError;

/** Live state for a view; `visible` switches the shared timer to the fast rate while it's on screen. */
export function useLive(visible: boolean): { status?: LiveStatus; error?: string } {
	const [, force] = useState(0);
	useEffect(() => {
		const fn = () => force((n) => n + 1);
		listeners.add(fn);
		return () => {
			listeners.delete(fn);
		};
	}, []);
	useEffect(() => {
		if (!visible) return;
		visibleViewers++;
		refresh().finally(schedule);
		return () => {
			visibleViewers--;
			schedule();
		};
	}, [visible]);
	return { status, error: lastError };
}

/** Media key, then re-read the title shortly after (players update their window title a moment later). */
export async function media(action: MediaAction): Promise<void> {
	await api.mediaControl(action);
	setTimeout(() => refresh(), 600);
}

export async function discordTest(): Promise<void> {
	status = await api.discordTest();
	emit();
}
