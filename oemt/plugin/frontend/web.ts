// Web pages OEmt opens inside Steam's own browser (Spotify and SoundCloud refuse to be embedded in
// other pages). steam://openurl/ is Steam's public link for "open this page in Steam".
export const WEB_PAGES = {
	spotify: 'https://open.spotify.com/',
	spotify_playlists: 'https://open.spotify.com/collection/playlists',
	soundcloud: 'https://soundcloud.com/discover',
	soundcloud_playlists: 'https://soundcloud.com/you/sets',
} as const;

export type WebPage = keyof typeof WEB_PAGES;

/** steam:// link that opens `url` in Steam's browser. Only https pages are allowed. */
export function steamOpenUrl(url: string): string | undefined {
	return /^https:\/\/[^\s"]+$/.test(url) ? `steam://openurl/${url}` : undefined;
}

export function openWeb(url: string): boolean {
	const link = steamOpenUrl(url);
	if (!link) return false;
	SteamClient.URL.ExecuteSteamURL(link);
	return true;
}
