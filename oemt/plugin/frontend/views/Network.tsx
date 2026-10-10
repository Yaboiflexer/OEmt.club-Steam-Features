import { FC, useEffect, useState } from 'react';
import { api } from '../api';
import { onIpLogChanged, scheduleIpChecks } from '../iplog';
import { useShell } from '../shell';
import { ConfirmButton, Empty, ErrorText, fmtTime, Panel, Pill, Stat, useAsync } from '../ui';

const REASON_LABEL: Record<string, string> = { startup: 'Steam started', auto: 'Timed check', manual: 'Checked by you', session_start: 'Game started' };

export const NetworkView: FC = () => {
	const shell = useShell();
	const log = useAsync(() => api.ipLog(200));
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<unknown>();
	const [reveal, setReveal] = useState(false);

	useEffect(() => onIpLogChanged(log.reload), [log.reload]);

	async function setEnabled(on: boolean) {
		setError(undefined);
		try {
			await api.setSetting('network.ip_logging', on);
			if (on) await api.checkIp('manual');
			await scheduleIpChecks();
			log.reload();
		} catch (err) {
			setError(err);
		}
	}

	async function checkNow() {
		setBusy(true);
		setError(undefined);
		try {
			await api.checkIp('manual');
			log.reload();
		} catch (err) {
			setError(err);
		} finally {
			setBusy(false);
		}
	}

	async function clear() {
		setError(undefined);
		try {
			await api.clearIpLog();
			log.reload();
		} catch (err) {
			setError(err);
		}
	}

	if (!log.data) return log.error ? <ErrorText error={log.error} /> : <Empty>Loading…</Empty>;
	const d = log.data;
	/** Your IP is hidden on screen until you choose to show it (handy when streaming). */
	const show = (ip?: string) => {
		if (!ip) return '—';
		if (reveal) return ip;
		const v4 = ip.split('.');
		if (v4.length === 4) return `${v4[0]}.${v4[1]}.•••.•••`;
		return `${ip.split(':').slice(0, 2).join(':')}:•••`;
	};

	return (
		<div className="oemt-stack">
			<div className="oemt-panel oemt-strip">
				<label className="oemt-row" style={{ cursor: 'pointer' }}>
					<input type="checkbox" className="oemt-switch" checked={d.enabled} onChange={(e) => setEnabled(e.target.checked)} />
					<strong>Log my public IP</strong>
				</label>
				<Stat k="Current IP" v={d.current ? show(d.current.ip) : 'Not checked yet'} />
				<Stat k="Last checked" v={d.current ? fmtTime(d.current.last_seen) : '—'} />
				<Stat k="Auto check" v={d.enabled ? `every ${d.check_minutes} min` : 'off'} />
				<div className="oemt-spacer" />
				<button className="oemt-btn" onClick={() => setReveal((r) => !r)}>{reveal ? 'Hide IPs' : 'Show IPs'}</button>
				<button className="oemt-btn oemt-primary" disabled={!d.enabled || busy} onClick={checkNow}>{busy ? 'Checking…' : 'Check now'}</button>
			</div>

			<div className="oemt-muted oemt-small">
				Only <strong>your own</strong> connection is logged. Your public IP is looked up from api.ipify.org, which returns just the IP.
				The log is stored on this PC ({'Steam\\oemt\\config\\oemt\\ip_log.json'}) and IPs are removed from diagnostics exports.
				Change the check interval in <button className="oemt-gameitem" style={{ display: 'inline', width: 'auto', padding: 0 }} onClick={() => shell.go('settings')}>Settings</button>.
			</div>

			{error ? <ErrorText error={error} /> : null}
			{d.last_error && <div className="oemt-panel oemt-banner">Last lookup failed: {d.last_error}</div>}
			{d.save_error && <div className="oemt-panel oemt-banner oemt-fail">Could not save the IP log: {d.save_error}</div>}
			{d.load_error && <div className="oemt-panel oemt-banner">{d.load_error}</div>}

			<Panel label="IP changes" right={<ConfirmButton label="Clear log" confirmLabel="Click again to clear" onConfirm={clear} disabled={!d.changes.length && !d.sessions.length} />}>
				{d.changes.length === 0 ? (
					<Empty>{d.enabled ? 'No checks yet.' : 'Turn on "Log my public IP" to start.'}</Empty>
				) : (
					<table className="oemt-table">
						<thead><tr><th>IP</th><th>First seen</th><th>Last seen</th><th>Checks</th><th>Found by</th></tr></thead>
						<tbody>
							{d.changes.map((c, i) => (
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
			</Panel>

			<Panel label="IP per game session">
				{d.sessions.length === 0 ? (
					<Empty>Recorded automatically when a game starts while logging is on.</Empty>
				) : (
					<table className="oemt-table">
						<thead><tr><th>Game</th><th>Started</th><th>IP</th></tr></thead>
						<tbody>
							{d.sessions.map((s) => (
								<tr key={`${s.appid}-${s.at}`}>
									<td><button className="oemt-gameitem" style={{ padding: 0 }} onClick={() => shell.go('library', { appid: s.appid })}>{s.name ?? `App ${s.appid}`}</button></td>
									<td>{fmtTime(s.at)}</td>
									<td>{show(s.ip)}{!s.fresh && <span className="oemt-muted oemt-small" title="Lookup failed at game start; last known IP shown"> (last known)</span>}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</Panel>
		</div>
	);
};
