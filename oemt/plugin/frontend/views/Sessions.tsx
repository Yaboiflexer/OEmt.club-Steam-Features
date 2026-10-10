// Sessions: one page for game sessions and your own public IP (replaces the old Network & Sessions tab
// and its sub-tabs, which showed the same two panels several times). The IP a game session started on
// is a column in the history table instead of a separate list.
import { FC, useEffect, useState } from 'react';
import { api, IpSession, Session } from '../api';
import { onGameEvent } from '../games';
import { onIpLogChanged, scheduleIpChecks } from '../iplog';
import { useShell, useTabActive } from '../shell';
import { ConfirmButton, Empty, ErrorText, fmtDuration, fmtTime, Panel, Pill, Stat, useAsync } from '../ui';

const STATUS_TONE = { running: 'pass', ended: 'neutral', interrupted: 'warn' } as const;
const REASON_LABEL: Record<string, string> = { startup: 'Steam started', auto: 'Timed check', manual: 'Checked by you', session_start: 'Game started' };
/** An IP check counts for a session if it happened within this many seconds of the game starting. */
const IP_MATCH_S = 180;

/** Ticks once a second, only while there is something live to show and the tab is visible. */
function useNow(enabled: boolean): number {
	const [now, setNow] = useState(() => Date.now() / 1000);
	useEffect(() => {
		if (!enabled) return;
		setNow(Date.now() / 1000);
		const t = setInterval(() => setNow(Date.now() / 1000), 1000);
		return () => clearInterval(t);
	}, [enabled]);
	return now;
}

/** The IP check closest to a session's start (same game, within IP_MATCH_S). */
export function ipForSession(s: Session, list: IpSession[]): IpSession | undefined {
	let best: IpSession | undefined;
	for (const x of list) {
		if (x.appid !== s.appid) continue;
		const d = Math.abs(x.at - s.started_at);
		if (d <= IP_MATCH_S && (!best || d < Math.abs(best.at - s.started_at))) best = x;
	}
	return best;
}

