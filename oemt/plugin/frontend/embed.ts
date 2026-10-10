// Official embedded players: Spotify Embed and the SoundCloud Widget. Pure functions (unit-tested).
import type { MediaItem } from './api';

/** Player height per kind: compact for single tracks, tall for lists. */
export function embedHeight(item: Pick<MediaItem, 'source' | 'kind'>): number {
	if (item.source === 'spotify') return item.kind === 'track' || item.kind === 'episode' ? 152 : 480;
	return item.kind === 'track' ? 166 : 480;
}

/** URL of the official player for a saved item. `accent` is "#rrggbb" for SoundCloud's play button. */
export function embedUrl(item: Pick<MediaItem, 'source' | 'kind' | 'ref' | 'url'>, accent = '#6d6af5'): string {
	if (item.source === 'spotify') return `https://open.spotify.com/embed/${item.ref}?utm_source=oemt&theme=0`;
	const params = new URLSearchParams({
		url: item.url, color: accent, auto_play: 'false', hide_related: 'true', show_comments: 'false',
		show_user: 'true', show_reposts: 'false', show_teaser: 'false', visual: item.kind === 'track' ? 'false' : 'true',
	});
	return `https://w.soundcloud.com/player/?${params.toString()}`;
}

export const KIND_LABEL: Record<string, string> = {
	playlist: 'Playlist', album: 'Album', track: 'Track', artist: 'Artist', episode: 'Episode', show: 'Podcast',
};
