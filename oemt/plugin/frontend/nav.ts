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
