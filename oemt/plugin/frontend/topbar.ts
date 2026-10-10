// Puts OEmt items into Steam's own top bar (STORE · LIBRARY · COMMUNITY · <you> | HOME · SESSIONS · …).
//
// Steam's class names are build-specific hashes. The row is found in two ways:
//   1. the hashed classes SpaceTheme targets for the current client;
//   2. a structural search: the element whose children are Steam's Store / Library / Community items,
//      matched by their (localized) labels. Item classes are then copied from those children.
// If neither works, OEmt shows its own compact strip in the main window instead (see TopbarFallback in
// index.tsx), so OEmt navigation is never silently missing. The reason is reported to Diagnostics.
import { getCurrentTab, setIntegration, setTopbarActive, subscribeNav } from './nav';
import type { TopbarItem } from './routes';

const NAV_ROW = '._3Z3ohQ8-1NKnCZkbS6fvy ._2D64jIEK7wpUR_NlObDW76';
const NAV_ITEM = '._7AlhCx3XGzBeIrQaCneUD';
const NAV_ITEM_ACTIVE = '_1gqEjB5QsKT_NftD1dEsdZ';
const NAV_LABEL = '._19axKcqYRuaJ8vdYKYmtTQ';
const CONTAINER_ID = 'oemt-topbar-items';
const STYLE_ID = 'oemt-topbar-style';
// The bar that holds the row (SpaceTheme centres it) and Steam's menu on the left (Steam, View, Friends, …).
const NAV_BAR = '._3Z3ohQ8-1NKnCZkbS6fvy';
const LEFT_MENU = '._1Ky59qmywxOUtNcI1cgmkX';

// Even spacing for every top-bar item (Steam's and OEmt's), sized to the window: --oemt-nav-pad and
// --oemt-nav-font are set by fitRow(). Labels never wrap, and the back/forward arrows are hidden.
const ROW_CSS = `
${NAV_ROW} ${NAV_ITEM} { padding-left: var(--oemt-nav-pad, 10px) !important; padding-right: var(--oemt-nav-pad, 10px) !important; margin-left: 0 !important; margin-right: 0 !important; white-space: nowrap; }
${NAV_ROW} ${NAV_LABEL} { white-space: nowrap; font-size: var(--oemt-nav-font, 13px); letter-spacing: 0.02em; }
${NAV_ROW} svg { display: none !important; }
`;

function ensureStyle(doc: Document) {
	if (doc.getElementById(STYLE_ID)) return;
	const s = doc.createElement('style');
	s.id = STYLE_ID;
	s.textContent = ROW_CSS;
	doc.head.append(s);
}

/** Undo ensureStyle/fitRow (items turned off or plugin stopped). */
function unfit(doc: Document) {
	doc.getElementById(STYLE_ID)?.remove();
	const bar = doc.querySelector<HTMLElement>(NAV_BAR);
	bar?.style.removeProperty('left');
	bar?.style.removeProperty('transform');
	bar?.style.removeProperty('--oemt-nav-pad');
	bar?.style.removeProperty('--oemt-nav-font');
}

/** Spacing limits (px per side of each item) and the room kept free around the row. */
const PAD_MAX = 14;
const PAD_MIN = 3;
const EDGE_GAP = 16;
const WINDOW_BUTTONS = 150; // minimise / maximise / close on the right
/** Below this width SpaceTheme moves the row onto its own line under the title bar. */
const TWO_LINE_WIDTH = 1188;

/**
 * Dynamic spacing: the widest gap (PAD_MAX down to PAD_MIN, then slightly smaller text) at which the row
 * fits between Steam's left-hand menu and the window buttons. The row stays centred when that leaves
 * room; otherwise it starts just after the menu.
 */
function fitRow(doc: Document, row: Element) {
	const bar = doc.querySelector<HTMLElement>(NAV_BAR);
	const win = doc.defaultView;
	if (!bar || !win) return;
	bar.style.removeProperty('left');
	bar.style.removeProperty('transform');
	const width = win.innerWidth;
	const twoLine = width <= TWO_LINE_WIDTH;
	const menu = doc.querySelector<HTMLElement>(LEFT_MENU);
	const leftLimit = twoLine ? EDGE_GAP : (menu ? menu.getBoundingClientRect().right : 0) + EDGE_GAP;
	const rightLimit = width - (twoLine ? EDGE_GAP : WINDOW_BUTTONS);
	const room = rightLimit - leftLimit;

	bar.style.setProperty('--oemt-nav-font', '13px');
	let pad = PAD_MAX;
	for (; pad > PAD_MIN; pad--) {
		bar.style.setProperty('--oemt-nav-pad', `${pad}px`);
		if (row.getBoundingClientRect().width <= room) break;
	}
	bar.style.setProperty('--oemt-nav-pad', `${pad}px`);
	if (row.getBoundingClientRect().width > room) bar.style.setProperty('--oemt-nav-font', '12px');
	if (twoLine) return; // SpaceTheme centres the row on its own line

	const w = row.getBoundingClientRect().width;
	let left = width / 2 - w / 2;
	if (left < leftLimit) left = leftLimit;
	if (left + w > rightLimit) left = Math.max(leftLimit, rightLimit - w);
	if (Math.abs(left - (width / 2 - w / 2)) > 1) {
		bar.style.left = `${Math.round(left)}px`;
		bar.style.transform = 'translateY(-50%)';
	}
}

