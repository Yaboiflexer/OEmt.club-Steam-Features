// Integrations: one clean row per service. The header shows status and the main switch; settings
// appear only when the integration is on. Discord Rich Presence, Spotify / SoundCloud now playing with
// media keys, and Insights Capture. Everything runs on this PC and is off until turned on.
import { FC, ReactNode, useEffect, useState } from 'react';
import { api, CapabilityStatus, Integration, MediaAction } from '../api';
import * as live from '../liveStore';
import { useShell, useTabActive } from '../shell';
import { Empty, ErrorText, fmtBytes, fmtTime, Pill, Tone, useAsync } from '../ui';
import { MediaControls } from './MediaControls';

const CAP_TONE: Record<CapabilityStatus, Tone> = { available: 'pass', planned: 'accent', unsupported: 'fail' };
const BRAND: Record<string, { color: string; letter: string; blurb: string }> = {
	discord: { color: '#5865F2', letter: 'D', blurb: 'Show the game you are playing on your Discord profile.' },
	spotify: { color: '#1DB954', letter: 'S', blurb: 'See the current song and control playback.' },
	soundcloud: { color: '#FF5500', letter: 'S', blurb: 'See the track playing in your browser and control it.' },
	insights: { color: '#7B61FF', letter: 'I', blurb: 'Start Insights Capture with your games and find your clips.' },
};

const Switch: FC<{ checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, disabled, onChange, label }) => (
	<input type="checkbox" className="oemt-switch" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
);

/** One setting: label + optional hint on the left, control on the right. */
const Setting: FC<{ label: string; hint?: ReactNode; children: ReactNode }> = ({ label, hint, children }) => (
	<div className="oemt-set">
		<div className="oemt-set-text">
			<span>{label}</span>
			{hint && <span className="oemt-muted oemt-small">{hint}</span>}
		</div>
		<div className="oemt-set-ctl">{children}</div>
	</div>
);

const Row: FC<{ i: Integration; on: boolean; busy: boolean; onToggle: (v: boolean) => void; status?: ReactNode; children?: ReactNode }> = ({ i, on, busy, onToggle, status, children }) => {
	const b = BRAND[i.id] ?? { color: 'var(--oemt-accent)', letter: i.name[0], blurb: '' };
	return (
		<section className={`oemt-panel oemt-int${on ? ' oemt-int-on' : ''}`} aria-label={i.name}>
			<header className="oemt-int-head">
				<span className="oemt-int-badge" style={{ background: b.color }} aria-hidden="true">{b.letter}</span>
				<div className="oemt-int-name">
					<div className="oemt-row" style={{ gap: 8 }}>
						<h3>{i.name}</h3>
						{i.detection.status === 'not_installed' && <Pill tone="neutral">Not installed</Pill>}
						{status}
					</div>
					<span className="oemt-muted oemt-small">{b.blurb}</span>
				</div>
				<Switch checked={on} disabled={busy} onChange={onToggle} label={`Turn ${i.name} on or off`} />
			</header>
			{on && children && <div className="oemt-int-body">{children}</div>}
			{on && (
				<details className="oemt-caps">
					<summary className="oemt-muted oemt-small">Details</summary>
					{i.capabilities.map((c) => (
						<div key={c.id} className="oemt-row oemt-small" style={{ padding: '3px 0', alignItems: 'flex-start' }}>
							<Pill tone={CAP_TONE[c.status]}>{c.status}</Pill>
							<span>{c.label}{c.note && <span className="oemt-muted"> · {c.note}</span>}</span>
						</div>
					))}
				</details>
			)}
		</section>
	);
};

