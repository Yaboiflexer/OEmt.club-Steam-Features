// OEmt.club page routing rules, kept free of React/Steam imports so they can be unit-tested.
//
// Tabs are the pages inside the OEmt.club screen. Old tab ids from earlier versions (saved in
// ui.default_tab / ui.topbar_items or used by other code) are redirected so nothing lands on a blank page.

export type TabId = 'home' | 'accounts' | 'netsessions' | 'settings' | 'diagnostics' | 'library' | 'integrations';
export type NetSessionsSub = 'overview' | 'active' | 'network' | 'connections' | 'history';

export const NETSESSIONS_SUBS: { id: NetSessionsSub; label: string }[] = [
	{ id: 'overview', label: 'Overview' },
	{ id: 'active', label: 'Active Sessions' },
	{ id: 'network', label: 'Network Status' },
	{ id: 'connections', label: 'Connections' },
	{ id: 'history', label: 'Session History' },
];

export interface Route { tab: TabId; sub?: string }

/** Old ids -> where their content lives now. */
export const LEGACY_REDIRECTS: Record<string, Route> = {
	sessions: { tab: 'netsessions', sub: 'history' },
	network: { tab: 'netsessions', sub: 'network' },
	performance: { tab: 'diagnostics', sub: 'performance' },
};

export const TAB_IDS: TabId[] = ['home', 'accounts', 'netsessions', 'settings', 'diagnostics', 'library', 'integrations'];

/** Accepts "tab", "tab:sub" or a legacy id; anything unknown falls back to Home. */
export function resolveRoute(id: string | undefined | null): Route {
	const [tab, sub] = String(id ?? '').split(':');
	if ((TAB_IDS as string[]).includes(tab)) return { tab: tab as TabId, sub: sub || undefined };
	const legacy = LEGACY_REDIRECTS[tab];
	if (legacy) return { ...legacy };
	return { tab: 'home' };
}

export function isNetSessionsSub(s: string | undefined): s is NetSessionsSub {
	return NETSESSIONS_SUBS.some((x) => x.id === s);
}

// ---- Steam top bar ------------------------------------------------------------------------------

export interface TopbarItem { id: string; label: string; kind: 'tab' | 'route'; route?: string }

/** Everything that may appear in Steam's top bar. Steam's own STORE/LIBRARY/COMMUNITY come first there,
 *  so OEmt's Library view is offered but off by default to avoid a second LIBRARY. */
export const TOPBAR_CHOICES: TopbarItem[] = [
	{ id: 'home', label: 'Home', kind: 'tab' },
	{ id: 'accounts', label: 'Accounts', kind: 'tab' },
	{ id: 'netsessions', label: 'Network & Sessions', kind: 'tab' },
	{ id: 'settings', label: 'Settings', kind: 'tab' },
	{ id: 'diagnostics', label: 'Diagnostics', kind: 'tab' },
	{ id: 'library', label: 'OEmt Library', kind: 'tab' },
	{ id: 'integrations', label: 'Integrations', kind: 'tab' },
	{ id: 'themes', label: 'Themes & Plugins', kind: 'route', route: '/millennium/settings' },
];

export const DEFAULT_TOPBAR = 'home,accounts,netsessions,settings,diagnostics';

/** Parse ui.topbar_items, mapping legacy ids (sessions/network -> netsessions, performance -> diagnostics)
 *  and dropping unknowns and duplicates while keeping the user's order. */
export function parseTopbar(value: unknown): TopbarItem[] {
	const raw = value == null ? DEFAULT_TOPBAR : String(value);
	const out: TopbarItem[] = [];
	for (const part of raw.split(',')) {
		const id = part.trim();
		if (!id) continue;
		const mapped = TOPBAR_CHOICES.some((c) => c.id === id) ? id : LEGACY_REDIRECTS[id]?.tab;
		const item = TOPBAR_CHOICES.find((c) => c.id === mapped);
		if (item && !out.some((o) => o.id === item.id)) out.push(item);
	}
	return out;
}
