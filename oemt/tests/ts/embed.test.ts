import { describe, expect, test } from 'bun:test';
import { embedHeight, embedUrl } from '../../plugin/frontend/embed';

describe('embedded players', () => {
	test('Spotify uses the official embed URL', () => {
		expect(embedUrl({ source: 'spotify', kind: 'playlist', ref: 'playlist/37i9dQZF1DXcBWIGoYBM5M', url: '' }))
			.toBe('https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=oemt&theme=0');
		expect(embedHeight({ source: 'spotify', kind: 'track' })).toBe(152);
		expect(embedHeight({ source: 'spotify', kind: 'playlist' })).toBe(480);
	});

	test('SoundCloud uses the widget with the encoded track or set URL', () => {
		const u = new URL(embedUrl({ source: 'soundcloud', kind: 'playlist', ref: 'a/sets/b', url: 'https://soundcloud.com/a/sets/b' }));
		expect(u.origin + u.pathname).toBe('https://w.soundcloud.com/player/');
		expect(u.searchParams.get('url')).toBe('https://soundcloud.com/a/sets/b');
		expect(u.searchParams.get('visual')).toBe('true');
		expect(embedHeight({ source: 'soundcloud', kind: 'track' })).toBe(166);
	});
});
