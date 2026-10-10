// Discord Rich Presence settings (shown in Settings): the game you play, for how long, and a
// "Join OEmt.club" button linking discord.gg/OEmt. Uses only a public Application ID.
import { FC, ReactNode, useEffect, useState } from 'react';
import { api } from '../api';
import * as live from '../liveStore';
import { useTabActive } from '../shell';
import { ErrorText, Pill } from '../ui';

const Switch: FC<{ checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, disabled, onChange, label }) => (
	<input type="checkbox" className="oemt-switch" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
);

const Setting: FC<{ label: string; hint?: ReactNode; children: ReactNode }> = ({ label, hint, children }) => (
	<div className="oemt-set">
		<div className="oemt-set-text">
			<span>{label}</span>
			{hint && <span className="oemt-muted oemt-small">{hint}</span>}
		</div>
		<div className="oemt-set-ctl">{children}</div>
	</div>
);

export const DiscordPanel: FC<{ values: Record<string, unknown>; onSaved: () => void }> = ({ values, onSaved }) => {
	const { status } = live.useLive(useTabActive());
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<unknown>();
	const [note, setNote] = useState<string>();
	const [appId, setAppId] = useState('');
	const saved = String(values['integrations.discord.client_id'] ?? '');
	useEffect(() => setAppId(saved), [saved]);

	const on = values['integrations.discord.enabled'] === true;
	const flag = (k: string, dflt = false) => (values[k] === undefined ? dflt : values[k] === true);
	const d = status?.discord;

	async function save(key: string, value: unknown) {
		setError(undefined);
		setBusy(true);
		try {
			await api.setSetting(key, value);
			onSaved();
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
		if (clean === saved) return;
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

	return (
		<section className={`oemt-panel oemt-int${on ? ' oemt-int-on' : ''}`} aria-label="Discord Rich Presence">
			<header className="oemt-int-head">
				<span className="oemt-int-badge" style={{ background: '#5865F2' }} aria-hidden="true">D</span>
				<div className="oemt-int-name">
					<div className="oemt-row" style={{ gap: 8 }}>
						<h3>Discord Rich Presence</h3>
						{on && d && (
							<Pill tone={d.connected ? 'pass' : d.configured ? 'warn' : 'neutral'} title={d.error}>
								{d.connected ? (d.showing ? 'Live on Discord' : 'Connected') : d.configured ? 'Not connected' : 'Needs App ID'}
							</Pill>
						)}
					</div>
					<span className="oemt-muted oemt-small">Show the game you are playing on your Discord profile, with a link to discord.gg/OEmt.</span>
				</div>
				<Switch checked={on} disabled={busy} onChange={(x) => save('integrations.discord.enabled', x)} label="Turn Discord Rich Presence on or off" />
			</header>
			{error ? <ErrorText error={error} /> : null}
			{on && (
				<div className="oemt-int-body">
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
					<Setting label={'"Join OEmt.club" button'} hint="Links discord.gg/OEmt">
						<Switch checked={flag('integrations.discord.invite_button', true)} disabled={busy} onChange={(x) => save('integrations.discord.invite_button', x)} label="Join OEmt.club button" />
					</Setting>
					{d?.error && <div className="oemt-small" style={{ color: 'var(--oemt-warn)' }}>{d.error}</div>}
					{note && <div className="oemt-small oemt-muted">{note}</div>}
				</div>
			)}
		</section>
	);
};
