// "Now playing" card with media controls and the Discord status. Used on Sessions and in the Quick
// Access panel; shows nothing when no music or Discord integration is turned on.
import { FC, useState } from 'react';
import { MediaAction } from '../api';
import * as live from '../liveStore';
import { openWeb, WEB_PAGES } from '../web';
import { Pill } from '../ui';

const SOURCE_LABEL = { spotify: 'Spotify', soundcloud: 'SoundCloud' } as const;

export const NowPlayingCard: FC<{ visible: boolean; compact?: boolean; onOpenIntegrations?: () => void }> = ({ visible, compact, onOpenIntegrations }) => {
	const { status } = live.useLive(visible);
	const [error, setError] = useState<string>();
	if (!status || (!status.music_enabled && !status.discord.enabled)) return null;
	const np = status.now_playing;
	const d = status.discord;

	const press = (a: MediaAction) => {
		setError(undefined);
		live.media(a).catch((e) => setError(String(e?.message ?? e)));
	};

	const discordPill = d.enabled && (
		<Pill tone={d.connected ? 'pass' : d.configured ? 'warn' : 'neutral'}
			title={d.error ?? (d.connected ? (d.showing ? 'Your Discord status is set by OEmt.club' : 'Connected; nothing to show right now') : '')}>
			{d.connected ? (d.showing ? 'Discord: showing' : 'Discord: connected') : d.configured ? 'Discord: offline' : 'Discord: needs App ID'}
		</Pill>
	);

	return (
		<section className={`oemt-panel oemt-nowplaying${compact ? ' oemt-np-compact' : ''}`} aria-label="Now playing">
			<div className="oemt-row oemt-wrap">
				<span className="oemt-label" style={{ margin: 0 }}>Now playing</span>
				{np && <span className="oemt-muted oemt-small">{SOURCE_LABEL[np.source]}</span>}
				<div className="oemt-spacer" />
				{!compact && <button className="oemt-btn oemt-small-btn" onClick={() => openWeb(WEB_PAGES.spotify)} title="Open the Spotify web player in Steam">Spotify</button>}
				{!compact && <button className="oemt-btn oemt-small-btn" onClick={() => openWeb(WEB_PAGES.soundcloud)} title="Open SoundCloud in Steam">SoundCloud</button>}
				{discordPill}
				{!compact && onOpenIntegrations && <button className="oemt-btn oemt-small-btn" onClick={onOpenIntegrations}>Integrations</button>}
			</div>
			{status.music_enabled && (
				<div className="oemt-row" style={{ marginTop: 8 }}>
					<div className="oemt-np-text">
						{np ? (
							<>
								<strong className="oemt-np-title" title={np.title}>{np.title}</strong>
								{np.artist && <span className="oemt-muted oemt-np-artist" title={np.artist}>{np.artist}</span>}
							</>
						) : (
							<span className="oemt-muted">Nothing playing (or paused)</span>
						)}
					</div>
					<div className="oemt-spacer" />
					<div className="oemt-row" role="group" aria-label="Media controls" style={{ gap: 4 }}>
						<button className="oemt-btn oemt-icon-btn" onClick={() => press('previous')} aria-label="Previous track" title="Previous">⏮</button>
						<button className="oemt-btn oemt-icon-btn oemt-primary" onClick={() => press('play_pause')} aria-label="Play or pause" title="Play / pause">⏯</button>
						<button className="oemt-btn oemt-icon-btn" onClick={() => press('next')} aria-label="Next track" title="Next">⏭</button>
					</div>
				</div>
			)}
			{error && <div className="oemt-small" style={{ color: 'var(--oemt-fail)', marginTop: 6 }}>{error}</div>}
		</section>
	);
};
