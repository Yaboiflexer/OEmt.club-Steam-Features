// Previous / play-pause / next buttons (SVG icons). They press Windows media keys through the backend.
import { FC, ReactElement } from 'react';
import { MediaAction } from '../api';

const ICONS: Record<MediaAction, ReactElement> = {
	previous: <path d="M6 5h2v14H6zM20 5v14L9 12z" />,
	play_pause: <path d="M5 4l9 8-9 8zM15 5h2.5v14H15zM19.5 5H22v14h-2.5z" />,
	next: <path d="M16 5h2v14h-2zM4 5l11 7-11 7z" />,
};
const LABEL: Record<MediaAction, string> = { previous: 'Previous track', play_pause: 'Play or pause', next: 'Next track' };

export const MediaControls: FC<{ onPress: (a: MediaAction) => void }> = ({ onPress }) => (
	<div className="oemt-media-ctl" role="group" aria-label="Media controls">
		{(['previous', 'play_pause', 'next'] as const).map((a) => (
			<button key={a} className={`oemt-ctl-btn${a === 'play_pause' ? ' oemt-ctl-main' : ''}`} onClick={() => onPress(a)} aria-label={LABEL[a]} title={LABEL[a]}>
				<svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[a]}</svg>
			</button>
		))}
	</div>
);
