// Integrations: Discord Rich Presence, Spotify and SoundCloud now playing with media controls, and
// install detection. Every integration is off until turned on here; settings save as you change them.
import { FC, ReactNode, useEffect, useState } from 'react';
import { api, CapabilityStatus, Integration, MediaAction } from '../api';
import * as live from '../liveStore';
import { useTabActive } from '../shell';
import { Empty, ErrorText, fmtBytes, fmtTime, Pill, useAsync } from '../ui';

const CAP_TONE: Record<CapabilityStatus, 'pass' | 'accent' | 'fail'> = { available: 'pass', planned: 'accent', unsupported: 'fail' };
const DETECTION_LABEL: Record<string, string> = {
	detected: 'Installed', not_installed: 'Not installed', not_detectable: 'Web app', unsupported_platform: 'Unsupported OS', error: 'Detection error',
};

const Toggle: FC<{ checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; children: ReactNode; title?: string }> = ({ checked, disabled, onChange, children, title }) => (
	<label className="oemt-row" style={{ cursor: disabled ? 'default' : 'pointer' }} title={title}>
		<input type="checkbox" className="oemt-switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
		<span>{children}</span>
	</label>
);

const Capabilities: FC<{ i: Integration }> = ({ i }) => (
	<details className="oemt-caps">
		<summary className="oemt-muted oemt-small">What it does</summary>
		{i.capabilities.map((c) => (
			<div key={c.id} style={{ padding: '4px 0' }}>
				<div className="oemt-row"><Pill tone={CAP_TONE[c.status]}>{c.status}</Pill><span className="oemt-small">{c.label}</span></div>
				{c.note && <div className="oemt-muted oemt-small" style={{ marginTop: 2 }}>{c.note}</div>}
			</div>
		))}
	</details>
);

const Card: FC<{ i: Integration; children?: ReactNode; status?: ReactNode }> = ({ i, children, status }) => (
	<section className="oemt-panel oemt-integration">
		<div className="oemt-row" style={{ marginBottom: 10 }}>
			<h3 className="oemt-int-title">{i.name}</h3>
			<Pill tone={i.detection.installed ? 'pass' : 'neutral'} title={i.detection.detail}>{DETECTION_LABEL[i.detection.status] ?? i.detection.status}</Pill>
			<div className="oemt-spacer" />
			{status}
		</div>
		<div className="oemt-stack" style={{ gap: 10 }}>{children}</div>
		<Capabilities i={i} />
	</section>
);

