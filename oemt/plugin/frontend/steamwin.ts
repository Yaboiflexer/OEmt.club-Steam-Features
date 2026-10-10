// Finding and driving Steam's main window ("SP Desktop_uid0").
//
// Why this exists: at startup Steam shows its sign-in window first and creates the main window a few
// seconds later (also after every account switch, since Steam restarts). Millennium's Navigation.Navigate
// targets the *focused* window, so navigating on a fixed timer hit no window at all and OEmt never opened
// ("Navigation interface could not find a window to navigate" in Steam's webhelper_js log).
//
// This module waits for the main window and navigates that window directly. It never opens a window.
// Steam objects are passed in (see index.tsx), which keeps this file free of `millennium` imports so it
// can be unit-tested with fakes.

export const MAIN_WINDOW_NAME = 'SP Desktop_uid0';

interface Popup { m_popup?: { window?: Window } }
export interface PopupManagerLike { GetExistingPopup(name: string): Popup | undefined }
export interface WindowRouterLike { BrowserWindow?: { name?: string }; Navigate(path: string): void }

export interface SteamWinDeps {
	popupManager(): PopupManagerLike | undefined;
	/** Router.WindowStore.SteamUIWindows */
	uiWindows(): WindowRouterLike[] | undefined;
	/** Millennium's Navigation.Navigate, used only when the main window's router can't be found. */
	fallbackNavigate?(path: string): void;
	setTimer?(fn: () => void, ms: number): unknown;
}

export type NavResult = 'main_window' | 'fallback' | 'no_window';

export function createSteamWin(deps: SteamWinDeps) {
	const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));

	function mainWindow(): Window | undefined {
		try {
			return deps.popupManager()?.GetExistingPopup(MAIN_WINDOW_NAME)?.m_popup?.window ?? undefined;
		} catch {
			return undefined;
		}
	}

	function mainRouter(): WindowRouterLike | undefined {
		try {
			return deps.uiWindows()?.find((w) => w?.BrowserWindow?.name === MAIN_WINDOW_NAME);
		} catch {
			return undefined;
		}
	}

	/** Navigate Steam's main window. Never opens a window; reports what it did. */
	function navigateMain(path: string): NavResult {
		const r = mainRouter();
		if (r) {
			try {
				r.Navigate(path);
				return 'main_window';
			} catch {
				/* fall through */
			}
		}
		if (mainWindow() && deps.fallbackNavigate) {
			try {
				deps.fallbackNavigate(path);
				return 'fallback';
			} catch {
				/* fall through */
			}
		}
		return 'no_window';
	}

	/** Resolves with the main window once it exists, or undefined after `timeoutMs`. */
	function whenMainWindow(timeoutMs = 120_000, pollMs = 250): Promise<Window | undefined> {
		return new Promise((resolve) => {
			const started = Date.now();
			const check = () => {
				const w = mainWindow();
				if (w) return resolve(w);
				if (Date.now() - started >= timeoutMs) return resolve(undefined);
				setTimer(check, pollMs);
			};
			check();
		});
	}

	/**
	 * Open `path` in the main window once it exists. Steam navigates to its own start page while it boots,
	 * which can override an early navigation, so `isShown()` is checked afterwards and the navigation is
	 * repeated (up to `attempts` times).
	 */
	async function openWhenReady(
		path: string,
		isShown: () => boolean,
		opts: { settleMs?: number; verifyMs?: number; attempts?: number; timeoutMs?: number } = {},
	): Promise<{ ok: boolean; reason: string; attempts: number; via?: NavResult }> {
		const { settleMs = 1500, verifyMs = 1500, attempts = 3, timeoutMs } = opts;
		const w = await whenMainWindow(timeoutMs);
		if (!w) return { ok: false, reason: 'no_main_window', attempts: 0 };
		const sleep = (ms: number) => new Promise<void>((r) => setTimer(r, ms));
		await sleep(settleMs);
		let via: NavResult = 'no_window';
		for (let i = 1; i <= attempts; i++) {
			via = navigateMain(path);
			if (via === 'no_window') return { ok: false, reason: 'no_window', attempts: i, via };
			await sleep(verifyMs);
			if (isShown()) return { ok: true, reason: 'ok', attempts: i, via };
		}
		return { ok: false, reason: 'not_shown', attempts, via };
	}

	return { mainWindow, mainRouter, navigateMain, whenMainWindow, openWhenReady };
}

export type SteamWin = ReturnType<typeof createSteamWin>;
