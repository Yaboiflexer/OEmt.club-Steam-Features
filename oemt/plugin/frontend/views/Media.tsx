// Media: Spotify and SoundCloud players inside OEmt.club. Save links (playlists, albums, tracks,
// artists) and play them with each service's official embedded player. The page stays mounted when
// you switch tabs, so music keeps playing.
import { FC, useEffect, useState } from 'react';
import { api, MediaItem } from '../api';
import { embedHeight, embedUrl, KIND_LABEL } from '../embed';
import { openWeb, WEB_PAGES } from '../web';
import { ConfirmButton, Empty, ErrorText, useAsync } from '../ui';

const SOURCE_LABEL = { spotify: 'Spotify', soundcloud: 'SoundCloud' } as const;

export const MediaView: FC = () => {
	const list = useAsync(() => api.mediaList());
	const [items, setItems] = useState<MediaItem[]>([]);
	const [selected, setSelected] = useState<string>();
	const [url, setUrl] = useState('');
	const [title, setTitle] = useState('');
	const [error, setError] = useState<unknown>();
	const [filter, setFilter] = useState<'all' | 'spotify' | 'soundcloud'>('all');

	useEffect(() => {
		if (!list.data) return;
		setItems(list.data);
		setSelected((s) => s ?? list.data![0]?.id);
	}, [list.data]);

	async function run(fn: () => Promise<MediaItem[]>, after?: (next: MediaItem[]) => void) {
		setError(undefined);
		try {
			const next = await fn();
			setItems(next);
			after?.(next);
		} catch (err) {
			setError(err);
		}
	}

	const add = () => url.trim() && run(() => api.mediaAdd(url.trim(), title.trim()), (next) => {
		setSelected(next[0]?.id);
		setUrl('');
		setTitle('');
	});

	const current = items.find((i) => i.id === selected);
	const shown = items.filter((i) => filter === 'all' || i.source === filter);

	return (
		<div className="oemt-media">
			<aside className="oemt-panel oemt-media-side">
				<div className="oemt-stack" style={{ gap: 6 }}>
					<input className="oemt-input" placeholder="Paste a Spotify or SoundCloud link" value={url} aria-label="Spotify or SoundCloud link"
						onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
					<div className="oemt-row">
						<input className="oemt-input" style={{ flex: 1 }} placeholder="Name (optional)" value={title} maxLength={80} aria-label="Name"
							onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
						<button className="oemt-btn oemt-primary" onClick={add} disabled={!url.trim()}>Add</button>
					</div>
					<span className="oemt-muted oemt-small">In Spotify or SoundCloud: Share, Copy link, then paste it here.</span>
				</div>
				{error ? <ErrorText error={error} /> : null}
				<div className="oemt-row" role="group" aria-label="Filter" style={{ gap: 4 }}>
					{(['all', 'spotify', 'soundcloud'] as const).map((f) => (
						<button key={f} className={`oemt-btn oemt-small-btn${filter === f ? ' oemt-primary' : ''}`} aria-pressed={filter === f}
							onClick={() => setFilter(f)}>{f === 'all' ? 'All' : SOURCE_LABEL[f]}</button>
					))}
				</div>
				<div className="oemt-media-list" role="listbox" aria-label="Saved music">
					{!list.data ? <Empty>Loading…</Empty> : shown.length === 0 ? (
						<Empty>Nothing saved yet.</Empty>
					) : shown.map((it) => (
						<div key={it.id} role="option" aria-selected={it.id === selected} tabIndex={0}
							className={`oemt-media-item${it.id === selected ? ' oemt-selected' : ''}`}
							onClick={() => setSelected(it.id)} onKeyDown={(e) => e.key === 'Enter' && setSelected(it.id)}>
							<span className={`oemt-media-dot oemt-src-${it.source}`} aria-hidden="true" />
							<span className="oemt-np-text">
								<span className="oemt-np-title">{it.title || it.ref.split('/').pop()}</span>
								<span className="oemt-muted oemt-small">{SOURCE_LABEL[it.source]} · {KIND_LABEL[it.kind] ?? it.kind}</span>
							</span>
						</div>
					))}
				</div>
				<div className="oemt-row oemt-wrap" style={{ gap: 4 }}>
					<button className="oemt-btn oemt-small-btn" onClick={() => openWeb(WEB_PAGES.spotify_playlists)}>Find Spotify playlists</button>
					<button className="oemt-btn oemt-small-btn" onClick={() => openWeb(WEB_PAGES.soundcloud_playlists)}>Find SoundCloud playlists</button>
				</div>
			</aside>

			<section className="oemt-panel oemt-media-player">
				{!current ? (
					<Empty>Add a playlist, album or track to play it here.</Empty>
				) : (
					<>
						<div className="oemt-row" style={{ marginBottom: 10 }}>
							<input className="oemt-input oemt-media-title" defaultValue={current.title} key={current.id} placeholder={current.ref} maxLength={80}
								aria-label="Name" onBlur={(e) => e.target.value !== current.title && run(() => api.mediaRename(current.id, e.target.value))} />
							<div className="oemt-spacer" />
							<button className="oemt-btn oemt-small-btn" onClick={() => openWeb(current.url)}>Open in {SOURCE_LABEL[current.source]}</button>
							<ConfirmButton label="Remove" confirmLabel="Click again"
								onConfirm={() => run(() => api.mediaRemove(current.id), (next) => setSelected(next[0]?.id))} />
						</div>
						<iframe key={current.id} className="oemt-media-frame" title={`${SOURCE_LABEL[current.source]} player`} src={embedUrl(current)}
							height={embedHeight(current)} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
						<span className="oemt-muted oemt-small" style={{ marginTop: 8 }}>
							{current.source === 'spotify'
								? 'Spotify plays full tracks when you are signed in to Spotify with Premium; otherwise 30-second previews.'
								: 'SoundCloud plays full tracks.'}{' '}Music keeps playing when you switch tabs.
						</span>
					</>
				)}
			</section>
		</div>
	);
};