const InsightsBody: FC<{ autoStart: boolean; folder: string; busy: boolean; save: (k: string, v: unknown) => Promise<void>; onStatus: (n: ReactNode) => void }> = ({ autoStart, folder, busy, save, onStatus }) => {
	const st = useAsync(() => api.insightsStatus(true));
	const [dir, setDir] = useState(folder);
	const [err, setErr] = useState<unknown>();
	useEffect(() => setDir(folder), [folder]);
	const s = st.data;
	useEffect(() => onStatus(s?.installed ? <Pill tone={s.running ? 'pass' : 'neutral'}>{s.running ? 'Running' : 'Not running'}</Pill> : null), [s]); // eslint-disable-line react-hooks/exhaustive-deps
	const act = (p: Promise<unknown>, reload = true) => p.then(() => reload && setTimeout(st.reload, 1500), setErr);
	if (!s) return <span className="oemt-muted oemt-small">Checking…</span>;
	if (!s.installed) return <span className="oemt-muted oemt-small">Insights Capture isn't installed. Get it from insights.gg.</span>;
	return (
		<>
			{err ? <div className="oemt-small" style={{ color: 'var(--oemt-fail)' }}>{String((err as Error)?.message ?? err)}</div> : null}
			<Setting label="Insights Capture" hint={s.variant}>
				<button className="oemt-btn oemt-small-btn" onClick={() => act(api.insightsOpen())}>{s.running ? 'Show' : 'Open'}</button>
			</Setting>
			<Setting label="Start it when a game starts" hint="So recording is ready when you play.">
				<Switch checked={autoStart} disabled={busy} onChange={(x) => save('integrations.insights.auto_start', x)} label="Start Insights when a game starts" />
			</Setting>
			<Setting label="Recordings folder" hint="Where Insights saves videos.">
				<div className="oemt-row" style={{ gap: 6 }}>
					<input className="oemt-input oemt-compact-input" placeholder={s.recordings_dir} value={dir} maxLength={400} aria-label="Recordings folder"
						onChange={(e) => setDir(e.target.value)} onBlur={() => dir.trim() !== folder && save('integrations.insights.recordings_dir', dir.trim()).then(() => st.reload())}
						onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
					<button className="oemt-btn oemt-small-btn" onClick={() => act(api.insightsReveal(''), false)}>Open</button>
				</div>
			</Setting>
			<div className="oemt-int-list">
				<span className="oemt-label" style={{ margin: 0 }}>Recent recordings · {s.recordings_total}</span>
				{s.recordings.length === 0 ? <span className="oemt-muted oemt-small">None in this folder yet.</span> : s.recordings.slice(0, 5).map((r) => (
					<button key={r.path} className="oemt-int-file" onClick={() => act(api.insightsReveal(r.path), false)} title={`Show ${r.path}`}>
						<span className="oemt-np-title">{r.name}</span>
						<span className="oemt-muted oemt-small">{fmtTime(r.mtime)} · {fmtBytes(r.size)}</span>
					</button>
				))}
			</div>
		</>
	);
};

