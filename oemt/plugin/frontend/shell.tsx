import { createContext, FC, KeyboardEvent, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, Overview } from './api';
import { CSS } from './styles';
import { getTopbarIds, isTopbarActive, setCurrentTab, subscribeNav, takeRequestedTab } from './nav';
import { ErrorBoundary, Pill } from './ui';
import { TABS, TabId } from './tabs';
import { resolveRoute } from './routes';

export interface ShellApi {
	/** Switch tab. Accepts "tab", "tab:sub" or a legacy id (redirected). `appid` pre-selects a game
	 *  (Library); `sub` opens a sub-page (e.g. Network & Sessions › Connections). */
	go(tab: TabId | string, opts?: { appid?: string; sub?: string }): void;
	selectedAppid?: string;
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
	<svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
		<circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="6" />
		<path d="M32 19v26M19 32h26" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
	</svg>
);

/** "#5778aa" -> "87, 120, 170" (the theme's rgb-triplet format). */
function hexToTriplet(hex?: string): string | undefined {
	const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
	return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : undefined;
}

const HEALTH_LABEL ={ pass: 'Healthy', warn: 'Warnings', fail: 'Problems' } as const;

/** Steam's own areas, reachable from the OEmt tab strip. steam:// URLs are Steam's stable public entry points. */
const STEAM_LINKS = [
	{ label: 'Store', url: 'steam://store' },
	{ label: 'Community', url: 'steam://url/CommunityHome/' },
	{ label: 'Steam Library', url: 'steam://nav/games' },
	{ label: 'Downloads', url: 'steam://nav/downloads' },
] as const;

