// Tiny shared state between the OEmt page (shell) and things outside it (Steam's top bar items):
// which OEmt tab is showing, and requests to show a tab.
type Listener = () => void;

let currentTab: string | undefined; // undefined = the OEmt page is not open
let pendingTab: string | undefined;
let topbarActive = false;
const listeners = new Set<Listener>();

function emit() {
	listeners.forEach((fn) => {
		try {
			fn();
		} catch {
			/* ignore */
		}
	});
}

export function subscribeNav(fn: Listener): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

/** Ask the OEmt page to show `tab` (picked up now if open, or on its next mount). */
export function requestTab(tab: string) {
	pendingTab = tab;
	emit();
}

export function takeRequestedTab(): string | undefined {
	const t = pendingTab;
	pendingTab = undefined;
	return t;
}

export function setCurrentTab(tab: string | undefined) {
	if (currentTab === tab) return;
	currentTab = tab;
	emit();
}
export const getCurrentTab = () => currentTab;

/** True while OEmt items are injected into Steam's top bar (the page then hides its own header). */
let topbarIds: string[] = [];
export function setTopbarActive(active: boolean, ids: string[] = topbarIds) {
	if (topbarActive === active && ids.join() === topbarIds.join()) return;
	topbarActive = active;
	topbarIds = ids;
	emit();
}
export const isTopbarActive = () => topbarActive;
/** Ids of the items currently shown in Steam's top bar. */
export const getTopbarIds = () => topbarIds;

// ---- Steam integration status (shown in Diagnostics › Steam integration) -------------------------

export type TopbarMode = 'injected' | 'fallback' | 'off';
export interface IntegrationStatus {
	/** Steam's main window ("SP Desktop_uid0") was found. */
	mainWindow: boolean;
	openOnStart?: { ok: boolean; reason: string; attempts: number; at: number };
	/** injected = items in Steam's top bar; fallback = OEmt's own strip in the main window; off = no items chosen. */
	topbar: { mode: TopbarMode; reason: string; method?: string };
	/** Routes registered in Steam's main-window router (should be exactly one). */
	routes: string[];
	/** Tab ids dropped from ui.topbar_items because they were duplicates or unknown. */
	droppedTopbarIds: string[];
}

const status: IntegrationStatus = { mainWindow: false, topbar: { mode: 'off', reason: 'starting' }, routes: [], droppedTopbarIds: [] };

export function setIntegration(patch: Partial<IntegrationStatus>) {
	const next = { ...status, ...patch };
	if (JSON.stringify(next) === JSON.stringify(status)) return;
	Object.assign(status, next);
	emit();
}
export const getIntegration = (): IntegrationStatus => ({ ...status, routes: [...status.routes], droppedTopbarIds: [...status.droppedTopbarIds] });
/** For the duplicate-listener check in Diagnostics. */
export const listenerCount = () => listeners.size;

// ---- path navigation ----------------------------------------------------------------------------
// index.tsx registers how to navigate Steam's main window (steamwin.ts); the shell and the top bar use it.

let pathNavigator: ((path: string) => boolean) | undefined;
export function setPathNavigator(fn: ((path: string) => boolean) | undefined) {
	pathNavigator = fn;
}
/** Navigate Steam's main window to `path`. False when no main window could be found. */
export function openPath(path: string): boolean {
	try {
		return pathNavigator ? pathNavigator(path) : false;
	} catch {
		return false;
	}
}
