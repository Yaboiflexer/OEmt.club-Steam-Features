// OEmt.club plugin entry. Mounts the OEmt shell in Steam's main window (route /oemt/:tab?/:sub?), puts
// OEmt items into Steam's top bar (or a fallback strip), opens the start page once the main window
// exists, and tracks game lifetimes for sessions. No extra windows are ever opened.
import { FC, useEffect, useState } from 'react';
import { definePlugin, Navigation, Router, routerHook, useParams } from 'millennium';
import { api } from './api';
import { startLifetimeTracking } from './games';
import { startIpLogging } from './iplog';
import * as live from './liveStore';
import { openWeb } from './web';
import { NowPlayingCard } from './views/NowPlaying';
import { getCurrentTab, getIntegration, openPath, requestTab, setIntegration, setPathNavigator, subscribeNav } from './nav';
import { DEFAULT_TAB, OEMT_ROUTE, OEMT_ROUTE_PATTERN, resolveRoute, routeToPath, startTarget } from './routes';
import { createSteamWin, PopupManagerLike, WindowRouterLike } from './steamwin';
import { getTopbarItems, parseTopbar, startTopbar } from './topbar';
import { Logo, Shell } from './shell';
import { CSS } from './styles';
import { ErrorBoundary, Pill, useAsync } from './ui';

export { OEMT_ROUTE };

const steamwin = createSteamWin({
	popupManager: () => (window as unknown as { g_PopupManager?: PopupManagerLike }).g_PopupManager,
	uiWindows: () => (Router as unknown as { WindowStore?: { SteamUIWindows?: WindowRouterLike[] } })?.WindowStore?.SteamUIWindows,
	fallbackNavigate: (path) => Navigation.Navigate(path),
});

/** Open an OEmt tab in the main window. A mounted shell picks up the request; otherwise navigate there. */
function openTab(id: string) {
	requestTab(id);
	if (getCurrentTab() === undefined) openPath(routeToPath(resolveRoute(id)));
}

/** Steam's own (localized) labels for its top-bar items; English as a fallback. */
function steamLabels(): string[] {
	const out = new Set(['Store', 'Library', 'Community']);
	try {
		const tokens = window.LocalizationManager?.m_mapTokens;
		tokens?.forEach((value, key) => {
			if (/^#?(Menu|MainTabs|SuperNav|Nav)_?(Store|Library|Community)$/i.test(key) && value) out.add(value);
		});
	} catch {
		/* labels are only a fallback */
	}
	return [...out];
}

// useParams comes from Steam's react-router via the SDK; if it can't be found the URL just doesn't drive the tab.
const useRouteParams: () => { tab?: string; sub?: string } = typeof useParams === 'function' ? () => useParams<{ tab?: string; sub?: string }>() ?? {} : () => ({});

const OEmtPage: FC = () => {
	const { tab, sub } = useRouteParams();
	return (
		<div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 600 }}>
			<ErrorBoundary name="OEmt.club">
				<Shell urlTab={tab} urlSub={sub} />
			</ErrorBoundary>
		</div>
	);
};

/**
 * Shown in the main window only when OEmt items can't go into Steam's top bar and no OEmt page is open,
 * so OEmt navigation is never silently missing. Inline styles: it renders outside the OEmt page.
 */
const TopbarFallback: FC = () => {
	const [, force] = useState(0);
	useEffect(() => subscribeNav(() => force((n) => n + 1)), []);
	// Only after Steam has had time to draw its own bar, so this never flashes up at startup.
	const [graceOver, setGraceOver] = useState(false);
	useEffect(() => {
		const t = setTimeout(() => setGraceOver(true), 5000);
		return () => clearTimeout(t);
	}, []);
	const s = getIntegration();
	if (!graceOver || s.topbar.mode !== 'fallback' || getCurrentTab() !== undefined) return null;
	const items = getTopbarItems();
	if (!items.length) return null;
	return (
		<nav aria-label="OEmt.club" style={{
			position: 'fixed', top: 40, right: 16, zIndex: 50, display: 'flex', gap: 2, padding: 4,
			background: 'rgba(20, 22, 32, 0.92)', borderRadius: 6, fontSize: 12, fontWeight: 700,
			['WebkitAppRegion' as string]: 'no-drag',
		}}>
			<span style={{ padding: '6px 8px', opacity: 0.6 }}>OEMT.CLUB</span>
			{items.map((it) => (
				<button key={it.id} onClick={() => (it.kind === 'tab' ? openTab(it.id) : it.kind === 'web' ? it.url && openWeb(it.url) : it.route && Navigation.Navigate(it.route))}
					style={{ appearance: 'none', border: 0, background: 'none', color: '#dcdedf', padding: '6px 8px', cursor: 'pointer', font: 'inherit', textTransform: 'uppercase' }}>
					{it.label}
				</button>
			))}
		</nav>
	);
};

