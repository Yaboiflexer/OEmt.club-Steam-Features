// Puts OEmt items into Steam's own top bar (STORE · LIBRARY · COMMUNITY · <you>).
//
// Steam's class names are build-specific hashes; these are the ones SpaceTheme targets for the current
// client. If they stop matching (a Steam update), nothing is injected and the OEmt page shows its own
// header again, so navigation is never lost. Items reuse Steam's item classes so they look native.
import { Navigation } from 'millennium';
import { getCurrentTab, requestTab, setTopbarActive, subscribeNav } from './nav';

const NAV_ROW = '._3Z3ohQ8-1NKnCZkbS6fvy ._2D64jIEK7wpUR_NlObDW76';
const NAV_ITEM = '._7AlhCx3XGzBeIrQaCneUD';
const NAV_ITEM_ACTIVE = '_1gqEjB5QsKT_NftD1dEsdZ';
const NAV_LABEL = '._19axKcqYRuaJ8vdYKYmtTQ';
const CONTAINER_ID = 'oemt-topbar-items';
const OEMT_ROUTE = '/oemt';

export interface TopbarItem { id: string; label: string; kind: 'tab' | 'route'; route?: string }

/** Everything that may appear in the top bar. Tabs open inside the OEmt page; routes are other screens. */
export const TOPBAR_CHOICES: TopbarItem[] = [
	{ id: 'home', label: 'Home', kind: 'tab' },
	{ id: 'library', label: 'Library', kind: 'tab' },
	{ id: 'sessions', label: 'Sessions', kind: 'tab' },
	{ id: 'accounts', label: 'Accounts', kind: 'tab' },
	{ id: 'integrations', label: 'Integrations', kind: 'tab' },
	{ id: 'performance', label: 'Performance', kind: 'tab' },
	{ id: 'network', label: 'Network', kind: 'tab' },
	{ id: 'settings', label: 'Settings', kind: 'tab' },
	{ id: 'diagnostics', label: 'Diagnostics', kind: 'tab' },
	{ id: 'themes', label: 'Themes & Plugins', kind: 'route', route: '/millennium/settings' },
];

export const DEFAULT_TOPBAR = 'home,library,sessions,accounts,network,settings';

export function parseTopbar(value: unknown): TopbarItem[] {
	const ids = String(value ?? DEFAULT_TOPBAR).split(',').map((s) => s.trim()).filter(Boolean);
	return ids.map((id) => TOPBAR_CHOICES.find((c) => c.id === id)).filter((c): c is TopbarItem => !!c);
}

function mainDocument(): Document | undefined {
	try {
		const w = (window as unknown as { g_PopupManager?: { GetExistingPopup(n: string): { m_popup?: { window?: Window } } | undefined } })
			.g_PopupManager?.GetExistingPopup('SP Desktop_uid0')?.m_popup?.window;
		return w?.document;
	} catch {
		return undefined;
	}
}

function currentPath(doc: Document): string {
	try {
		return doc.defaultView?.location?.pathname ?? '';
	} catch {
		return '';
	}
}

let items: TopbarItem[] = [];

function render(doc: Document): boolean {
	const row = doc.querySelector(NAV_ROW);
	const sample = row?.querySelector(NAV_ITEM);
	if (!row || !sample) return false;

	let box = doc.getElementById(CONTAINER_ID);
	if (!box) {
		box = doc.createElement('div');
		box.id = CONTAINER_ID;
		box.style.display = 'contents';
		// After Steam's last item (the profile name), before the forward arrow.
		const steamItems = row.querySelectorAll(NAV_ITEM);
		steamItems[steamItems.length - 1].after(box);
	}

	const itemClass = sample.className.split(/\s+/).filter((c) => c && c !== NAV_ITEM_ACTIVE).join(' ');
	const labelClass = sample.querySelector(NAV_LABEL)?.className ?? '';
	const tab = getCurrentTab();
	const onOemt = tab !== undefined;

	box.replaceChildren(
		...items.map((it) => {
			const el = doc.createElement('div');
			const active = it.kind === 'tab' ? onOemt && tab === it.id : currentPath(doc).startsWith(it.route ?? '\0');
			el.className = itemClass + (active ? ` ${NAV_ITEM_ACTIVE}` : '');
			el.dataset.oemt = it.id;
			el.setAttribute('role', 'link');
			el.tabIndex = 0;
			const label = doc.createElement('div');
			label.className = labelClass;
			label.textContent = it.label.toUpperCase();
			el.append(label);
			const go = () => {
				if (it.kind === 'tab') {
					requestTab(it.id);
					Navigation.Navigate(OEMT_ROUTE);
				} else if (it.route) {
					Navigation.Navigate(it.route);
				}
			};
			el.addEventListener('click', go);
			el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && go());
			return el;
		}),
	);
	return true;
}

let refreshFn: () => void = () => undefined;
/** Re-read the chosen items (call after changing ui.topbar_items). */
export const refreshTopbar = () => refreshFn();

/** Keep OEmt items in Steam's top bar. Cheap: one querySelector per tick, re-renders only on change. */
export function startTopbar(getItems: () => Promise<TopbarItem[]>): { refresh: () => void; stop: () => void } {
	let stopped = false;
	let lastKey = '';

	const tick = () => {
		if (stopped) return;
		const doc = mainDocument();
		if (!doc) return setTopbarActive(false);
		if (items.length === 0) {
			doc.getElementById(CONTAINER_ID)?.remove();
			return setTopbarActive(false);
		}
		const key = `${items.map((i) => i.id).join()}|${getCurrentTab() ?? ''}|${currentPath(doc)}|${!!doc.getElementById(CONTAINER_ID)}`;
		if (key === lastKey) return;
		lastKey = key;
		setTopbarActive(render(doc), items.map((i) => i.id));
	};

	const refresh = () => {
		getItems().then((list) => {
			items = list;
			lastKey = '';
			tick();
		}, () => undefined);
	};

	refreshFn = refresh;
	refresh();
	const interval = setInterval(tick, 1000); // re-attach after Steam re-renders its title bar
	const unsub = subscribeNav(() => {
		lastKey = '';
		tick();
	});

	return {
		refresh,
		stop() {
			stopped = true;
			refreshFn = () => undefined;
			clearInterval(interval);
			unsub();
			mainDocument()?.getElementById(CONTAINER_ID)?.remove();
			setTopbarActive(false);
		},
	};
}
