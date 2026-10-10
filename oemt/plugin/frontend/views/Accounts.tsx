import { DragEvent, FC, ReactNode, useEffect, useState } from 'react';
import { AccountFolder, api, SteamAccount } from '../api';
import { useShell } from '../shell';
import { ConfirmButton, Empty, ErrorText, fmtWhen, Pill, useAsync } from '../ui';

const STATE_LABEL: Record<string, string> = { '': 'Keep current status', online: 'Online', away: 'Away', invisible: 'Invisible', busy: 'Busy', offline: 'Offline' };
const DRAG_TYPE = 'application/x-oemt-account';
const UNSORTED = '';

type Game = { appid: string; name: string };

const AccountCard: FC<{
	a: SteamAccount; states: string[]; games: Game[]; canSwitch: boolean; folders: AccountFolder[]; folderId: string;
	onSwitch: (a: SteamAccount, state: string, appid: string) => void; onLabel: (a: SteamAccount, label: string) => void;
	onMove: (steamid: string, folderId: string) => void;
}> = ({ a, states, games, canSwitch, folders, folderId, onSwitch, onLabel, onMove }) => {
	const [state, setState] = useState('');
	const [appid, setAppid] = useState('');
	const [label, setLabel] = useState(a.label ?? '');
	const [armed, setArmed] = useState(false);
	useEffect(() => setLabel(a.label ?? ''), [a.label]);
	useEffect(() => {
		if (!armed) return;
		const t = setTimeout(() => setArmed(false), 4000);
		return () => clearTimeout(t);
	}, [armed]);

	return (
		<section className="oemt-panel oemt-account" draggable title="Drag onto a folder"
			onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, a.steamid); e.dataTransfer.effectAllowed = 'move'; }}>
			<div className="oemt-row" style={{ marginBottom: 8 }}>
				<span className="oemt-grip" aria-hidden="true">⋮⋮</span>
				<strong>{a.label || a.persona_name || 'Steam account'}</strong>
				<div className="oemt-spacer" />
				{a.most_recent && <Pill tone="pass">Signed in</Pill>}
				{!a.remembered && <Pill tone="warn" title="Steam will ask for this account's password when switching">password needed</Pill>}
			</div>
			<div className="oemt-muted oemt-small" style={{ marginBottom: 8 }}>
				{a.persona_name} · login {a.account_masked} · last used {fmtWhen(a.last_login)}
			</div>
			<div className="oemt-row" style={{ marginBottom: 8 }}>
				<input className="oemt-input" style={{ flex: 1 }} placeholder="Label (main, alt, comp…)" value={label} maxLength={40}
					onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== (a.label ?? '') && onLabel(a, label)} />
				<select className="oemt-select" value={folderId} title="Move to folder" onChange={(e) => onMove(a.steamid, e.target.value)}>
					<option value={UNSORTED}>Unsorted</option>
					{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
				</select>
			</div>
			{!a.most_recent && (
				<>
					<div className="oemt-row oemt-wrap" style={{ marginBottom: 8 }}>
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
		</section>
	);
};

/** A folder (or the Unsorted area) that accepts dropped accounts. */
const DropZone: FC<{ onDrop: (steamid: string) => void; className?: string; children: ReactNode }> = ({ onDrop, className, children }) => {
	const [over, setOver] = useState(false);
	const accepts = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(DRAG_TYPE);
	return (
		<div className={`${className ?? ''}${over ? ' oemt-dropping' : ''}`}
			onDragOver={(e) => { if (accepts(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true); } }}
			onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
			onDrop={(e) => { setOver(false); const id = e.dataTransfer.getData(DRAG_TYPE); if (id) { e.preventDefault(); onDrop(id); } }}>
			{children}
		</div>
	);
};

const FolderHeader: FC<{ folder: AccountFolder; count: number; onRename: (n: string) => void; onToggle: () => void; onDelete: () => void }> = ({ folder, count, onRename, onToggle, onDelete }) => {
	const [editing, setEditing] = useState(false);
	const [name, setName] = useState(folder.name);
	useEffect(() => setName(folder.name), [folder.name]);
	const commit = () => { setEditing(false); if (name.trim() && name !== folder.name) onRename(name.trim()); else setName(folder.name); };
	return (
		<div className="oemt-row" style={{ marginBottom: folder.collapsed ? 0 : 10 }}>
			<button className="oemt-btn oemt-small" onClick={onToggle} title={folder.collapsed ? 'Expand' : 'Collapse'}>{folder.collapsed ? '▸' : '▾'}</button>
			{editing ? (
				<input className="oemt-input" autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)}
					onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setName(folder.name); setEditing(false); } }} />
			) : (
				<h3 className="oemt-label" style={{ margin: 0, cursor: 'text' }} title="Click to rename" onClick={() => setEditing(true)}>📁 {folder.name}</h3>
			)}
			<span className="oemt-muted oemt-small">{count}</span>
			<div className="oemt-spacer" />
			<ConfirmButton label="Delete folder" confirmLabel="Click again (accounts go to Unsorted)" onConfirm={onDelete} />
		</div>
	);
};

