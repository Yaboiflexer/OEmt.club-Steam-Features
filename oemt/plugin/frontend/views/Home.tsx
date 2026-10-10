import { FC, useEffect } from 'react';
import { onGameEvent } from '../games';
import { useShell } from '../shell';
import { Art, art, Empty, fmtDuration, fmtWhen, Panel, Pill, Stat } from '../ui';

export const HomeView: FC = () => {
	const { overview, refreshOverview, go } = useShell();

	// Session start/stop changes what Home shows; refresh on lifetime events instead of polling.
	useEffect(() => onGameEvent(() => setTimeout(refreshOverview, 500)), [refreshOverview]);

	if (!overview) return <Empty>Loading…</Empty>;

	const playing = overview.active_sessions[0];
	const featured = playing ? { appid: playing.appid, name: playing.name ?? `App ${playing.appid}` } : overview.recent[0];
	const failing = overview.checks.filter((c) => c.status !== 'pass');

	return (
		<div className="oemt-stack">
			{featured ? (
				<div className="oemt-hero">
					<Art src={art.hero(featured.appid)} alt="" />
					<div className="oemt-hero-caption">
						<div className="oemt-row" style={{ marginBottom: 6 }}>
							{playing ? <Pill tone="pass">Now playing</Pill> : <Pill>Last played</Pill>}
						</div>
						<div className="oemt-hero-title">{featured.name}</div>
					</div>
				</div>
			) : (
				<div className="oemt-hero">
					<div className="oemt-hero-caption">
						<div className="oemt-hero-title">Welcome to OEmt.club</div>
						<div className="oemt-muted">Play something and it will show up here.</div>
					</div>
				</div>
			)}

			<div className="oemt-panel oemt-strip">
				{playing ? (
					<button className="oemt-btn oemt-primary oemt-big" onClick={() => go('sessions')}>In game</button>
				) : featured ? (
					<button className="oemt-btn oemt-primary oemt-big" onClick={() => go('library', { appid: featured.appid })}>Open in library</button>
				) : null}
				<Stat k="Health" v={<Pill tone={overview.health}>{overview.health}</Pill>} />
				<Stat k="Games installed" v={overview.library ? overview.library.apps : 'Not scanned'} />
				<Stat k="Active sessions" v={overview.active_sessions.length} />
				<Stat k="Integrations found" v={overview.integrations_detected} title="Detection only in Phase 1" />
				<Stat k="OEmt" v={`v${overview.version}`} />
			</div>

			{failing.length > 0 && (
				<div className={`oemt-panel oemt-banner${overview.health === 'fail' ? ' oemt-fail' : ''}`}>
					<div className="oemt-row">
						<strong>{failing.length} startup check{failing.length > 1 ? 's' : ''} need attention</strong>
						<div className="oemt-spacer" />
						<button className="oemt-btn" onClick={() => go('diagnostics')}>Open diagnostics</button>
					</div>
					{failing.map((c) => (
						<div key={c.id} className="oemt-muted" style={{ marginTop: 6 }}>{c.label}: {c.detail}</div>
					))}
				</div>
			)}

			{overview.active_sessions.length > 1 && (
				<Panel label="Running now">
					{overview.active_sessions.map((s) => (
						<div key={`${s.appid}:${s.instance}`} className="oemt-row" style={{ padding: '4px 0' }}>
							<strong>{s.name ?? `App ${s.appid}`}</strong>
							<span className="oemt-muted">started {new Date(s.started_at * 1000).toLocaleTimeString()}</span>
						</div>
					))}
				</Panel>
			)}

			<Panel label="Recently played" right={<button className="oemt-btn" onClick={() => go('library')}>All games</button>}>
				{overview.recent.length === 0 ? (
					<Empty>No play history yet. Steam's last-played dates and OEmt sessions both count.</Empty>
				) : (
					<div className="oemt-grid">
						{overview.recent.map((g) => (
							<button key={g.appid} className="oemt-capsule" onClick={() => go('library', { appid: g.appid })}>
								<Art src={art.header(g.appid)} alt="" />
								<div>
									<strong>{g.name}</strong>
									<div className="oemt-muted oemt-small">
										{fmtWhen(g.last_played)}
										{g.oemt_sessions > 0 && ` · ${fmtDuration(g.oemt_total_s)} in ${g.oemt_sessions} OEmt session${g.oemt_sessions > 1 ? 's' : ''}`}
									</div>
								</div>
							</button>
						))}
					</div>
				)}
			</Panel>
		</div>
	);
};
