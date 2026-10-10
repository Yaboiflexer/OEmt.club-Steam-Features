import { FC, useEffect, useState } from 'react';
import { api, Session } from '../api';
import { onGameEvent } from '../games';
import { useShell, useTabActive } from '../shell';
import { ConfirmButton, Empty, ErrorText, fmtDuration, fmtTime, Panel, Pill, useAsync } from '../ui';

const STATUS_TONE = { running: 'pass', ended: 'neutral', interrupted: 'warn' } as const;

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

export const SessionsView: FC = () => {
	const shell = useShell();
	const visible = useTabActive();
	const data = useAsync(() => api.sessions(200));
	const [clearError, setClearError] = useState<unknown>();

	useEffect(() => onGameEvent(() => setTimeout(data.reload, 300)), [data.reload]);
	useEffect(() => {
		if (visible) data.reload();
	}, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

	const active = data.data?.active ?? [];
	const now = useNow(visible && active.length > 0);

	async function clear() {
		setClearError(undefined);
		try {
			await api.clearSessions();
			data.reload();
			shell.refreshOverview();
		} catch (err) {
			setClearError(err);
		}
	}

	const name = (s: Session) => s.name ?? `App ${s.appid}`;

	return (
		<div className="oemt-stack">
			{data.error ? <ErrorText error={data.error} /> : null}
			{clearError ? <ErrorText error={clearError} /> : null}
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

			<Panel label="History" right={<ConfirmButton label="Clear history" confirmLabel="Click again to clear" onConfirm={clear} disabled={!data.data?.history.length} />}>
				{!data.data ? (
					<Empty>Loading…</Empty>
				) : data.data.history.length === 0 ? (
					<Empty>No sessions recorded yet. Sessions are recorded when Steam reports a game starting and stopping.</Empty>
				) : (
					<table className="oemt-table">
						<thead>
							<tr><th>Game</th><th>Started</th><th>Duration</th><th>Status</th></tr>
						</thead>
						<tbody>
							{data.data.history.map((s) => (
								<tr key={s.id}>
									<td><button className="oemt-gameitem" style={{ padding: 0 }} onClick={() => shell.go('library', { appid: s.appid })}>{name(s)}</button></td>
									<td>{fmtTime(s.started_at)}</td>
									<td>{s.status === 'running' ? fmtDuration(now - s.started_at) : fmtDuration(s.duration_s)}</td>
									<td><Pill tone={STATUS_TONE[s.status] ?? 'neutral'}>{s.status}</Pill></td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</Panel>
		</div>
	);
};
