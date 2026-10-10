import { describe, expect, test } from 'bun:test';
import {
	DEFAULT_TAB, DEFAULT_TOPBAR, LEGACY_REDIRECTS, OEMT_ROUTE_PATTERN, parseTopbar, pathToRoute, resolveRoute, routeToPath, startTarget, TAB_IDS, TOPBAR_CHOICES,
} from '../../plugin/frontend/routes';

describe('URL paths', () => {
	test('every tab round-trips through its path', () => {
		for (const tab of TAB_IDS) {
			expect(routeToPath({ tab })).toBe(`/oemt/${tab}`);
			expect(pathToRoute(tab)).toEqual({ tab, sub: undefined, redirected: false });
		}
	});

	test('pages: Sessions, Settings, Diagnostics; Sessions is the start page', () => {
		expect(TAB_IDS).toEqual(['sessions', 'settings', 'diagnostics']);
		expect(DEFAULT_TAB).toBe('sessions');
		expect(pathToRoute(undefined)).toEqual({ tab: 'sessions', redirected: false });
	});

	test('removed and renamed pages redirect', () => {
		for (const old of ['network-sessions', 'netsessions', 'network', 'home', 'library', 'accounts', 'media']) {
			expect(pathToRoute(old)).toEqual({ tab: 'sessions', redirected: true });
		}
		expect(pathToRoute('network-sessions', 'history')).toEqual({ tab: 'sessions', redirected: true });
		expect(pathToRoute('performance')).toEqual({ tab: 'diagnostics', sub: 'performance', redirected: true });
		expect(routeToPath(pathToRoute('performance'))).toBe('/oemt/diagnostics/performance');
	});

	test('unknown paths fall back to Sessions and are flagged for redirect', () => {
		expect(pathToRoute('nope')).toEqual({ tab: 'sessions', redirected: true });
		expect(pathToRoute('constructor')).toEqual({ tab: 'sessions', redirected: true });
	});

	test('one route pattern serves every page', () => {
		expect(OEMT_ROUTE_PATTERN).toBe('/oemt/:tab?/:sub?');
	});
});

describe('navigation ids', () => {
	test('legacy ids resolve; Performance is not top-level', () => {
		for (const old of ['netsessions', 'network', 'performance', 'home', 'library', 'accounts']) expect(TAB_IDS).not.toContain(old as never);
		expect(resolveRoute('performance')).toEqual(LEGACY_REDIRECTS.performance);
		expect(resolveRoute('home')).toEqual({ tab: 'sessions' });
		expect(resolveRoute('sessions')).toEqual({ tab: 'sessions', sub: undefined });
		expect(resolveRoute('constructor')).toEqual({ tab: 'sessions' });
	});

	test('default top bar: Sessions and Settings only', () => {
		expect(parseTopbar(DEFAULT_TOPBAR).map((i) => i.id)).toEqual(['sessions', 'settings']);
		expect(TOPBAR_CHOICES.some((c) => c.id === 'home' || c.id === 'library' || c.id === 'accounts')).toBe(false);
	});

	test('saved old ids collapse into one Sessions item; unknown ids are dropped', () => {
		expect(parseTopbar('home,accounts,netsessions,settings,diagnostics').map((i) => i.id)).toEqual(['sessions', 'settings', 'diagnostics']);
		expect(parseTopbar('network,library,sessions,performance,bogus,settings,settings').map((i) => i.id)).toEqual(['sessions', 'diagnostics', 'settings']);
	});

	test('choice ids are unique', () => {
		const ids = TOPBAR_CHOICES.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe('start page', () => {
	test('OEmt tabs open their path; Steam pages open steam:// links; unknown ids open Sessions', () => {
		expect(startTarget('settings')).toEqual({ kind: 'tab', path: '/oemt/settings' });
		expect(startTarget('steam_store')).toEqual({ kind: 'steam', url: 'steam://store' });
		expect(startTarget('steam_library')).toEqual({ kind: 'steam', url: 'steam://nav/games' });
		expect(startTarget('steam_community')).toEqual({ kind: 'steam', url: 'steam://url/CommunityHome/' });
		expect(startTarget('steam_profile')).toEqual({ kind: 'steam', url: 'steam://url/SteamIDMyProfile' });
		expect(startTarget('home')).toEqual({ kind: 'tab', path: '/oemt/sessions' });
		expect(startTarget('constructor')).toEqual({ kind: 'tab', path: '/oemt/sessions' });
		expect(startTarget(undefined)).toEqual({ kind: 'tab', path: '/oemt/sessions' });
	});

	test('every start page in the settings list is handled', () => {
		const choices = ['sessions', 'settings', 'diagnostics', 'steam_store', 'steam_library', 'steam_community', 'steam_profile'];
		for (const c of choices) {
			const t = startTarget(c);
			if (c.startsWith('steam_')) expect(t.kind).toBe('steam');
			else expect(t).toEqual({ kind: 'tab', path: `/oemt/${c}` });
		}
	});
});

describe('integrations moved into Settings', () => {
	test('old Integrations and Media links redirect; saved top bars collapse', () => {
		expect(pathToRoute('integrations')).toEqual({ tab: 'settings', redirected: true });
		expect(pathToRoute('media')).toEqual({ tab: 'sessions', redirected: true });
		expect(parseTopbar('sessions,media,settings,diagnostics,integrations').map((i) => i.id)).toEqual(['sessions', 'settings', 'diagnostics']);
	});
});