export const AccountsView: FC = () => {
	const shell = useShell();
	const data = useAsync(() => api.accounts());
	const lib = useAsync(() => api.library(false));
	const [folders, setFolders] = useState<AccountFolder[]>([]);
	const [error, setError] = useState<unknown>();
	const [switching, setSwitching] = useState(false);

	useEffect(() => { if (data.data) setFolders(data.data.folders); }, [data.data]);

	/** Optimistic: update the screen at once, save in the background, roll back on failure. */
	async function saveFolders(next: AccountFolder[]) {
		const prev = folders;
		setFolders(next);
		setError(undefined);
		try {
			setFolders(await api.saveAccountFolders(next));
		} catch (err) {
			setFolders(prev);
			setError(err);
		}
	}

	function move(steamid: string, folderId: string) {
		saveFolders(folders.map((f) => {
			const without = f.accounts.filter((id) => id !== steamid);
			return f.id === folderId ? { ...f, accounts: [...without, steamid] } : { ...f, accounts: without };
		}));
	}

	function newFolder() {
		const id = `f-${Date.now().toString(36)}`;
		saveFolders([...folders, { id, name: `Folder ${folders.length + 1}`, accounts: [] }]);
	}

	async function onSwitch(a: SteamAccount, state: string, appid: string) {
		setError(undefined);
		setSwitching(true);
		try {
			await api.switchAccount(a.steamid, state, appid);
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

	const startHere = shell.overview?.settings.default_tab === 'accounts';
	async function toggleStartHere() {
		try {
			await api.setSetting('ui.default_tab', startHere ? 'home' : 'accounts');
			shell.refreshOverview();
		} catch (err) {
			setError(err);
		}
	}

	if (!data.data) return data.error ? <ErrorText error={data.error} /> : <Empty>Loading…</Empty>;
	const d = data.data;
	const games: Game[] = (lib.data?.apps ?? []).filter((g) => g.installed).map((g) => ({ appid: g.appid, name: g.name }));
	const canSwitch = d.enabled && d.tcno_found && !switching;
	const byId = new Map(d.accounts.map((a) => [a.steamid, a]));
	const placed = new Set(folders.flatMap((f) => f.accounts));
	const unsorted = d.accounts.filter((a) => !placed.has(a.steamid));
	const folderOf = (id: string) => folders.find((f) => f.accounts.includes(id))?.id ?? UNSORTED;
	const card = (a: SteamAccount) => (
		<AccountCard key={a.steamid} a={a} states={d.states} games={games} canSwitch={canSwitch} folders={folders}
			folderId={folderOf(a.steamid)} onSwitch={onSwitch} onLabel={onLabel} onMove={move} />
	);

	return (
		<div className="oemt-stack">
			<div className="oemt-panel oemt-strip">
				<button className="oemt-btn oemt-primary" onClick={newFolder}>+ New folder</button>
				<span className="oemt-muted oemt-small">Drag accounts onto folders. Click a folder name to rename it.</span>
				<div className="oemt-spacer" />
				<label className="oemt-row" style={{ cursor: 'pointer' }} title="Open OEmt.club on the Accounts tab when Steam starts">
					<input type="checkbox" className="oemt-switch" checked={startHere} onChange={toggleStartHere} />
					<span>Start here</span>
				</label>
			</div>

			{!d.tcno_found && (
				<div className="oemt-panel oemt-banner oemt-fail">TcNo Account Switcher wasn't found in Program Files. Install it from tcno.co to switch accounts. Listing and folders work without it.</div>
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

			{folders.map((f) => {
				const accounts = f.accounts.map((id) => byId.get(id)).filter((a): a is SteamAccount => !!a);
				return (
					<DropZone key={f.id} className="oemt-panel oemt-folder" onDrop={(id) => move(id, f.id)}>
						<FolderHeader folder={f} count={accounts.length}
							onRename={(name) => saveFolders(folders.map((x) => (x.id === f.id ? { ...x, name } : x)))}
							onToggle={() => saveFolders(folders.map((x) => (x.id === f.id ? { ...x, collapsed: !x.collapsed } : x)))}
							onDelete={() => saveFolders(folders.filter((x) => x.id !== f.id))} />
						{!f.collapsed && (accounts.length ? <div className="oemt-grid">{accounts.map(card)}</div> : <Empty>Drop accounts here.</Empty>)}
					</DropZone>
				);
			})}

			<DropZone className="oemt-panel oemt-folder" onDrop={(id) => move(id, UNSORTED)}>
				<h3 className="oemt-label">Unsorted ({unsorted.length})</h3>
				{d.accounts.length === 0 ? (
					<Empty>Steam doesn't remember any accounts yet. Sign in once with "Remember me" ticked.</Empty>
				) : unsorted.length ? (
					<div className="oemt-grid">{unsorted.map(card)}</div>
				) : (
					<Empty>Every account is in a folder. Drop one here to take it out.</Empty>
				)}
			</DropZone>

			<div className="oemt-muted oemt-small">
				Accounts come from Steam's own list of remembered sign-ins. OEmt.club never sees or stores passwords; TcNo does the switch.
				Labels and folders are saved only on this PC. Switching is blocked while a game is running.
			</div>
		</div>
	);
};
