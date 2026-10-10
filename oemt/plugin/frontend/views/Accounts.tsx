import { FC, useState } from 'react';
import { api, SteamAccount } from '../api';
import { useShell } from '../shell';
import { Empty, ErrorText, fmtWhen, Panel, Pill, useAsync } from '../ui';

const STATE_LABEL: Record<string, string> = { '': 'Keep current status', online: 'Online', away: 'Away', invisible: 'Invisible', busy: 'Busy', offline: 'Offline' };

const AccountCard: FC<{
	a: SteamAccount; states: string[]; games: { appid: string; name: string }[]; canSwitch: boolean;
	onSwitch: (a: SteamAccount, state: string, appid: string) => void; onLabel: (a: SteamAccount, label: string) => void;
}> = ({ a, states, games, canSwitch, onSwitch, onLabel }) => {
	const [state, setState] = useState('');
	const [appid, setAppid] = useState('');
	const [label, setLabel] = useState(a.label ?? '');
	const [armed, setArmed] = useState(false);

	return (
		<Panel label={a.label || a.persona_name || 'Steam account'} right={a.most_recent ? <Pill tone="pass">Signed in</Pill> : undefined}>
			<div className="oemt-row oemt-wrap" style={{ marginBottom: 10 }}>
				<strong>{a.persona_name}</strong>
				<span className="oemt-muted">login {a.account_masked}</span>
				<span className="oemt-muted">· last used {fmtWhen(a.last_login)}</span>
				{!a.remembered && <Pill tone="warn" title="Steam will ask for this account's password when switching">password needed</Pill>}
			</div>
			<div className="oemt-row" style={{ marginBottom: 10 }}>
				<input className="oemt-input" style={{ flex: 1 }} placeholder="Your label (e.g. main, alt, comp)" value={label} maxLength={40}
					onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== (a.label ?? '') && onLabel(a, label)} />
			</div>
			{!a.most_recent && (
				<>
					<div className="oemt-row oemt-wrap" style={{ marginBottom: 10 }}>
						<select className="oemt-select" value={state} onChange={(e) => setState(e.target.value)}>
							{['', ...states].map((s) => <option key={s} value={s}>{STATE_LABEL[s] ?? s}</option>)}
						</select>
						<select className="oemt-select" value={appid} onChange={(e) => setAppid(e.target.value)} style={{ flex: 1 }}>
							<option value="">Don't launch a game</option>
							{games.map((g) => <option key={g.appid} value={g.appid}>Then play {g.name}</option>)}
						</select>
					</div>
					<button className={`oemt-btn${armed ? ' oemt-danger' : ' oemt-primary'}`} disabled={!canSwitch}
						onClick={() => (armed ? (setArmed(false), onSwitch(a, state, appid)) : setArmed(true))}>
						{armed ? 'Steam will restart. Click again to switch' : 'Switch to this account'}
					</button>
				</>
			)}
		</Panel>
	);
};

export const AccountsView: FC = () => {
	const shell = useShell();
	const data = useAsync(() => api.accounts());
	const lib = useAsync(() => api.library(false));
	const [error, setError] = useState<unknown>();
	const [switching, setSwitching] = useState(false);

	async function onSwitch(a: SteamAccount, state: string, appid: string) {
		setError(undefined);
		setSwitching(true);
		try {
			await api.switchAccount(a.steamid, state, appid);
			// TcNo now restarts Steam; this page goes away with it.
		} catch (err) {
			setError(err);
			setSwitching(false);
		}
	}

	async function onLabel(a: SteamAccount, label: string) {
		try {
			await api.setAccountLabel(a.steamid, label);
			data.reload();
		} catch (err) {
			setError(err);
		}
	}

	if (!data.data) return data.error ? <ErrorText error={data.error} /> : <Empty>Loading…</Empty>;
	const d = data.data;
	const games = (lib.data?.apps ?? []).filter((g) => g.installed).map((g) => ({ appid: g.appid, name: g.name }));
	const canSwitch = d.enabled && d.tcno_found && !switching;

	return (
		<div className="oemt-stack">
			{!d.tcno_found && (
				<div className="oemt-panel oemt-banner oemt-fail">
					TcNo Account Switcher wasn't found in Program Files. Install it from tcno.co to switch accounts. Listing works without it.
				</div>
			)}
			{d.tcno_found && !d.enabled && (
				<div className="oemt-panel oemt-banner">
					<div className="oemt-row">
						<span>Switching uses TcNo Account Switcher. Turn on the TcNo integration to allow it.</span>
						<div className="oemt-spacer" />
						<button className="oemt-btn oemt-primary" onClick={() => api.setSetting('integrations.tcno.enabled', true).then(data.reload, setError)}>Turn on</button>
					</div>
				</div>
			)}
			{switching && <div className="oemt-panel oemt-banner">Switching… TcNo is restarting Steam.</div>}
			{error ? <ErrorText error={error} /> : null}
			{d.error && <div className="oemt-panel oemt-banner oemt-fail">{d.error}</div>}

			<div className="oemt-muted oemt-small">
				Accounts come from Steam's own list of remembered sign-ins. OEmt.club never sees or stores passwords; TcNo does the switch.
				Labels are saved only on this PC. Switching is blocked while a game is running.{' '}
				<button className="oemt-gameitem" style={{ display: 'inline', width: 'auto', padding: 0 }} onClick={() => shell.go('integrations')}>TcNo status</button>
			</div>

			{d.accounts.length === 0 ? (
				<Empty>Steam doesn't remember any accounts yet. Sign in once with "Remember me" ticked.</Empty>
			) : (
				<div className="oemt-grid">
					{d.accounts.map((a) => (
						<AccountCard key={a.steamid} a={a} states={d.states} games={games} canSwitch={canSwitch} onSwitch={onSwitch} onLabel={onLabel} />
					))}
				</div>
			)}
		</div>
	);
};