export const SessionsView: FC = () => {
	const shell = useShell();
	const visible = useTabActive();
	const data = useAsync(() => api.sessions(200));
	const log = useAsync(() => api.ipLog(200));
	const [error, setError] = useState<unknown>();
	const [busy, setBusy] = useState(false);
	const [reveal, setReveal] = useState(false);

	useEffect(() => onGameEvent(() => setTimeout(data.reload, 300)), [data.reload]);
	useEffect(() => onIpLogChanged(log.reload), [log.reload]);
	useEffect(() => {
		if (visible) data.reload();
	}, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

	const active = data.data?.active ?? [];
	const now = useNow(visible && active.length > 0);
	const ip = log.data;

	async function run(fn: () => Promise<unknown>) {
		setError(undefined);
		try {
			await fn();
		} catch (err) {
			setError(err);
		}
	}
	const clearHistory = () => run(async () => { await api.clearSessions(); data.reload(); shell.refreshOverview(); });
	const clearIpLog = () => run(async () => { await api.clearIpLog(); log.reload(); });
	const setIpLogging = (on: boolean) => run(async () => {
		await api.setSetting('network.ip_logging', on);
		if (on) await api.checkIp('manual');
		await scheduleIpChecks();
		log.reload();
	});
	async function checkNow() {
		setBusy(true);
		await run(async () => { await api.checkIp('manual'); log.reload(); });
		setBusy(false);
	}

	const name = (s: Session) => s.name ?? `App ${s.appid}`;
	/** Your IP is hidden on screen until you choose to show it (handy when streaming). */
	const show = (v?: string) => {
		if (!v) return '—';
		if (reveal) return v;
		const v4 = v.split('.');
		if (v4.length === 4) return `${v4[0]}.${v4[1]}.•••.•••`;
		return `${v.split(':').slice(0, 2).join(':')}:•••`;
	};
	const ipColumn = !!ip && (ip.enabled || ip.sessions.length > 0);

	return (
		<div className="oemt-stack">
			{data.error ? <ErrorText error={data.error} /> : null}
			{error ? <ErrorText error={error} /> : null}
			{data.data && !data.data.enabled && (
				<div className="oemt-panel oemt-banner">
					Session tracking is turned off. <button className="oemt-btn" onClick={() => shell.go('settings')}>Open settings</button>
				</div>
			)}
			{!!data.data?.interrupted_on_load && (
				<div className="oemt-panel oemt-banner">
					{data.data.interrupted_on_load} session(s) were still open when Steam last closed and are marked as interrupted (no end time is known).
				</div>
			)}

			<Panel label="Playing now">
				{active.length === 0 ? (
					<Empty>Nothing running.</Empty>
				) : (
					active.map((s) => (
						<div key={`${s.appid}:${s.instance}`} className="oemt-row" style={{ padding: '6px 0' }}>
							<Pill tone="pass">Live</Pill>
							<strong>{name(s)}</strong>
							<span className="oemt-muted">{fmtDuration(now - s.started_at)}</span>
						</div>
					))
				)}
			</Panel>

			<Panel label="History" right={<ConfirmButton label="Clear history" confirmLabel="Click again to clear" onConfirm={clearHistory} disabled={!data.data?.history.length} />}>
				{!data.data ? (
					<Empty>Loading…</Empty>
				) : data.data.history.length === 0 ? (
					<Empty>No sessions recorded yet. Sessions are recorded when Steam reports a game starting and stopping.</Empty>
				) : (
					<table className="oemt-table">
						<thead>
							<tr><th>Game</th><th>Started</th><th>Duration</th>{ipColumn && <th>IP</th>}<th>Status</th></tr>
						</thead>
						<tbody>
							{data.data.history.map((s) => {
								const sip = ipColumn ? ipForSession(s, ip!.sessions) : undefined;
								return (
									<tr key={s.id}>
										<td>{name(s)}</td>
										<td>{fmtTime(s.started_at)}</td>
										<td>{s.status === 'running' ? fmtDuration(now - s.started_at) : fmtDuration(s.duration_s)}</td>
										{ipColumn && <td>{sip ? show(sip.ip) : <span className="oemt-muted">—</span>}{sip && !sip.fresh && <span className="oemt-muted oemt-small" title="Lookup failed at game start; last known IP shown"> (last known)</span>}</td>}
										<td><Pill tone={STATUS_TONE[s.status] ?? 'neutral'}>{s.status}</Pill></td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}
			</Panel>

			{log.error ? <ErrorText error={log.error} /> : null}
			{ip && (
				<Panel label="My public IP" right={<ConfirmButton label="Clear IP log" confirmLabel="Click again to clear" onConfirm={clearIpLog} disabled={!ip.changes.length && !ip.sessions.length} />}>
					<div className="oemt-strip" style={{ marginBottom: 10 }}>
						<label className="oemt-row" style={{ cursor: 'pointer' }}>
							<input type="checkbox" className="oemt-switch" checked={ip.enabled} onChange={(e) => setIpLogging(e.target.checked)} />
							<strong>Log my public IP</strong>
						</label>
						<Stat k="Current IP" v={ip.current ? show(ip.current.ip) : 'Not checked yet'} />
						<Stat k="Last checked" v={ip.current ? fmtTime(ip.current.last_seen) : '—'} />
						<Stat k="Auto check" v={ip.enabled ? `every ${ip.check_minutes} min` : 'off'} />
						<div className="oemt-spacer" />
						<button className="oemt-btn" onClick={() => setReveal((r) => !r)}>{reveal ? 'Hide IPs' : 'Show IPs'}</button>
						<button className="oemt-btn oemt-primary" disabled={!ip.enabled || busy} onClick={checkNow}>{busy ? 'Checking…' : 'Check now'}</button>
					</div>
					{ip.last_error && <div className="oemt-panel oemt-banner" style={{ marginBottom: 8 }}>Last lookup failed: {ip.last_error}</div>}
					{ip.save_error && <div className="oemt-panel oemt-banner oemt-fail" style={{ marginBottom: 8 }}>Could not save the IP log: {ip.save_error}</div>}
					{ip.load_error && <div className="oemt-panel oemt-banner" style={{ marginBottom: 8 }}>{ip.load_error}</div>}
					{ip.changes.length === 0 ? (
						<Empty>{ip.enabled ? 'No checks yet.' : 'Turn on "Log my public IP" to start.'}</Empty>
					) : (
						<table className="oemt-table">
							<thead><tr><th>IP</th><th>First seen</th><th>Last seen</th><th>Checks</th><th>Found by</th></tr></thead>
							<tbody>
								{ip.changes.map((c, i) => (
									<tr key={`${c.ip}-${c.first_seen}`}>
										<td>{show(c.ip)} {i === 0 && <Pill tone="pass">current</Pill>}</td>
										<td>{fmtTime(c.first_seen)}</td>
										<td>{fmtTime(c.last_seen)}</td>
										<td>{c.checks}</td>
										<td className="oemt-muted">{REASON_LABEL[c.reason] ?? c.reason}</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
					<div className="oemt-muted oemt-small" style={{ marginTop: 8 }}>
						Only <strong>your own</strong> connection is logged, looked up from api.ipify.org. Stored on this PC
						({'Steam\\oemt\\config\\oemt\\ip_log.json'}); IPs are removed from diagnostics exports. Change the check interval in{' '}
						<button className="oemt-gameitem" style={{ display: 'inline', width: 'auto', padding: 0 }} onClick={() => shell.go('settings')}>Settings</button>.
					</div>
				</Panel>
			)}
		</div>
	);
};