/** Shown in Millennium's Quick Access menu. Small on purpose: the real UI lives on the /oemt page. */
const QuickPanel: FC = () => {
	const o = useAsync(() => api.overview());
	return (
		<div className="oemt-root" style={{ position: 'static', padding: 0, background: 'transparent' }}>
			<style>{CSS}</style>
			<div className="oemt-stack">
				<div className="oemt-row">
					{o.data ? <Pill tone={o.data.health}>{o.data.health}</Pill> : o.error ? <Pill tone="fail">backend offline</Pill> : <Pill>checking</Pill>}
					{o.data && <span className="oemt-muted">{o.data.active_sessions.length ? `Playing ${o.data.active_sessions[0].name ?? o.data.active_sessions[0].appid}` : `${o.data.library?.apps ?? 0} games`}</span>}
				</div>
				<NowPlayingCard visible compact />
				<button className="oemt-btn oemt-primary" onClick={() => openTab(o.data?.settings.default_tab ?? DEFAULT_TAB)}>Open OEmt.club</button>
			</div>
		</div>
	);
};

const FALLBACK_NAV = 'oemt-nav-fallback';
let initialized = false;

export default definePlugin(() => {
	// Guard against a second initialisation in the same context (would double every listener and timer).
	if (initialized) api.log('warn', 'duplicate_init', 'plugin initialised twice in one context');
	initialized = true;

	setPathNavigator((path) => steamwin.navigateMain(path) !== 'no_window');

	let stopTracking: () => void = () => undefined;
	try {
		stopTracking = startLifetimeTracking();
	} catch (err) {
		api.log('error', 'lifetime_tracking_failed', String((err as Error)?.message ?? err));
	}

	// Opt-in own-IP log: startup check, timed checks, and a check when a game starts (no-op when off).
	const stopIpLogging = startIpLogging();

	// Live integrations (Discord Rich Presence, now playing): slow background tick; views speed it up.
	live.start();

	// OEmt items in Steam's own top bar (ui.topbar_items), with a fallback strip.
	const topbar = startTopbar(
		() => api.settings().then((s) => {
			const raw = String(s.values['ui.topbar_items'] ?? '');
			const list = parseTopbar(s.values['ui.topbar_items']);
			const kept = new Set(list.map((i) => i.id));
			setIntegration({ droppedTopbarIds: raw.split(',').map((x) => x.trim()).filter((x) => x && !kept.has(x) && !kept.has(resolveRoute(x).tab)) });
			return list;
		}),
		{
			mainDocument: () => steamwin.mainWindow()?.document,
			openTab,
			openRoute: (route) => Navigation.Navigate(route),
			openWeb: (url) => { openWeb(url); },
			steamLabels,
			log: (event, msg) => api.log('info', event, msg),
		},
	);

	routerHook.addRoute(OEMT_ROUTE_PATTERN, OEmtPage);
	setIntegration({ routes: [OEMT_ROUTE_PATTERN] });
	try {
		routerHook.addGlobalComponent(FALLBACK_NAV, TopbarFallback);
	} catch (err) {
		api.log('warn', 'fallback_nav_failed', String((err as Error)?.message ?? err));
	}
	api.log('info', 'frontend_ready', `route ${OEMT_ROUTE_PATTERN} registered`);

	// OEmt.club is the main screen: open it in the main window once that window exists (ui.open_on_start).
	api.overview().then(
		async (o) => {
			if (!o.settings.open_on_start) return;
			const target = startTarget(o.settings.default_tab);
			if (target.kind === 'steam') {
				// A Steam page: let Steam open it in its main window once that window exists.
				const w = await steamwin.whenMainWindow();
				if (!w) return setIntegration({ openOnStart: { ok: false, reason: 'no_main_window', attempts: 0, at: Date.now() } });
				await new Promise((res) => setTimeout(res, 1500));
				SteamClient.URL.ExecuteSteamURL(target.url);
				setIntegration({ openOnStart: { ok: true, reason: 'ok', attempts: 1, at: Date.now() } });
				return api.log('info', 'opened_on_start', target.url);
			}
			const path = target.path;
			const r = await steamwin.openWhenReady(path, () => getCurrentTab() !== undefined);
			setIntegration({ openOnStart: { ok: r.ok, reason: r.reason, attempts: r.attempts, at: Date.now() } });
			if (r.ok) api.log('info', 'opened_on_start', `${path} (attempt ${r.attempts}, ${r.via})`);
			else api.log('warn', 'open_on_start_failed', `${path}: ${r.reason} after ${r.attempts} attempt(s)`);
		},
		() => setIntegration({ openOnStart: { ok: false, reason: 'backend_unavailable', attempts: 0, at: Date.now() } }),
	);

	return {
		icon: <span style={{ display: 'inline-flex', width: 20, height: 20 }}><Logo /></span>,
		content: <QuickPanel />,
		onDismount() {
			stopTracking();
			stopIpLogging();
			live.stop();
			topbar.stop();
			routerHook.removeRoute(OEMT_ROUTE_PATTERN);
			try {
				routerHook.removeGlobalComponent(FALLBACK_NAV);
			} catch {
				/* not registered */
			}
			setPathNavigator(undefined);
			initialized = false;
		},
	};
});
