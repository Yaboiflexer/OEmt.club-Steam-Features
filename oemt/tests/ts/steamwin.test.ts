import { describe, expect, test } from 'bun:test';
import { createSteamWin, MAIN_WINDOW_NAME, WindowRouterLike } from '../../plugin/frontend/steamwin';

/** Fake Steam: a login window first, the main window appears later. Timers run instantly. */
function fakeSteam() {
	const navigated: string[] = [];
	const fallbackNav: string[] = [];
	const env = {
		popups: new Map<string, { m_popup: { window: Window } }>(),
		windows: [] as WindowRouterLike[],
		opened: 0,
		ticks: 0,
	};
	env.popups.set('SP DesktopLoginWindow_uid0', { m_popup: { window: {} as Window } });
	const showMain = () => {
		env.popups.set(MAIN_WINDOW_NAME, { m_popup: { window: { document: {} } as unknown as Window } });
		env.windows.push({ BrowserWindow: { name: MAIN_WINDOW_NAME }, Navigate: (p) => navigated.push(p) });
	};
	const win = createSteamWin({
		popupManager: () => ({ GetExistingPopup: (n: string) => env.popups.get(n) }),
		uiWindows: () => env.windows,
		fallbackNavigate: (p) => fallbackNav.push(p),
		setTimer: (fn) => {
			env.ticks++;
			setTimeout(fn, 0);
			return 0;
		},
	});
	return { env, win, navigated, fallbackNav, showMain };
}

describe('main window', () => {
	test('navigation waits for the main window instead of hitting the sign-in window', async () => {
		const s = fakeSteam();
		expect(s.win.mainWindow()).toBeUndefined();
		expect(s.win.navigateMain('/oemt/home')).toBe('no_window');
		expect(s.navigated).toEqual([]);
		expect(s.fallbackNav).toEqual([], 'never navigates the focused/sign-in window');
		const p = s.win.whenMainWindow(10_000, 1);
		setTimeout(s.showMain, 5);
		expect(await p).toBeDefined();
		expect(s.win.navigateMain('/oemt/home')).toBe('main_window');
		expect(s.navigated).toEqual(['/oemt/home']);
	});

	test('openWhenReady opens the page once and reports success', async () => {
		const s = fakeSteam();
		s.showMain();
		let shown = false;
		const r = await s.win.openWhenReady('/oemt/accounts', () => {
			shown = s.navigated.length > 0;
			return shown;
		}, { settleMs: 0, verifyMs: 0 });
		expect(r).toMatchObject({ ok: true, reason: 'ok', attempts: 1, via: 'main_window' });
		expect(s.navigated).toEqual(['/oemt/accounts']);
	});

	test('retries when Steam replaces the page with its own start page, then gives up', async () => {
		const s = fakeSteam();
		s.showMain();
		let checks = 0;
		const r = await s.win.openWhenReady('/oemt/home', () => ++checks >= 2, { settleMs: 0, verifyMs: 0 });
		expect(r).toMatchObject({ ok: true, attempts: 2 });
		const r2 = await s.win.openWhenReady('/oemt/home', () => false, { settleMs: 0, verifyMs: 0, attempts: 3 });
		expect(r2).toMatchObject({ ok: false, reason: 'not_shown', attempts: 3 });
	});

	test('reports no_main_window when Steam never opens it, and never opens a window itself', async () => {
		const s = fakeSteam();
		const r = await s.win.openWhenReady('/oemt/home', () => true, { timeoutMs: 0, settleMs: 0, verifyMs: 0 });
		expect(r).toMatchObject({ ok: false, reason: 'no_main_window', attempts: 0 });
		expect(s.navigated).toEqual([]);
		expect(s.env.popups.has(MAIN_WINDOW_NAME)).toBe(false);
	});

	test('falls back to Millennium navigation only when the main window exists but its router is unknown', () => {
		const s = fakeSteam();
		s.env.popups.set(MAIN_WINDOW_NAME, { m_popup: { window: {} as Window } });
		expect(s.win.navigateMain('/oemt/settings')).toBe('fallback');
		expect(s.fallbackNav).toEqual(['/oemt/settings']);
	});
});
