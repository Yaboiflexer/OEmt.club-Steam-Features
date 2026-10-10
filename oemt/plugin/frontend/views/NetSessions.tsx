import { FC, useEffect, useState } from 'react';
import { isNetSessionsSub, NETSESSIONS_SUBS, NetSessionsSub } from '../routes';
import { useShell } from '../shell';
import { SessionsView } from './Sessions';
import { NetworkView } from './Network';

/** Network & Sessions: one tab replacing the old Sessions and Network tabs (old ids redirect here). */
export const NetSessionsView: FC = () => {
	const shell = useShell();
	const [sub, setSub] = useState<NetSessionsSub>('overview');

	useEffect(() => {
		if (shell.route.tab === 'netsessions' && isNetSessionsSub(shell.route.sub)) setSub(shell.route.sub);
	}, [shell.route.seq]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => shell.setCrumb('netsessions', NETSESSIONS_SUBS.find((s) => s.id === sub)?.label), [sub]); // eslint-disable-line react-hooks/exhaustive-deps

	const showSessions = sub === 'overview' || sub === 'active' || sub === 'history';
	const showNetwork = sub === 'overview' || sub === 'network' || sub === 'connections';

	return (
		<div className="oemt-stack">
			<nav className="oemt-more" role="tablist" aria-label="Network & Sessions">
				{NETSESSIONS_SUBS.map((s) => (
					<button key={s.id} role="tab" aria-selected={sub === s.id} className={`oemt-tab${sub === s.id ? ' oemt-active' : ''}`} onClick={() => setSub(s.id)}>{s.label}</button>
				))}
			</nav>
			{showSessions && <SessionsView />}
			{showNetwork && <NetworkView />}
		</div>
	);
};
