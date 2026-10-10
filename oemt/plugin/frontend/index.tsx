// OEmt.club plugin entry. Registers the full-page route (/oemt) with the tabbed shell, a Quick Access
// panel that opens it, and Steam game-lifetime tracking for sessions.
import { FC } from 'react';
import { definePlugin, Navigation, routerHook } from 'millennium';
import { api } from './api';
import { launchGame, startLifetimeTracking } from './games';
import { startIpLogging } from './iplog';
import { Logo, Shell } from './shell';
import { CSS } from './styles';
import { ErrorBoundary, Pill, useAsync } from './ui';

export const OEMT_ROUTE = '/oemt';
/** Steam navigates to its own start page during startup; navigating earlier would be overridden. */
const OPEN_ON_START_DELAY_MS = 1500;

const OEmtPage: FC = () => (
	<div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 600 }}>
		<ErrorBoundary name="OEmt.club">
			<Shell />
		</ErrorBoundary>
	</div>
);

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
				<button className="oemt-btn oemt-primary" onClick={() => Navigation.Navigate(OEMT_ROUTE)}>Open OEmt.club</button>
			</div>
		</div>
	);
};

export default definePlugin(() => {
	let stopTracking: () => void = () => undefined;
	try {
		stopTracking = startLifetimeTracking();
	} catch (err) {
		api.log('error', 'lifetime_tracking_failed', String((err as Error)?.message ?? err));
	}

	// Opt-in own-IP log: startup check, timed checks, and a check when a game starts (no-op when off).
	const stopIpLogging = startIpLogging();

	routerHook.addRoute(OEMT_ROUTE, OEmtPage, { exact: true });
	api.log('info', 'frontend_ready', `route ${OEMT_ROUTE} registered`);

	// Account Center "switch then launch": after TcNo restarted Steam on the chosen account, play the game.
	setTimeout(() => {
		api.takePendingLaunch().then(
			(p) => {
				if (p.appid) launchGame(p.appid).catch(() => undefined);
				else if (p.wrong_account) api.log('warn', 'pending_launch_skipped', 'signed-in account differs from the one switched to');
			},
			() => undefined,
		);
	}, OPEN_ON_START_DELAY_MS + 1000);

	// OEmt.club is the main screen: open it once Steam's own start page has rendered (ui.open_on_start).
	api.overview().then(
		(o) => {
			if (!o.settings.open_on_start) return;
			setTimeout(() => {
				Navigation.Navigate(OEMT_ROUTE);
				api.log('info', 'opened_on_start', OEMT_ROUTE);
			}, OPEN_ON_START_DELAY_MS);
		},
		() => undefined,
	);

	return {
		icon: <span style={{ display: 'inline-flex', width: 20, height: 20 }}><Logo /></span>,
		content: <QuickPanel />,
		onDismount() {
			stopTracking();
			stopIpLogging();
			routerHook.removeRoute(OEMT_ROUTE);
		},
	};
});