/** Insights.gg: running state, Open, auto-start, recordings folder and recent recordings. */
const InsightsCard: FC<{ i: Integration; on: boolean; autoStart: boolean; folder: string; busy: boolean; save: (k: string, v: unknown) => Promise<void> }> = ({ i, on, autoStart, folder, busy, save }) => {
	const st = useAsync(() => api.insightsStatus(true), [on]);
	const [dir, setDir] = useState(folder);
	const [err, setErr] = useState<unknown>();
	useEffect(() => setDir(folder), [folder]);
	const act = (p: Promise<unknown>, reload = true) => p.then(() => reload && setTimeout(st.reload, 1500), setErr);
	const s = st.data;
	return (
		<Card i={i} status={s?.installed && <Pill tone={s.running ? 'pass' : 'neutral'}>{s.running ? 'Running' : 'Not running'}</Pill>}>
			<Toggle checked={on} disabled={busy} onChange={(x) => save('integrations.insights.enabled', x)}>Use Insights Capture with OEmt.club</Toggle>
			{err ? <div className="oemt-small" style={{ color: 'var(--oemt-fail)' }}>{String((err as Error)?.message ?? err)}</div> : null}
			{s && !s.installed && <span className="oemt-muted oemt-small">Insights Capture isn't installed (get it from insights.gg).</span>}
			{s?.installed && (
				<div className="oemt-row oemt-wrap">
					<button className="oemt-btn oemt-primary" onClick={() => act(api.insightsOpen())}>{s.running ? 'Show Insights' : 'Open Insights'}</button>
					<button className="oemt-btn" onClick={() => st.reload()}>Refresh</button>
					<span className="oemt-muted oemt-small">{s.variant}</span>
				</div>
			)}
			{on && s?.installed && (
				<>
					<Toggle checked={autoStart} disabled={busy} onChange={(x) => save('integrations.insights.auto_start', x)}>Start Insights Capture when a game starts</Toggle>
					<label className="oemt-stack" style={{ gap: 4 }}>
						<span className="oemt-small oemt-muted">Recordings folder (where Insights saves videos; empty = Videos\Insights Capture)</span>
						<div className="oemt-row">
							<input className="oemt-input" style={{ flex: 1 }} placeholder={s.recordings_dir} value={dir} maxLength={400}
								onChange={(e) => setDir(e.target.value)} onBlur={() => dir.trim() !== folder && save('integrations.insights.recordings_dir', dir.trim()).then(() => st.reload())}
								onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
							<button className="oemt-btn" onClick={() => act(api.insightsReveal(''), false)}>Open folder</button>
						</div>
					</label>
					<div className="oemt-stack" style={{ gap: 4 }}>
						<span className="oemt-small oemt-muted">Recent recordings ({s.recordings_total})</span>
						{s.recordings.length === 0 ? <span className="oemt-muted oemt-small">None found in {s.recordings_dir}. If Insights saves elsewhere, set the folder above.</span> : s.recordings.slice(0, 6).map((r) => (
							<div key={r.path} className="oemt-row oemt-small">
								<span className="oemt-np-title" style={{ flex: 1 }} title={r.path}>{r.name}</span>
								<span className="oemt-muted">{fmtTime(r.mtime)} · {fmtBytes(r.size)}</span>
								<button className="oemt-btn oemt-small-btn" onClick={() => act(api.insightsReveal(r.path), false)}>Show</button>
							</div>
						))}
					</div>
				</>
			)}
		</Card>
	);
};

export const IntegrationsView: FC = () => {
	const visible = useTabActive();
	const list = useAsync(() => api.integrations(false));
	const settings = useAsync(() => api.settings());
	const { status, error: liveError } = live.useLive(visible);
	const [error, setError] = useState<unknown>();
	const [busy, setBusy] = useState(false);
	const [appId, setAppId] = useState('');
	const [testNote, setTestNote] = useState<string>();

	const v = settings.data?.values ?? {};
	useEffect(() => setAppId(String(v['integrations.discord.client_id'] ?? '')), [settings.data]); // eslint-disable-line react-hooks/exhaustive-deps

	async function save(key: string, value: unknown) {
		setError(undefined);
		setBusy(true);
		try {
			await api.setSetting(key, value);
			settings.reload();
			if (key.endsWith('.enabled')) list.reload();
			await live.refresh();
		} catch (err) {
			setError(err);
		} finally {
			setBusy(false);
		}
	}

	async function saveAppId() {
		const clean = appId.replace(/\s+/g, '');
		setAppId(clean);
		if (clean === String(v['integrations.discord.client_id'] ?? '')) return;
		if (clean && !/^\d{17,20}$/.test(clean)) return setError(new Error('A Discord Application ID is 17 to 20 digits (copy it from the app\'s General Information page).'));
		await save('integrations.discord.client_id', clean);
	}

	async function test() {
		setTestNote(undefined);
		setError(undefined);
		try {
			await live.discordTest();
			setTestNote('Check your Discord profile: it shows "OEmt.club · Rich Presence is working" for 15 seconds.');
		} catch (err) {
			setError(err);
		}
	}

	const press = (a: MediaAction) => live.media(a).catch(setError);
	const on = (id: string) => v[`integrations.${id}.enabled`] === true;
	const byId = new Map((list.data ?? []).map((i) => [i.id, i]));
	const d = status?.discord;
	const np = status?.now_playing;

	const controls = (
		<div className="oemt-row" role="group" aria-label="Media controls" style={{ gap: 4 }}>
			<button className="oemt-btn oemt-icon-btn" onClick={() => press('previous')} aria-label="Previous track">⏮</button>
			<button className="oemt-btn oemt-icon-btn oemt-primary" onClick={() => press('play_pause')} aria-label="Play or pause">⏯</button>
			<button className="oemt-btn oemt-icon-btn" onClick={() => press('next')} aria-label="Next track">⏭</button>
		</div>
	);
	const nowPlayingFor = (source: 'spotify' | 'soundcloud') => (
		<div className="oemt-row">
			<div className="oemt-np-text">
				{np?.source === source ? (
					<><strong className="oemt-np-title">{np.title}</strong>{np.artist && <span className="oemt-muted oemt-np-artist">{np.artist}</span>}</>
				) : (
					<span className="oemt-muted">{source === 'spotify' ? 'Nothing playing in Spotify (or paused)' : 'No SoundCloud tab playing (keep its tab selected)'}</span>
				)}
			</div>
			<div className="oemt-spacer" />
			{controls}
		</div>
	);

	if (!list.data || !settings.data) {
		return list.error || settings.error ? <ErrorText error={list.error ?? settings.error} /> : <Empty>Loading integrations…</Empty>;
	}

	return (
		<div className="oemt-stack">
			{error ? <ErrorText error={error} /> : null}
			{liveError && <div className="oemt-panel oemt-banner oemt-small">Live status unavailable: {liveError}</div>}
			{status && !status.available && <div className="oemt-panel oemt-banner oemt-small">Live integrations need Windows; only detection works here.</div>}

			<div className="oemt-grid oemt-int-grid">
				{byId.get('discord') && (
					<Card i={byId.get('discord')!} status={on('discord') && d && (
						<Pill tone={d.connected ? 'pass' : d.configured ? 'warn' : 'neutral'} title={d.error}>
							{d.connected ? (d.showing ? 'Showing on Discord' : 'Connected') : d.configured ? 'Not connected' : 'Needs App ID'}
						</Pill>
					)}>
						<Toggle checked={on('discord')} disabled={busy} onChange={(x) => save('integrations.discord.enabled', x)}>Show my game on Discord (Rich Presence)</Toggle>
						<label className="oemt-stack" style={{ gap: 4 }}>
							<span className="oemt-small oemt-muted">Discord Application ID</span>
							<div className="oemt-row">
								<input className="oemt-input" style={{ flex: 1 }} inputMode="numeric" placeholder="e.g. 1234567890123456789" value={appId} maxLength={24}
									onChange={(e) => setAppId(e.target.value)} onBlur={saveAppId} onKeyDown={(e) => e.key === 'Enter' && saveAppId()} />
								<button className="oemt-btn" onClick={test} disabled={!on('discord') || !d?.configured}>Test</button>
							</div>
							<span className="oemt-muted oemt-small">
								Create a free app named "OEmt.club" at discord.com/developers › Applications › New Application, then copy its Application ID.
								The ID is public; no token or login is used. Your status then reads "Playing OEmt.club".
							</span>
						</label>
						<Toggle checked={v['integrations.discord.idle_presence'] === true} disabled={busy || !on('discord')} onChange={(x) => save('integrations.discord.idle_presence', x)}>
							Show "In Steam" when no game is running
						</Toggle>
						<Toggle checked={v['integrations.discord.show_music'] === true} disabled={busy || !on('discord')} onChange={(x) => save('integrations.discord.show_music', x)}>
							Show the song I'm listening to
						</Toggle>
						<Toggle checked={v['integrations.discord.store_button'] !== false} disabled={busy || !on('discord')} onChange={(x) => save('integrations.discord.store_button', x)}>
							Add a "View on Steam" button for the game
						</Toggle>
						{on('discord') && d?.error && <div className="oemt-small" style={{ color: 'var(--oemt-warn)' }}>{d.error}</div>}
						{testNote && <div className="oemt-small oemt-muted">{testNote}</div>}
					</Card>
				)}

				{byId.get('spotify') && (
					<Card i={byId.get('spotify')!}>
						<Toggle checked={on('spotify')} disabled={busy} onChange={(x) => save('integrations.spotify.enabled', x)}>Now playing and controls for Spotify</Toggle>
						{on('spotify') && nowPlayingFor('spotify')}
						<span className="oemt-muted oemt-small">Reads the song from the Spotify window title. No login, works on Free and Premium.</span>
					</Card>
				)}

				{byId.get('soundcloud') && (
					<Card i={byId.get('soundcloud')!}>
						<Toggle checked={on('soundcloud')} disabled={busy} onChange={(x) => save('integrations.soundcloud.enabled', x)}>Now playing and controls for SoundCloud</Toggle>
						{on('soundcloud') && nowPlayingFor('soundcloud')}
						<span className="oemt-muted oemt-small">Reads the playing track from your browser's SoundCloud tab (Chrome, Edge, Firefox, Brave, Opera, Vivaldi).</span>
					</Card>
				)}

				{byId.get('insights') && (
					<InsightsCard i={byId.get('insights')!} on={on('insights')} autoStart={v['integrations.insights.auto_start'] === true}
						folder={String(v['integrations.insights.recordings_dir'] ?? '')} busy={busy} save={save} />
				)}

				{(list.data ?? []).filter((i) => !['discord', 'spotify', 'soundcloud', 'insights'].includes(i.id)).map((i) => (
					<Card key={i.id} i={i}>
						<span className="oemt-muted oemt-small">Coming in a later phase.</span>
					</Card>
				))}
			</div>

			<div className="oemt-row">
				<span className="oemt-muted oemt-small">
					Everything here is off until you turn it on, runs on this PC, and never asks for passwords or tokens. Media buttons press your
					keyboard's media keys, so they control whichever app Windows treats as the active player.
				</span>
				<div className="oemt-spacer" />
				<button className="oemt-btn" onClick={() => api.integrations(true).then(list.reload, setError)}>Detect again</button>
			</div>
		</div>
	);
};
