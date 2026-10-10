import { createContext, FC, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, Overview } from './api';
import { CSS } from './styles';
import { getTopbarIds, isTopbarActive, setCurrentTab, subscribeNav, takeRequestedTab } from './nav';
import { ErrorBoundary, Pill } from './ui';
import { TABS, TabId } from './tabs';

export interface ShellApi {
	/** Switch tab. `appid` pre-selects a game in tabs that show one (Library). */
	go(tab: TabId, opts?: { appid?: string }): void;
	selectedAppid?: string;
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

	const refreshOverview = useCallback(() => {
		api.overview().then(
			(o) => {
				setOverview(o);
				setBootError(undefined);
				// First load decides the starting tab from settings (ui.default_tab).
				setActive((cur) => cur ?? (TABS.some((t) => t.id === o.settings.default_tab) ? (o.settings.default_tab as TabId) : 'home'));
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
			if (req && TABS.some((t) => t.id === req)) setActive(req as TabId);
			setTopbar({ active: isTopbarActive(), ids: getTopbarIds() });
		};
		apply();
		return subscribeNav(apply);
	}, []);
	useEffect(() => setCurrentTab(active), [active]);
	useEffect(() => () => setCurrentTab(undefined), []);

	const shell = useMemo<ShellApi>(
		() => ({
			go(tab, opts) {
				if (opts?.appid) setSelectedAppid(opts.appid);
				setActive(tab);
			},
			selectedAppid,
			refreshAppearance: refreshOverview,
			overview,
			refreshOverview,
		}),
		[selectedAppid, overview, refreshOverview],
	);

	// Colours come from the OEmt.club theme; ui.accent is only the fallback when the theme is off.
	const fallback = hexToTriplet(overview?.settings.accent);
	const reduced = overview?.settings.reduced_motion ?? false;

	return (
		<ShellContext.Provider value={shell}>
			<div className={`oemt-root${reduced ? ' oemt-reduced-motion' : ''}`} style={fallback ? { ['--oemt-accent-fallback' as string]: fallback } : undefined}>
				<style>{CSS}</style>
				{topbar.active ? (
					// Items live in Steam's top bar; only tabs not placed there are offered here.
					TABS.some((t) => !topbar.ids.includes(t.id)) && (
						<nav className="oemt-more" aria-label="More OEmt.club tabs">
							<span className="oemt-muted oemt-small">More</span>
							{TABS.filter((t) => !topbar.ids.includes(t.id)).map((t) => (
								<button key={t.id} className={`oemt-tab${active === t.id ? ' oemt-active' : ''}`} onClick={() => setActive(t.id)}>{t.label}</button>
							))}
							<div className="oemt-spacer" />
							{overview && (
								<span title="Startup checks; details in Diagnostics" style={{ cursor: 'pointer' }} onClick={() => setActive('diagnostics')}>
									<Pill tone={overview.health}>{HEALTH_LABEL[overview.health]}</Pill>
								</span>
							)}
						</nav>
					)
				) : (
				<header className="oemt-panel oemt-topbar">
					<div className="oemt-brand"><Logo />OEmt.club</div>
					<nav className="oemt-tabs" role="tablist">
						{TABS.map((t) => (
							<button key={t.id} role="tab" aria-selected={active === t.id}
								className={`oemt-tab${active === t.id ? ' oemt-active' : ''}`} onClick={() => setActive(t.id)}>
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
						<span title="Startup checks; details in Diagnostics" style={{ cursor: 'pointer' }} onClick={() => setActive('diagnostics')}>
							<Pill tone={overview.health}>{HEALTH_LABEL[overview.health]}</Pill>
						</span>
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
