import { describe, expect, test } from 'bun:test';
import { steamOpenUrl, WEB_PAGES } from '../../plugin/frontend/web';
import { parseTopbar, TOPBAR_CHOICES } from '../../plugin/frontend/routes';

describe('web pages in Steam', () => {
	test('https pages become steam://openurl links; anything else is refused', () => {
		expect(steamOpenUrl('https://open.spotify.com/')).toBe('steam://openurl/https://open.spotify.com/');
		expect(steamOpenUrl('http://example.com')).toBeUndefined();
		expect(steamOpenUrl('javascript:alert(1)')).toBeUndefined();
		expect(steamOpenUrl('https://x.test/" & calc')).toBeUndefined();
		for (const url of Object.values(WEB_PAGES)) expect(steamOpenUrl(url)).toBeDefined();
	});

	test('Spotify and SoundCloud can be added to the top bar, off by default', () => {
		const web = TOPBAR_CHOICES.filter((c) => c.kind === 'web');
		expect(web.map((c) => c.id)).toEqual(['spotify', 'soundcloud']);
		for (const c of web) expect(steamOpenUrl(c.url!)).toBeDefined();
		expect(parseTopbar(undefined).some((c) => c.kind === 'web')).toBe(false);
		expect(parseTopbar('sessions,spotify').map((c) => c.id)).toEqual(['sessions', 'spotify']);
	});
});
