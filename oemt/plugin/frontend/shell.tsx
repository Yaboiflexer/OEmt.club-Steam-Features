import { createContext, FC, KeyboardEvent, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, Overview } from './api';
import { CSS } from './styles';
import { getTopbarIds, isTopbarActive, openPath, setCurrentTab, subscribeNav, takeRequestedTab } from './nav';
import { ErrorBoundary, Pill } from './ui';
import { TABS, TabDef, TabId } from './tabs';
import { DEFAULT_TAB, pathToRoute, resolveRoute, routeToPath } from './routes';

export interface ShellApi {
	/** Switch tab. Accepts "tab", "tab:sub" or a legacy id (redirected); `sub` opens a sub-page
	 *  (e.g. Diagnostics › performance). */
	go(tab: TabId | string, opts?: { sub?: string }): void;
	/** Latest sub-page request; views compare `seq` to react to repeated requests for the same page. */
	route: { tab: TabId; sub?: string; seq: number };
	/** Views with sub-pages report the visible one for the breadcrumb. */
	setCrumb(tab: TabId, label: string | undefined): void;
	/** Re-read accent / reduced-motion after a settings change. */
	refreshAppearance(): void;
	overview?: Overview;
	refreshOverview(): void;
}

const ShellContext = createContext<ShellApi | null>(null);
const TabActiveContext = createContext(true);

export function useShell(): ShellApi {
	const s = useContext(ShellContext);
	if (!s) throw new Error('useShell outside <Shell>');
	return s;
}

/** False while the tab is hidden; views use it to pause timers so idle cost stays near zero. */
export function useTabActive(): boolean {
	return useContext(TabActiveContext);
}

export const Logo: FC = () => (
	// OEmt mark (same drawing as the theme's src/icons/logo.svg): ring with a left slit, four-point star.
	<svg viewBox="0 0 512 512" fill="none" aria-hidden="true">
		<path d="M256 52A204 204 0 1 1 52 269H124A132 132 0 1 0 124 243H52A204 204 0 0 1 256 52Z" fill="currentColor" />
		<rect x="12" y="252" width="128" height="8" rx="4" fill="currentColor" />
		<path d="M256 168 L276 236 L344 256 L276 276 L256 344 L236 276 L168 256 L236 236 Z" fill="currentColor" />
	</svg>
);

/** "#5778aa" -> "87, 120, 170" (the theme's rgb-triplet format). */
function hexToTriplet(hex?: string): string | undefined {
	const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
	return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : undefined;
}

const HEALTH_LABEL ={ pass: 'Healthy', warn: 'Warnings', fail: 'Problems' } as const;
/** How long to wait for OEmt's items to appear in Steam's top bar before showing OEmt's own header. */
const TOPBAR_GRACE_MS = 5000;

/** One tab strip (used by the full header and by the "more tabs" row). Arrow keys move between tabs. */
const TabStrip: FC<{ tabs: TabDef[]; active?: TabId; className: string; label: string; onSelect: (id: TabId) => void }> = ({ tabs, active, className, label, onSelect }) => {
	const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
		if (!active || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
		const ids = tabs.map((t) => t.id);
		const i = Math.max(0, ids.indexOf(active));
		const next = e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
		e.preventDefault();
		onSelect(ids[next]);
		e.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${ids[next]}"]`)?.focus();
	};
	return (
		<nav className={className} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
			{tabs.map((t) => (
				<button key={t.id} data-tab={t.id} role="tab" aria-selected={active === t.id} tabIndex={active === t.id ? 0 : -1}
					className={`oemt-tab${active === t.id ? ' oemt-active' : ''}`} onClick={() => onSelect(t.id)}>
					{t.label}
				</button>
			))}
		</nav>
	);
};

