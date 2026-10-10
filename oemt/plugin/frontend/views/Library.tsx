import { FC, useEffect, useMemo, useState } from 'react';
import { api, LibraryApp } from '../api';
import { launchGame, onGameEvent } from '../games';
import { useShell } from '../shell';
import { Art, art, Empty, ErrorText, fmtBytes, fmtDuration, fmtWhen, Panel, Pill, Stat, useAsync } from '../ui';

type LaunchState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'requested'; warning?: string } | { kind: 'started' } | { kind: 'refused'; reason: string };

export const LibraryView: FC = () => {
	const shell = useShell();
	const lib = useAsync(() => api.library(false));
	const sessions = useAsync(() => api.sessions(500));
	const [query, setQuery] = useState('');
	const [selected, setSelected] = useState<string | undefined>(shell.selectedAppid);
	const [launch, setLaunch] = useState<LaunchState>({ kind: 'idle' });
	const [refreshing, setRefreshing] = useState(false);

	// Other tabs can ask for a specific game (Home -> "Open in library").
	useEffect(() => {
		if (shell.selectedAppid) setSelected(shell.selectedAppid);
	}, [shell.selectedAppid]);

	useEffect(() => onGameEvent(() => sessions.reload()), [sessions.reload]);
	useEffect(() => setLaunch({ kind: 'idle' }), [selected]);

	const apps = lib.data?.apps ?? [];
	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return q ? apps.filter((a) => a.name.toLowerCase().includes(q) || a.appid === q) : apps;
	}, [apps, query]);
	const app: LibraryApp | undefined = apps.find((a) => a.appid === selected) ?? filtered[0];

	const running = sessions.data?.active.some((s) => s.appid === app?.appid) ?? false;
	const playStats = useMemo(() => {
		const hist = (sessions.data?.history ?? []).filter((s) => s.appid === app?.appid && s.duration_s != null);
		return { count: hist.length, total: hist.reduce((t, s) => t + (s.duration_s ?? 0), 0) };
	}, [sessions.data, app?.appid]);

	async function refresh() {
		setRefreshing(true);
		try {
			await api.library(true);
			lib.reload();
			shell.refreshOverview();
		} finally {
			setRefreshing(false);
		}
	}

	async function onLaunch(a: LibraryApp) {
		setLaunch({ kind: 'busy' });
		try {
			const r = await launchGame(a.appid, () => setLaunch({ kind: 'started' }));
			setLaunch(r.ok ? { kind: 'requested', warning: r.warning } : { kind: 'refused', reason: r.reason });
		} catch (err) {
			setLaunch({ kind: 'refused', reason: String((err as Error)?.message ?? err) });
		}
	}

	if (lib.error && !lib.data) return <ErrorText error={lib.error} />;

	return (
		<div className="oemt-library">
			<div className="oemt-panel oemt-gamelist">
				<input className="oemt-input" placeholder="Search games" value={query} onChange={(e) => setQuery(e.target.value)} />
				<div className="oemt-row">
					<span className="oemt-label" style={{ margin: 0 }}>All ({apps.length})</span>
					<div className="oemt-spacer" />
					<button className="oemt-btn oemt-small" onClick={refresh} disabled={refreshing} title="Re-read Steam's library files">
						{refreshing ? 'Scanning…' : 'Rescan'}
					</button>
				</div>
				<div className="oemt-scroll" style={{ flex: 1 }}>
					{lib.loading && !lib.data && <Empty>Reading Steam library…</Empty>}
					{lib.data && filtered.length === 0 && <Empty>{apps.length ? 'No games match.' : 'No installed games found.'}</Empty>}
					{filtered.map((a) => (
						<button key={a.appid} className={`oemt-gameitem${app?.appid === a.appid ? ' oemt-active' : ''}`} onClick={() => setSelected(a.appid)}>
							<Art src={art.header(a.appid)} alt="" />
							<span>{a.name}</span>
							{sessions.data?.active.some((s) => s.appid === a.appid) && <Pill tone="pass">On</Pill>}
						</button>
					))}
				</div>
			</div>

			<div className="oemt-stack oemt-scroll">
				{!app ? (
					<Empty>Select a game.</Empty>
				) : (
					<>
						<div className="oemt-hero">
							<Art src={art.hero(app.appid)} alt="" />
							<div className="oemt-hero-caption"><div className="oemt-hero-title">{app.name}</div></div>
						</div>

						<div className="oemt-panel oemt-strip">
							<button className="oemt-btn oemt-primary oemt-big" disabled={running || launch.kind === 'busy' || app.files_present === false}
								title={app.files_present === false ? 'Game files were not found; verify the game in Steam' : undefined}
								onClick={() => onLaunch(app)}>
								{running ? 'Running' : launch.kind === 'busy' ? 'Starting…' : app.installed ? 'Play' : 'Update & play'}
							</button>
							<Stat k="Last played" v={fmtWhen(app.last_played)} />
							<Stat k="OEmt play time" v={playStats.count ? `${fmtDuration(playStats.total)} · ${playStats.count} sessions` : 'No sessions yet'}
								title="Only sessions recorded while OEmt was running" />
							<Stat k="Size" v={fmtBytes(app.size_bytes)} />
							<Stat k="Status" v={app.update_required ? <Pill tone="warn">Update required</Pill> : app.installed ? <Pill tone="pass">Installed</Pill> : <Pill tone="warn">Incomplete</Pill>} />
							<div className="oemt-spacer" />
							<button className="oemt-btn" title="Open this game's page in Steam" onClick={() => SteamClient.URL.ExecuteSteamURL(`steam://nav/games/details/${app.appid}`)}>Steam page</button>
						</div>

						{launch.kind === 'requested' && (
							<div className="oemt-panel oemt-banner">Launch requested. Steam is starting the game.{launch.warning ? ` ${launch.warning}` : ''}</div>
						)}
						{launch.kind === 'started' && <div className="oemt-panel oemt-banner" style={{ borderLeftColor: 'var(--oemt-pass)' }}>Game started. The session is being recorded.</div>}
						{launch.kind === 'refused' && <div className="oemt-panel oemt-banner oemt-fail">{launch.reason}</div>}
						{app.files_present === false && launch.kind !== 'refused' && (
							<div className="oemt-panel oemt-banner oemt-fail">Steam lists this game, but its files were not found at the expected location. Verify the game's files in Steam.</div>
						)}

						<Panel label="Details">
							<table className="oemt-table">
								<tbody>
									<tr><td className="oemt-muted">App ID</td><td>{app.appid}</td></tr>
									<tr><td className="oemt-muted">Install folder</td><td>{app.installdir ?? '—'}</td></tr>
									<tr><td className="oemt-muted">Library</td><td>{lib.data?.libraries.find((l) => l.index === app.library)?.path ?? app.library}</td></tr>
									<tr><td className="oemt-muted">Last updated</td><td>{app.last_updated ? new Date(app.last_updated * 1000).toLocaleString() : '—'}</td></tr>
								</tbody>
							</table>
						</Panel>
					</>
				)}

				{lib.data && lib.data.warnings.length > 0 && (
					<Panel label={`Library warnings (${lib.data.warnings.length})`}>
						{lib.data.warnings.map((w, i) => <div key={i} className="oemt-muted" style={{ padding: '2px 0' }}>{w}</div>)}
					</Panel>
				)}
			</div>
		</div>
	);
};