export const IntegrationsView: FC = () => {
	const shell = useShell();
	const visible = useTabActive();
	const list = useAsync(() => api.integrations(false));
	const settings = useAsync(() => api.settings());
	const { status, error: liveError } = live.useLive(visible);
	const [error, setError] = useState<unknown>();
	const [busy, setBusy] = useState(false);
	const [appId, setAppId] = useState('');
	const [note, setNote] = useState<string>();
	const [insightsPill, setInsightsPill] = useState<ReactNode>(null);

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
		if (clean && !/^\d{17,20}$/.test(clean)) return setError(new Error('A Discord Application ID is 17 to 20 digits.'));
		await save('integrations.discord.client_id', clean);
	}

	async function test() {
		setNote(undefined);
		setError(undefined);
		try {
			await live.discordTest();
			setNote('Check your Discord profile: "Rich Presence is working" shows for 15 seconds.');
		} catch (err) {
			setError(err);
		}
	}

	const press = (a: MediaAction) => live.media(a).catch(setError);
	const on = (id: string) => v[`integrations.${id}.enabled`] === true;
	const flag = (k: string, dflt = false) => (v[k] === undefined ? dflt : v[k] === true);
	const byId = new Map((list.data ?? []).map((i) => [i.id, i]));
	const d = status?.discord;
	const np = status?.now_playing;

	const nowPlaying = (source: 'spotify' | 'soundcloud') => (
		<div className="oemt-int-np">
			<div className="oemt-np-text">
				{np?.source === source ? (
					<><strong className="oemt-np-title">{np.title}</strong>{np.artist && <span className="oemt-muted oemt-np-artist">{np.artist}</span>}</>
				) : (
					<span className="oemt-muted">{source === 'spotify' ? 'Nothing playing in Spotify' : 'No SoundCloud tab playing'}</span>
				)}
			</div>
			<MediaControls onPress={press} />
		</div>
	);

	if (!list.data || !settings.data) {
		return list.error || settings.error ? <ErrorText error={list.error ?? settings.error} /> : <Empty>Loading integrations…</Empty>;
	}

	const discordPill = on('discord') && d && (
		<Pill tone={d.connected ? 'pass' : d.configured ? 'warn' : 'neutral'} title={d.error}>
			{d.connected ? (d.showing ? 'Live on Discord' : 'Connected') : d.configured ? 'Not connected' : 'Needs App ID'}
		</Pill>
	);

	return (
		<div className="oemt-int-page">
			{error ? <ErrorText error={error} /> : null}
			{liveError && <div className="oemt-panel oemt-banner oemt-small">Live status unavailable: {liveError}</div>}

			{byId.get('discord') && (
				<Row i={byId.get('discord')!} on={on('discord')} busy={busy} onToggle={(x) => save('integrations.discord.enabled', x)} status={discordPill}>
					<Setting label="Application ID" hint="From discord.com/developers. Public; no login or token.">
						<div className="oemt-row" style={{ gap: 6 }}>
							<input className="oemt-input oemt-compact-input" inputMode="numeric" placeholder="17-20 digits" value={appId} maxLength={24} aria-label="Discord Application ID"
								onChange={(e) => setAppId(e.target.value)} onBlur={saveAppId} onKeyDown={(e) => e.key === 'Enter' && saveAppId()} />
							<button className="oemt-btn oemt-small-btn" onClick={test} disabled={!d?.configured}>Test</button>
						</div>
					</Setting>
					<Setting label={'Show "In Steam" when idle'}>
						<Switch checked={flag('integrations.discord.idle_presence')} disabled={busy} onChange={(x) => save('integrations.discord.idle_presence', x)} label="Show In Steam when idle" />
					</Setting>
					<Setting label="Show the song I'm listening to">
						<Switch checked={flag('integrations.discord.show_music')} disabled={busy} onChange={(x) => save('integrations.discord.show_music', x)} label="Show the song" />
					</Setting>
					<Setting label={'"Join OEmt.club" button'} hint="discord.gg/OEmt">
						<Switch checked={flag('integrations.discord.invite_button', true)} disabled={busy} onChange={(x) => save('integrations.discord.invite_button', x)} label="Join OEmt.club button" />
					</Setting>
					{d?.error && <div className="oemt-small" style={{ color: 'var(--oemt-warn)' }}>{d.error}</div>}
					{note && <div className="oemt-small oemt-muted">{note}</div>}
				</Row>
			)}

			{byId.get('spotify') && (
				<Row i={byId.get('spotify')!} on={on('spotify')} busy={busy} onToggle={(x) => save('integrations.spotify.enabled', x)}>
					{nowPlaying('spotify')}
					<span className="oemt-muted oemt-small">Read from the Spotify app window; no login. Play playlists on the <button className="oemt-link" onClick={() => shell.go('media')}>Media</button> page.</span>
				</Row>
			)}

			{byId.get('soundcloud') && (
				<Row i={byId.get('soundcloud')!} on={on('soundcloud')} busy={busy} onToggle={(x) => save('integrations.soundcloud.enabled', x)}>
					{nowPlaying('soundcloud')}
					<span className="oemt-muted oemt-small">Read from your browser's SoundCloud tab (keep it selected). Play sets on the <button className="oemt-link" onClick={() => shell.go('media')}>Media</button> page.</span>
				</Row>
			)}

			{byId.get('insights') && (
				<Row i={byId.get('insights')!} on={on('insights')} busy={busy} onToggle={(x) => save('integrations.insights.enabled', x)} status={on('insights') ? insightsPill : null}>
					<InsightsBody autoStart={flag('integrations.insights.auto_start')} folder={String(v['integrations.insights.recordings_dir'] ?? '')}
						busy={busy} save={save} onStatus={setInsightsPill} />
				</Row>
			)}

			<div className="oemt-row oemt-small oemt-muted" style={{ padding: '0 4px' }}>
				<span>Off until you turn it on. Runs on this PC. Never asks for passwords.</span>
				<div className="oemt-spacer" />
				<button className="oemt-link" onClick={() => api.integrations(true).then(list.reload, setError)}>Detect again</button>
			</div>
		</div>
	);
};