export const Shell: FC = () => {
	const [overview, setOverview] = useState<Overview>();
	const [bootError, setBootError] = useState<string>();
	const [active, setActive] = useState<TabId>();
	const [opened, setOpened] = useState<Set<TabId>>(new Set());
	const [selectedAppid, setSelectedAppid] = useState<string>();
	const [route, setRoute] = useState<{ tab: TabId; sub?: string; seq: number }>({ tab: 'home', seq: 0 });
	const [crumbs, setCrumbs] = useState<Partial<Record<TabId, string>>>({});

	/** Navigate to "tab", "tab:sub" or a legacy id. */
	const navigate = useCallback((id: string, sub?: string) => {
		const r = resolveRoute(id);
		setActive(r.tab);
		setRoute((prev) => ({ tab: r.tab, sub: sub ?? r.sub, seq: prev.seq + 1 }));
	}, []);

	const refreshOverview = useCallback(() => {
		api.overview().then(
			(o) => {
				setOverview(o);
				setBootError(undefined);
				// First load decides the starting tab from settings (ui.default_tab; old ids are redirected).
				setActive((cur) => {
					if (cur) return cur;
					const r = resolveRoute(o.settings.default_tab);
					setRoute((prev) => ({ tab: r.tab, sub: r.sub, seq: prev.seq + 1 }));
					return r.tab;
				});
			},
			(err) => {
				setBootError(String(err?.message ?? err));
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
	useEffect(() => {
		const apply = () => {
			const req = takeRequestedTab();
			if (req) navigate(req);
			setTopbar({ active: isTopbarActive(), ids: getTopbarIds() });
		};
		apply();
		return subscribeNav(apply);
	}, [navigate]);
	useEffect(() => setCurrentTab(active), [active]);
	useEffect(() => () => setCurrentTab(undefined), []);

	const shell = useMemo<ShellApi>(
		() => ({
			go(tab, opts) {
				if (opts?.appid) setSelectedAppid(opts.appid);
				navigate(tab, opts?.sub);
			},
			selectedAppid,
			route,
			setCrumb(tab, label) {
				setCrumbs((c) => (c[tab] === label ? c : { ...c, [tab]: label }));
			},
			refreshAppearance: refreshOverview,
			overview,
			refreshOverview,
		}),
		[selectedAppid, route, overview, refreshOverview, navigate],
	);

	/** Arrow keys move between tabs in a tab strip (focus follows selection). */
	const onTabKeys = (ids: TabId[]) => (e: KeyboardEvent<HTMLElement>) => {
		if (!active || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
		const i = Math.max(0, ids.indexOf(active));
		const next = e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
		e.preventDefault();
		navigate(ids[next]);
		const btn = e.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${ids[next]}"]`);
		btn?.focus();
	};

	const activeLabel = TABS.find((t) => t.id === active)?.label;
	const crumb = active ? crumbs[active] : undefined;

	// Colours come from the OEmt.club theme; ui.accent is only the fallback when the theme is off.
	const fallback = hexToTriplet(overview?.settings.accent);
	const reduced = overview?.settings.reduced_motion ?? false;

	return (
		<ShellContext.Provider value={shell}>
			<div className={`oemt-root${reduced ? ' oemt-reduced-motion' : ''}`} style={fallback ? { ['--oemt-accent-fallback' as string]: fallback } : undefined}>
				<style>{CSS}</style>
				{topbar.active ? (
					// Main items live in Steam's top bar. Here: breadcrumb, the remaining tabs, and health.
					<div className="oemt-pagebar">
						<h1 className="oemt-crumbs">
							<span className="oemt-muted">OEmt.club</span>
							{activeLabel && <><span className="oemt-crumb-sep" aria-hidden="true">›</span><span>{activeLabel}</span></>}
							{crumb && <><span className="oemt-crumb-sep" aria-hidden="true">›</span><span>{crumb}</span></>}
						</h1>
						<div className="oemt-spacer" />
						{TABS.some((t) => !topbar.ids.includes(t.id)) && (
							<nav className="oemt-more" role="tablist" aria-label="More OEmt.club tabs"
								onKeyDown={onTabKeys(TABS.filter((t) => !topbar.ids.includes(t.id)).map((t) => t.id))}>
								{TABS.filter((t) => !topbar.ids.includes(t.id)).map((t) => (
									<button key={t.id} data-tab={t.id} role="tab" aria-selected={active === t.id} tabIndex={active === t.id ? 0 : -1}
										className={`oemt-tab${active === t.id ? ' oemt-active' : ''}`} onClick={() => navigate(t.id)}>{t.label}</button>
								))}
							</nav>
						)}
						{overview && (
							<button className="oemt-pillbtn" title="Startup checks; details in Diagnostics" onClick={() => navigate('diagnostics')}>
								<Pill tone={overview.health}>{HEALTH_LABEL[overview.health]}</Pill>
							</button>
						)}
					</div>
				) : (
				<header className="oemt-panel oemt-topbar">
					<div className="oemt-brand"><Logo />OEmt.club</div>
					<nav className="oemt-tabs" role="tablist" aria-label="OEmt.club" onKeyDown={onTabKeys(TABS.map((t) => t.id))}>
						{TABS.map((t) => (
							<button key={t.id} data-tab={t.id} role="tab" aria-selected={active === t.id} tabIndex={active === t.id ? 0 : -1}
								className={`oemt-tab${active === t.id ? ' oemt-active' : ''}`} onClick={() => navigate(t.id)}>
								{t.label}
							</button>
						))}
						<span className="oemt-tab-divider" aria-hidden="true" />
						{STEAM_LINKS.map((l) => (
							<button key={l.url} className="oemt-tab oemt-tab-steam" title={`Open Steam's ${l.label}`}
								onClick={() => SteamClient.URL.ExecuteSteamURL(l.url)}>
								{l.label}
							</button>
						))}
					</nav>
					<div className="oemt-spacer" />
					{overview && (
						<button className="oemt-pillbtn" title="Startup checks; details in Diagnostics" onClick={() => navigate('diagnostics')}>
							<Pill tone={overview.health}>{HEALTH_LABEL[overview.health]}</Pill>
						</button>
					)}
				</header>
				)}

				{bootError && (
					<div className="oemt-panel oemt-banner oemt-fail">
						<strong>The OEmt backend is not responding.</strong> <span className="oemt-muted">{bootError}</span>
					</div>
				)}

				<main className="oemt-body">
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