// The item list, defaults and legacy-id mapping live in routes.ts (unit-tested).
export { DEFAULT_TOPBAR, parseTopbar, TOPBAR_CHOICES } from './routes';
export type { TopbarItem } from './routes';

export interface TopbarDeps {
	mainDocument(): Document | undefined;
	/** Open an OEmt tab (navigates the main window to its /oemt path). */
	openTab(id: string): void;
	/** Open a Steam route (e.g. Millennium's settings). */
	openRoute(route: string): void;
	/** Steam's localized labels for Store / Library / Community, used by the structural search. */
	steamLabels(): string[];
	log(event: string, msg: string): void;
}

function currentPath(doc: Document): string {
	try {
		return doc.defaultView?.location?.pathname ?? '';
	} catch {
		return '';
	}
}

interface Row { row: Element; anchor: Element; itemClass: string; labelClass: string; activeClass: string; method: string }

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

/** Find Steam's nav row. Exported for tests. */
/** `structural` = false skips the DOM walk and only tries the (cheap) theme class lookup. */
export function findRow(doc: Document, labels: string[], structural = true): Row | undefined {
	const row = doc.querySelector(NAV_ROW);
	const sample = row?.querySelector(NAV_ITEM);
	if (row && sample) {
		const items = row.querySelectorAll(NAV_ITEM);
		return {
			row, anchor: items[items.length - 1],
			itemClass: sample.className.split(/\s+/).filter((c) => c && c !== NAV_ITEM_ACTIVE).join(' '),
			labelClass: sample.querySelector(NAV_LABEL)?.className ?? '',
			activeClass: NAV_ITEM_ACTIVE, method: 'theme_classes',
		};
	}

	// Structural search: smallest element with >= 3 direct children whose text is one of the labels.
	if (!structural) return undefined;
	const wanted = new Set(labels.map(norm).filter(Boolean));
	if (wanted.size < 2) return undefined;
	const hits: Element[] = [];
	const walker = doc.createTreeWalker(doc.body ?? doc.documentElement, 1 /* NodeFilter.SHOW_ELEMENT */);
	for (let n = walker.nextNode() as Element | null; n; n = walker.nextNode() as Element | null) {
		if (n.id === CONTAINER_ID) continue;
		if (n.children.length === 0 && wanted.has(norm(n.textContent))) hits.push(n);
	}
	for (const hit of hits) {
		// Walk up until an ancestor's direct children cover >= 2 different labels: that ancestor is the row.
		for (let parent = hit.parentElement; parent; parent = parent.parentElement) {
			const kids = Array.from(parent.children).filter((c) => wanted.has(norm(c.textContent)));
			if (kids.length >= 2 && new Set(kids.map((k) => norm(k.textContent))).size >= 2) {
				const sample = kids[0];
				let label: Element = sample;
				while (label.firstElementChild) label = label.firstElementChild;
				// Classes on only some items mark the active one; the rest are shared item classes.
				const sets = kids.map((k) => new Set(k.className.split(/\s+/).filter(Boolean)));
				const shared = [...sets[0]].filter((c) => sets.every((s) => s.has(c)));
				const active = sets.flatMap((s) => [...s]).find((c) => !shared.includes(c)) ?? '';
				// Insert after the last child that looks like an item (the profile name), not after arrows or icons.
				const all = Array.from(parent.children).filter((c) => shared.length > 0 && shared.every((cls) => c.classList.contains(cls)));
				return {
					row: parent, anchor: all[all.length - 1] ?? kids[kids.length - 1],
					itemClass: shared.join(' '), labelClass: label === sample ? '' : label.className,
					activeClass: active, method: 'structural',
				};
			}
			if (parent === doc.body) break;
		}
	}
	return undefined;
}

let items: TopbarItem[] = [];

