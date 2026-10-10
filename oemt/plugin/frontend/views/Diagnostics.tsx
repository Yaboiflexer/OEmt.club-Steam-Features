import { FC, useEffect, useRef, useState } from 'react';
import { api, LogLevel, SelfTest } from '../api';
import { useShell } from '../shell';
import { getIntegration, listenerCount, subscribeNav } from '../nav';
import { PerformanceView } from './Performance';
import { Empty, ErrorText, Panel, Pill, Tone, useAsync } from '../ui';

const MODULE_TONE: Record<string, Tone> = { ok: 'pass', degraded: 'warn', disabled: 'neutral', error: 'fail' };
const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

export const DiagnosticsView: FC = () => {
	const shell = useShell();
	const diag = useAsync(() => api.diagnostics());
	const [level, setLevel] = useState<LogLevel>('info');
	const logs = useAsync(() => api.logs(200, level), [level]);
	const [test, setTest] = useState<SelfTest>();
	const [testError, setTestError] = useState<unknown>();
	const [testing, setTesting] = useState(false);
	const [bundle, setBundle] = useState('');
	const [bundleNote, setBundleNote] = useState('');

	async function runSelfTest() {
		setTesting(true);
		setTestError(undefined);
		try {
			setTest(await api.selfTest());
			diag.reload();
		} catch (err) {
			setTestError(err);
		} finally {
			setTesting(false);
		}
	}

	async function copyDiagnostics() {
		setBundleNote('');
		try {
			const frontend = {
				user_agent: navigator.userAgent,
				sdk_version: (window as unknown as { MILLENNIUM_FRONTEND_LIB_VERSION?: string }).MILLENNIUM_FRONTEND_LIB_VERSION,
				js_heap_used: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize,
				health: shell.overview?.health,
			};
			const text = await api.exportDiagnostics(frontend);
			setBundle(text);
			await navigator.clipboard.writeText(text).then(
				() => setBundleNote('Copied. Secrets, URL query strings, SteamIDs and your user folder are redacted.'),
				() => setBundleNote('Clipboard unavailable here; select the text below and copy it.'),
			);
		} catch (err) {
			setBundleNote(`Export failed: ${String((err as Error)?.message ?? err)}`);
		}
	}

	// Old "Performance" links land here (/oemt/performance -> Diagnostics › performance).
	const perfRef = useRef<HTMLHeadingElement>(null);
	useEffect(() => {
		if (shell.route.tab === 'diagnostics' && shell.route.sub === 'performance') perfRef.current?.scrollIntoView({ block: 'start' });
	}, [shell.route.seq]); // eslint-disable-line react-hooks/exhaustive-deps

	const d = diag.data;

	return (
		<div className="oemt-stack">
			{diag.error ? <ErrorText error={diag.error} /> : null}
			<div className="oemt-panel oemt-strip">
				<span className="oemt-label" style={{ margin: 0 }}>Overall</span>
				{d ? <Pill tone={d.overall}>{d.overall}</Pill> : <span className="oemt-muted">…</span>}
				{d && <span className="oemt-muted">OEmt v{d.oemt_version} · core {d.millennium_version}</span>}
				<div className="oemt-spacer" />
				<button className="oemt-btn" onClick={runSelfTest} disabled={testing}>{testing ? 'Running…' : 'Run self-test'}</button>
				<button className="oemt-btn oemt-primary" onClick={copyDiagnostics}>Copy diagnostics</button>
			</div>

			{bundleNote && <div className="oemt-panel oemt-banner">{bundleNote}</div>}
			{bundle && <textarea className="oemt-textarea" readOnly value={bundle} onFocus={(e) => e.target.select()} />}
			{testError ? <ErrorText error={testError} /> : null}
			{test && (
				<Panel label={`Self-test: ${test.passed}/${test.total} passed`}>
					{test.results.map((r) => (
						<div key={r.name} className="oemt-row" style={{ padding: '4px 0' }}>
							<Pill tone={r.ok ? 'pass' : 'fail'}>{r.ok ? 'pass' : 'fail'}</Pill>
							<span>{r.name}</span>
							<span className="oemt-muted">{r.detail}</span>
							<div className="oemt-spacer" />
							<span className="oemt-muted oemt-small">{r.duration_ms.toFixed(1)} ms</span>
						</div>
					))}
				</Panel>
			)}

			<div className="oemt-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))' }}>
				<Panel label="Startup checks">
					{!d ? <Empty>Loading…</Empty> : d.checks.map((c) => (
						<div key={c.id} className="oemt-row" style={{ padding: '4px 0', alignItems: 'flex-start' }}>
							<Pill tone={c.status}>{c.status}</Pill>
							<div><div>{c.label}</div><div className="oemt-muted oemt-small">{c.detail}</div></div>
						</div>
					))}
				</Panel>
				<Panel label="Modules">
					{!d ? <Empty>Loading…</Empty> : d.modules.map((m) => (
						<div key={m.id} className="oemt-row" style={{ padding: '4px 0', alignItems: 'flex-start' }}>
							<Pill tone={MODULE_TONE[m.status] ?? 'neutral'}>{m.status}</Pill>
							<div><div>{m.name}</div><div className="oemt-muted oemt-small">{m.error ?? m.detail ?? m.state}</div></div>
						</div>
					))}
				</Panel>
			</div>

			{d && d.config_issues.length > 0 && (
				<Panel label="Repaired settings">
					{d.config_issues.map((i, n) => <div key={n} className="oemt-muted">{i.key}: {i.problem}{i.action ? ` (${i.action})` : ''}</div>)}
				</Panel>
			)}

			<SteamIntegrationPanel />

			<h3 ref={perfRef} className="oemt-label" style={{ marginTop: 6 }}>Performance</h3>
			<PerformanceView />

			<Panel label="Logs" right={
				<div className="oemt-row">
					<select className="oemt-select" value={level} onChange={(e) => setLevel(e.target.value as LogLevel)}>
						{LEVELS.map((l) => <option key={l} value={l}>{l} and above</option>)}
					</select>
					<button className="oemt-btn" onClick={logs.reload}>Refresh</button>
				</div>
			}>
				{d && d.log.file_errors > 0 && (
					<div className="oemt-banner oemt-fail oemt-panel" style={{ marginBottom: 8 }}>Log file writes failed {d.log.file_errors} time(s): {d.log.last_file_error}</div>
				)}
				{logs.error ? <ErrorText error={logs.error} /> : null}
				{!logs.data ? <Empty>Loading…</Empty> : logs.data.length === 0 ? <Empty>No log entries at this level.</Empty> : (
					<table className="oemt-table oemt-log">
						<tbody>
							{logs.data.map((l, i) => (
								<tr key={i} className={`oemt-lvl-${l.level}`}>
									<td style={{ whiteSpace: 'nowrap' }}>{l.ts.replace('T', ' ').replace('Z', '')}</td>
									<td>{l.level}</td>
									<td>{l.module}</td>
									<td>
										{l.event}
										{l.outcome ? ` · ${l.outcome}` : ''}
										{l.duration_ms != null ? ` · ${l.duration_ms} ms` : ''}
										{l.msg ? ` · ${l.msg}` : ''}
										{l.error ? ` · ${l.error}` : ''}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</Panel>
		</div>
	);
};

const OPEN_REASON: Record<string, string> = {
	ok: 'Opened in the main window',
	no_main_window: 'Steam\'s main window never appeared',
	no_window: 'No window could be navigated',
	not_shown: 'Steam replaced the page with its own start page',
	backend_unavailable: 'Backend unavailable at startup',
};
const TOPBAR_REASON: Record<string, string> = {
	ok: 'In Steam\'s top bar',
	no_items: 'No items chosen (Settings › Top bar)',
	no_main_window: 'Waiting for Steam\'s main window',
	no_nav_row: 'Steam\'s top bar not recognised; OEmt shows its own menu instead',
	starting: 'Starting',
};

/** How OEmt is attached to Steam's main window. Live: re-renders when the integration state changes. */
const SteamIntegrationPanel: FC = () => {
	const [, force] = useState(0);
	useEffect(() => subscribeNav(() => force((n) => n + 1)), []);
	const s = getIntegration();
	const open = s.openOnStart;
	return (
		<Panel label="Steam integration">
			<table className="oemt-table">
				<tbody>
					<tr><td>Main window</td><td><Pill tone={s.mainWindow ? 'pass' : 'warn'}>{s.mainWindow ? 'Found' : 'Not found'}</Pill></td></tr>
					<tr><td>Top bar</td><td><Pill tone={s.topbar.mode === 'injected' ? 'pass' : s.topbar.mode === 'fallback' ? 'warn' : 'neutral'}>{s.topbar.mode}</Pill> <span className="oemt-muted">{TOPBAR_REASON[s.topbar.reason] ?? s.topbar.reason}{s.topbar.method ? ` · ${s.topbar.method}` : ''}</span></td></tr>
					<tr><td>Open on start</td><td>{open ? <><Pill tone={open.ok ? 'pass' : 'fail'}>{open.ok ? 'ok' : 'failed'}</Pill> <span className="oemt-muted">{OPEN_REASON[open.reason] ?? open.reason} · attempt {open.attempts} · {new Date(open.at).toLocaleTimeString()}</span></> : <span className="oemt-muted">Off or not run yet</span>}</td></tr>
					<tr><td>Routes</td><td><Pill tone={s.routes.length === 1 ? 'pass' : 'warn'}>{s.routes.length}</Pill> <span className="oemt-muted">{s.routes.join(', ') || 'none'}</span></td></tr>
					<tr><td>Top bar ids dropped</td><td><span className="oemt-muted">{s.droppedTopbarIds.length ? s.droppedTopbarIds.join(', ') : 'none (no duplicates)'}</span></td></tr>
					<tr><td>Navigation listeners</td><td><span className="oemt-muted">{listenerCount()}</span></td></tr>
				</tbody>
			</table>
		</Panel>
	);
};