/** URL params come from the /oemt/:tab?/:sub? route in Steam's main-window router. */
export const Shell: FC<{ urlTab?: string; urlSub?: string }> = ({ urlTab, urlSub }) => {
	const [overview, setOverview] = useState<Overview>();
	const [bootError, setBootError] = useState<string>();
	const [retrying, setRetrying] = useState(false);
	const [active, setActive] = useState<TabId>();
	const [opened, setOpened] = useState<Set<TabId>>(new Set());
	const [route, setRoute] = useState<{ tab: TabId; sub?: string; seq: number }>({ tab: DEFAULT_TAB, seq: 0 });
	const [crumbs, setCrumbs] = useState<Partial<Record<TabId, string>>>({});
	/** Canonical path of the URL Steam is showing, so we don't push the same path twice. */
	const urlPath = useRef<string | undefined>(urlTab ? routeToPath(pathToRoute(urlTab, urlSub)) : undefined);

	const show = useCallback((tab: TabId, sub?: string) => {
		setActive(tab);
		setRoute((prev) => (prev.tab === tab && prev.sub === sub && prev.seq > 0 ? prev : { tab, sub, seq: prev.seq + 1 }));
	}, []);

	/** Navigate to "tab", "tab:sub" or a legacy id. Updates the page at once and Steam's URL (/oemt/…). */
	const navigate = useCallback((id: string, sub?: string) => {
		const r = resolveRoute(id);
		const target = { tab: r.tab, sub: sub ?? r.sub };
		show(target.tab, target.sub);
		const path = routeToPath(target);
		if (path !== urlPath.current) {
			urlPath.current = path;
			openPath(path);
		}
	}, [show]);

	// The URL drives the page: /oemt/sessions, /oemt/diagnostics/performance, old slugs are redirected.
	useEffect(() => {
		if (!urlTab) return;
		const r = pathToRoute(urlTab, urlSub);
		const canonical = routeToPath(r);
		urlPath.current = canonical;
		if (r.redirected) openPath(canonical);
		show(r.tab, r.sub);
	}, [urlTab, urlSub, show]);

	const refreshOverview = useCallback(() => {
		setRetrying(true);
		api.overview().then(
			(o) => {
				setOverview(o);
				setBootError(undefined);
				setRetrying(false);
				// Bare /oemt opens the start tab from settings (ui.default_tab; old ids are redirected).
				setActive((cur) => {
					if (cur) return cur;
					const r = resolveRoute(o.settings.default_tab);
					setRoute((prev) => ({ tab: r.tab, sub: r.sub, seq: prev.seq + 1 }));
					return r.tab;
				});
			},
			(err) => {
				setBootError(String(err?.message ?? err));
				setRetrying(false);
				setActive((cur) => cur ?? 'diagnostics');
			},
		);
	}, []);
	useEffect(refreshOverview, [refreshOverview]);

	useEffect(() => {
		if (active) setOpened((s) => (s.has(active) ? s : new Set(s).add(active)));
	}, [active]);

	// Steam's top bar: follow tab requests, report the visible tab, hide our header while injected.
	const [topbar, setTopbar] = useState({ active: isTopbarActive(), ids: getTopbarIds() });
	// Steam draws its title bar a moment after the page; until then (or until OEmt's items are in it) show only
	// the breadcrumb, so the full OEmt header doesn't flash up and vanish. After the grace period it's a real fallback.
	const [graceOver, setGraceOver] = useState(isTopbarActive());
	useEffect(() => {
		if (graceOver) return;
		const t = setTimeout(() => setGraceOver(true), TOPBAR_GRACE_MS);
		return () => clearTimeout(t);
	}, [graceOver]);
	useEffect(() => {
		const apply = () => {
			const req = takeRequestedTab();
			if (req) navigate(req);
			setTopbar((t) => {
				const next = { active: isTopbarActive(), ids: getTopbarIds() };
				return t.active === next.active && t.ids.join() === next.ids.join() ? t : next;
			});
		};
		apply();
		return subscribeNav(apply);
	}, [navigate]);
	useEffect(() => setCurrentTab(active), [active]);
	useEffect(() => () => setCurrentTab(undefined), []);

	const shell = useMemo<ShellApi>(
		() => ({
			go(tab, opts) {
				navigate(tab, opts?.sub);
			},
			route,
			setCrumb(tab, label) {
				setCrumbs((c) => (c[tab] === label ? c : { ...c, [tab]: label }));
			},
			refreshAppearance: refreshOverview,
			overview,
			refreshOverview,
		}),
		[route, overview, refreshOverview, navigate],
	);

	const activeLabel = TABS.find((t) => t.id === active)?.label;
	const crumb = active ? crumbs[active] : undefined;
	const moreTabs = TABS.filter((t) => !topbar.ids.includes(t.id));

	// Colours come from the OEmt.club theme; ui.accent is only the fallback when the theme is off.
	const fallback = hexToTriplet(overview?.settings.accent);
	const reduced = overview?.settings.reduced_motion ?? false;

	const health = overview && (
		<button className="oemt-pillbtn" title="Startup checks; details in Diagnostics" onClick={() => navigate('diagnostics')}>
			<Pill tone={overview.health}>{HEALTH_LABEL[overview.health]}</Pill>
		</button>
	);

	return (
		<ShellContext.Provider value={shell}>
			<div className={`oemt-root${reduced ? ' oemt-reduced-motion' : ''}`} style={fallback ? { ['--oemt-accent-fallback' as string]: fallback } : undefined}>
				<style>{CSS}</style>
				{topbar.active || !graceOver ? (
					// Main items live in Steam's top bar. Here: breadcrumb, the remaining tabs, and health.
					<div className="oemt-pagebar">
						<h1 className="oemt-crumbs">
							<span className="oemt-muted">OEmt.club</span>
							{activeLabel && <><span className="oemt-crumb-sep" aria-hidden="true">›</span><span>{activeLabel}</span></>}
							{crumb && <><span className="oemt-crumb-sep" aria-hidden="true">›</span><span>{crumb}</span></>}
						</h1>
						<div className="oemt-spacer" />
						{topbar.active && moreTabs.length > 0 && <TabStrip tabs={moreTabs} active={active} className="oemt-more" label="More OEmt.club tabs" onSelect={navigate} />}
						{health}
					</div>
				) : (
					// Steam's top bar couldn't take our items: full OEmt header (Steam's own STORE/LIBRARY/COMMUNITY stay in Steam's bar).
					<header className="oemt-panel oemt-topbar">
						<div className="oemt-brand"><Logo />OEmt.club</div>
						<TabStrip tabs={TABS} active={active} className="oemt-tabs" label="OEmt.club" onSelect={navigate} />
						<div className="oemt-spacer" />
						{crumb && <span className="oemt-muted oemt-small">{crumb}</span>}
						{health}
					</header>
				)}

				{bootError && (
					<div className="oemt-panel oemt-banner oemt-fail oemt-row" role="alert">
						<div>
							<strong>The OEmt backend is not responding.</strong>{' '}
							<span className="oemt-muted">Steam keeps working; OEmt pages show what they can.</span>
							<div className="oemt-muted oemt-small">{bootError}</div>
						</div>
						<div className="oemt-spacer" />
						<button className="oemt-btn oemt-primary" onClick={refreshOverview} disabled={retrying}>{retrying ? 'Retrying…' : 'Retry'}</button>
					</div>
				)}

				<main className="oemt-body">
					{!active && !bootError && <div className="oemt-loading" role="status">Loading OEmt.club…</div>}
					{TABS.filter((t) => opened.has(t.id)).map((t) => (
						<div key={t.id} className="oemt-tabpage" role="tabpanel" hidden={active !== t.id}>
							<TabActiveContext.Provider value={active === t.id}>
								<ErrorBoundary name={t.label}>
									<t.Component />
								</ErrorBoundary>
							</TabActiveContext.Provider>
						</div>
					))}
				</main>
			</div>
		</ShellContext.Provider>
	);
};