function render(doc: Document, found: Row, deps: TopbarDeps) {
	let box = doc.getElementById(CONTAINER_ID);
	if (!box) {
		box = doc.createElement('div');
		box.id = CONTAINER_ID;
		box.style.display = 'contents';
		// After Steam's last item (the profile name), before the forward arrow.
		found.anchor.after(box);
	}

	const tab = getCurrentTab();
	const onOemt = tab !== undefined;

	// STEAM | OEMT.CLUB divider: decorative, hidden from screen readers.
	const divider = doc.createElement('div');
	divider.setAttribute('aria-hidden', 'true');
	divider.dataset.oemt = 'divider';
	divider.style.cssText = 'width:1px;height:16px;align-self:center;margin:0 8px;background:currentColor;opacity:.25;flex:none';

	box.replaceChildren(
		divider,
		...items.map((it) => {
			const el = doc.createElement('div');
			const active = it.kind === 'tab' ? onOemt && tab === it.id : currentPath(doc).startsWith(it.route ?? '\0');
			el.className = found.itemClass + (active && found.activeClass ? ` ${found.activeClass}` : '');
			el.dataset.oemt = it.id;
			el.setAttribute('role', 'link');
			if (active) el.setAttribute('aria-current', 'page');
			el.tabIndex = 0;
			const label = doc.createElement('div');
			label.className = found.labelClass;
			label.textContent = it.label.toUpperCase();
			el.append(label);
			const go = () => (it.kind === 'tab' ? deps.openTab(it.id) : it.route && deps.openRoute(it.route));
			el.addEventListener('click', go);
			el.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					go();
				}
			});
			return el;
		}),
	);
}

let refreshFn: () => void = () => undefined;
/** Re-read the chosen items (call after changing ui.topbar_items). */
export const refreshTopbar = () => refreshFn();
/** Items currently configured (for the fallback strip). */
export const getTopbarItems = () => items;

/** Keep OEmt items in Steam's top bar. Cheap: one lookup per tick, re-renders only on change. */
export function startTopbar(getItems: () => Promise<TopbarItem[]>, deps: TopbarDeps): { refresh: () => void; stop: () => void } {
	let stopped = false;
	let lastKey = '';
	let lastReason = '';
	let retryAt = 0; // the structural search walks the DOM, so after a miss it only reruns every few seconds

	const report = (mode: 'injected' | 'fallback' | 'off', reason: string, method?: string) => {
		setIntegration({ topbar: { mode, reason, method } });
		if (reason !== lastReason) {
			lastReason = reason;
			deps.log('topbar', `${mode}: ${reason}${method ? ` (${method})` : ''}`);
		}
	};

	const tick = () => {
		if (stopped) return;
		const doc = deps.mainDocument();
		setIntegration({ mainWindow: !!doc });
		if (!doc) {
			setTopbarActive(false);
			return report(items.length ? 'fallback' : 'off', 'no_main_window');
		}
		if (items.length === 0) {
			doc.getElementById(CONTAINER_ID)?.remove();
			unfit(doc);
			setTopbarActive(false);
			return report('off', 'no_items');
		}
		const key = `${items.map((i) => i.id).join()}|${getCurrentTab() ?? ''}|${currentPath(doc)}|${!!doc.getElementById(CONTAINER_ID)}|${doc.defaultView?.innerWidth ?? 0}`;
		if (key === lastKey) return;
		// The theme-class lookup is cheap and runs every tick, so items appear as soon as Steam draws its bar.
		const structural = Date.now() >= retryAt;
		const found = findRow(doc, deps.steamLabels(), structural);
		if (!found) {
			lastKey = '';
			if (structural) retryAt = Date.now() + 5000;
			setTopbarActive(false);
			return report('fallback', 'no_nav_row');
		}
		lastKey = key;
		if (found.method === 'theme_classes') ensureStyle(doc);
		render(doc, found, deps);
		if (found.method === 'theme_classes') fitRow(doc, found.row);
		setTopbarActive(true, items.map((i) => i.id));
		report('injected', 'ok', found.method);
	};

	const refresh = () => {
		getItems().then((list) => {
			items = list;
			lastKey = '';
			retryAt = 0;
			tick();
		}, () => undefined);
	};

	refreshFn = refresh;
	refresh();
	// Every 250 ms: attach quickly at startup and re-attach after Steam re-renders its title bar. A tick
	// with nothing to do is a string compare.
	const interval = setInterval(tick, 250);
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
			const doc = deps.mainDocument();
			doc?.getElementById(CONTAINER_ID)?.remove();
			if (doc) unfit(doc);
			setTopbarActive(false);
		},
	};
}
