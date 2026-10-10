// OEmt.club page routing rules, kept free of React/Steam imports so they can be unit-tested.
//
// Tabs are the pages inside the OEmt.club screen. Old tab ids from earlier versions (saved in
// ui.default_tab / ui.topbar_items or used by other code) are redirected so nothing lands on a blank page.

export type TabId = 'sessions' | 'settings' | 'diagnostics';

/** Where bare /oemt, unknown ids and removed pages land. */
export const DEFAULT_TAB: TabId = 'sessions';

export interface Route { tab: TabId; sub?: string }

/** Old ids and URL slugs -> where their content lives now. The one redirect map. */
export const LEGACY_REDIRECTS: Record<string, Route> = {
	netsessions: { tab: 'sessions' },
	'network-sessions': { tab: 'sessions' },
	network: { tab: 'sessions' },
	performance: { tab: 'diagnostics', sub: 'performance' },
	// Removed pages: Home and the OEmt Library tab; Accounts moved to a separate build.
	home: { tab: 'sessions' },
	library: { tab: 'sessions' },
	accounts: { tab: 'sessions' },
	media: { tab: 'sessions' },
	// Integrations (only Discord Rich Presence left) moved into Settings.
	integrations: { tab: 'settings' },
};

/** Own keys only, so ids like "constructor" never match Object.prototype. */
const legacyOf = (id: string): Route | undefined =>
	Object.prototype.hasOwnProperty.call(LEGACY_REDIRECTS, id) ? LEGACY_REDIRECTS[id] : undefined;

export const TAB_IDS: TabId[] = ['sessions', 'settings', 'diagnostics'];

/** Accepts "tab", "tab:sub" or a legacy id; anything unknown falls back to DEFAULT_TAB. */
export function resolveRoute(id: string | undefined | null): Route {
	const [tab, sub] = String(id ?? '').split(':');
	if ((TAB_IDS as string[]).includes(tab)) return { tab: tab as TabId, sub: sub || undefined };
	const legacy = legacyOf(tab);
	if (legacy) return { ...legacy };
	return { tab: DEFAULT_TAB };
}

// ---- Steam top bar ------------------------------------------------------------------------------

export interface TopbarItem { id: string; label: string; kind: 'tab' | 'route'; route?: string }

/** Everything that may appear in Steam's top bar. Steam's own STORE/LIBRARY/COMMUNITY come first there,
 *  so only OEmt pages and Millennium's Themes & Plugins are offered here. Diagnostics is offered but off
 *  by default (it stays reachable from the health badge). */
export const TOPBAR_CHOICES: TopbarItem[] = [
	{ id: 'sessions', label: 'Sessions', kind: 'tab' },
	{ id: 'settings', label: 'Settings', kind: 'tab' },
	{ id: 'diagnostics', label: 'Diagnostics', kind: 'tab' },
	{ id: 'themes', label: 'Themes & Plugins', kind: 'route', route: '/millennium/settings' },
];

export const DEFAULT_TOPBAR = 'sessions,settings';

/** Parse ui.topbar_items, mapping legacy ids (netsessions/network -> sessions, performance -> diagnostics)
 *  and dropping unknowns and duplicates while keeping the user's order. */
export function parseTopbar(value: unknown): TopbarItem[] {
	const raw = value == null ? DEFAULT_TOPBAR : String(value);
	const out: TopbarItem[] = [];
	for (const part of raw.split(',')) {
		const id = part.trim();
		if (!id) continue;
		const mapped = TOPBAR_CHOICES.some((c) => c.id === id) ? id : legacyOf(id)?.tab;
		const item = TOPBAR_CHOICES.find((c) => c.id === mapped);
		if (item && !out.some((o) => o.id === item.id)) out.push(item);
	}
	return out;
}

// ---- URL paths (/oemt/<tab>[/<sub>]) ------------------------------------------------------------
//
// One route is registered in Steam's main-window router: OEMT_ROUTE_PATTERN. Tab ids double as URL
// slugs. Old slugs (/oemt/network-sessions/…, /oemt/network, /oemt/performance) go through
// LEGACY_REDIRECTS above, so there is a single redirect map.

export const OEMT_ROUTE = '/oemt';
export const OEMT_ROUTE_PATTERN = '/oemt/:tab?/:sub?';

/** Route -> "/oemt/sessions", "/oemt/diagnostics/performance". */
export function routeToPath(r: Route): string {
	const tab = (TAB_IDS as string[]).includes(r.tab) ? r.tab : DEFAULT_TAB;
	return r.sub ? `${OEMT_ROUTE}/${tab}/${r.sub}` : `${OEMT_ROUTE}/${tab}`;
}

/** URL params -> Route. `redirected` is true when the URL used an old or unknown slug and should be replaced. */
export function pathToRoute(tabSlug?: string, subSlug?: string): Route & { redirected: boolean } {
	const t = String(tabSlug ?? '').toLowerCase();
	if (!t) return { tab: DEFAULT_TAB, redirected: false };
	if ((TAB_IDS as string[]).includes(t)) {
		const s = String(subSlug ?? '').toLowerCase();
		return { tab: t as TabId, sub: s || undefined, redirected: false };
	}
	const legacy = legacyOf(t);
	return legacy ? { ...legacy, redirected: true } : { tab: DEFAULT_TAB, redirected: true };
}

// ---- start page (ui.default_tab) ----------------------------------------------------------------
// The start page is an OEmt tab or one of Steam's own pages. Steam pages open through Steam's public
// steam:// links, so Steam itself shows them in the main window.

export const STEAM_START_PAGES: Record<string, string> = {
	steam_store: 'steam://store',
	steam_library: 'steam://nav/games',
	steam_community: 'steam://url/CommunityHome/',
	steam_profile: 'steam://url/SteamIDMyProfile',
};

export type StartTarget = { kind: 'tab'; path: string } | { kind: 'steam'; url: string };

/** ui.default_tab -> what to open when Steam starts. Unknown or removed ids open DEFAULT_TAB. */
export function startTarget(id: string | undefined | null): StartTarget {
	const key = String(id ?? '');
	if (Object.prototype.hasOwnProperty.call(STEAM_START_PAGES, key)) return { kind: 'steam', url: STEAM_START_PAGES[key] };
	return { kind: 'tab', path: routeToPath(resolveRoute(key)) };
}
