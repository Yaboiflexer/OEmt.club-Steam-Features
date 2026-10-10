import { FC, useEffect, useState } from 'react';
import { api } from '../api';
import { useTabActive } from '../shell';
import { Empty, ErrorText, fmtBytes, fmtDuration, Panel, Stat, useAsync } from '../ui';

interface JsMemory { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }

/** Steam's system info minus the hostname, which OEmt never shows or exports. */
async function systemInfo() {
	const s = await SteamClient.System.GetSystemInfo();
	return {
		os: s.sOSName, cpu: s.sCPUName, cores: `${s.nCPUPhysicalCores} cores / ${s.nCPULogicalCores} threads`,
		ram_mb: s.nSystemRAMSizeMB, gpu: s.sVideoCardName, vram_mb: s.nVideoRAMSizeMB, driver: s.sVideoDriverVersion,
		steam: `${s.nSteamVersion} (${s.sSteamBuildDate})`,
	};
}

function jsMemory(): JsMemory | undefined {
	const m = (performance as unknown as { memory?: JsMemory }).memory;
	return m && typeof m.usedJSHeapSize === 'number' ? m : undefined;
}

export const PerformanceView: FC = () => {
	const visible = useTabActive();
	const diag = useAsync(() => api.diagnostics());
	const sys = useAsync(systemInfo);
	const [mem, setMem] = useState(jsMemory);

	// Refresh only while this tab is open; nothing runs in the background.
	useEffect(() => {
		if (!visible) return;
		const t = setInterval(() => {
			setMem(jsMemory());
			diag.reload();
		}, 5000);
		return () => clearInterval(t);
	}, [visible, diag.reload]);

	const perf = diag.data?.performance;

	return (
		<div className="oemt-stack">
			<Panel label="OEmt backend" right={<span className="oemt-muted oemt-small">Source: OEmt Lua process · refreshes every 5 s while open</span>}>
				{diag.error ? <ErrorText error={diag.error} /> : null}
				{!perf ? (
					<Empty>Loading…</Empty>
				) : (
					<div className="oemt-strip">
						<Stat k="Lua heap" v={`${perf.backend_heap_kb.toFixed(1)} KB`} />
						<Stat k="Uptime" v={fmtDuration(perf.uptime_s)} />
						<Stat k="Startup" v={perf.startup_ms != null ? `${perf.startup_ms.toFixed(1)} ms` : '—'} />
						<Stat k="Last library scan" v={perf.library_scan_ms != null ? `${perf.library_scan_ms.toFixed(1)} ms` : 'Not scanned'} />
						<Stat k="Log files on disk" v={fmtBytes(perf.log_disk_bytes)} />
					</div>
				)}
				{perf && <div className="oemt-muted oemt-small" style={{ marginTop: 10 }}>{perf.note}</div>}
			</Panel>

			<Panel label="Steam UI" right={<span className="oemt-muted oemt-small">Source: performance.memory (Chromium)</span>}>
				{mem ? (
					<div className="oemt-strip">
						<Stat k="JS heap used" v={fmtBytes(mem.usedJSHeapSize)} />
						<Stat k="JS heap allocated" v={fmtBytes(mem.totalJSHeapSize)} />
						<Stat k="Heap limit" v={fmtBytes(mem.jsHeapSizeLimit)} />
					</div>
				) : (
					<Empty>This Steam build does not expose performance.memory.</Empty>
				)}
			</Panel>

			<Panel label="This PC" right={<span className="oemt-muted oemt-small">Source: SteamClient.System.GetSystemInfo</span>}>
				{sys.error ? <ErrorText error={sys.error} /> : null}
				{!sys.data ? (
					<Empty>Loading…</Empty>
				) : (
					<table className="oemt-table">
						<tbody>
							<tr><td className="oemt-muted">OS</td><td>{sys.data.os}</td></tr>
							<tr><td className="oemt-muted">CPU</td><td>{sys.data.cpu} · {sys.data.cores}</td></tr>
							<tr><td className="oemt-muted">Memory</td><td>{fmtBytes(sys.data.ram_mb * 1024 * 1024)}</td></tr>
							<tr><td className="oemt-muted">GPU</td><td>{sys.data.gpu} · {fmtBytes(sys.data.vram_mb * 1024 * 1024)} · driver {sys.data.driver}</td></tr>
							<tr><td className="oemt-muted">Steam</td><td>{sys.data.steam}</td></tr>
						</tbody>
					</table>
				)}
			</Panel>

			<Panel label="Backend calls" right={<span className="oemt-muted oemt-small">Measured per call since Steam started</span>}>
				{!perf || perf.calls.length === 0 ? (
					<Empty>No calls yet.</Empty>
				) : (
					<table className="oemt-table">
						<thead><tr><th>Call</th><th>Count</th><th>Errors</th><th>Avg</th><th>Max</th></tr></thead>
						<tbody>
							{perf.calls.map((c) => (
								<tr key={c.name}><td>{c.name}</td><td>{c.count}</td><td>{c.errors}</td><td>{c.avg_ms} ms</td><td>{c.max_ms} ms</td></tr>
							))}
						</tbody>
					</table>
				)}
			</Panel>

			<div className="oemt-muted oemt-small">CPU usage, GPU usage and FPS are not measured in Phase 1, so they are not shown.</div>
		</div>
	);
};
