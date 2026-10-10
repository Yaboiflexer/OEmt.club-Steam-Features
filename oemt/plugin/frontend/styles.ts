// OEmt.club page styles, built on the OEmt.club Steam theme's own design tokens (SpaceTheme's --st-*
// variables) so the OEmt pages look like the rest of Steam: same colours (including the theme's colour
// pickers), same corner radius slider, same font option, same flat cards and buttons.
// Every token has a fallback so the page still renders if the theme is turned off; the accent then
// falls back to the ui.accent setting (passed in as --oemt-accent-fallback, an "r, g, b" triplet).
// Rendered as a <style> element inside the page, so it lands in whichever Steam window shows it.
export const CSS = `
.oemt-root {
	--oemt-accent: rgb(var(--st-accent-1, var(--oemt-accent-fallback, 102, 108, 255)));
	--oemt-accent-2: rgb(var(--st-accent-2, var(--oemt-accent-fallback, 135, 140, 255)));
	--oemt-panel: rgb(var(--st-color-2, 30, 30, 30));
	--oemt-raised: rgb(var(--st-color-1, 17, 17, 17));
	--oemt-hover: rgb(var(--st-color-3, 20, 20, 20));
	--oemt-line: rgb(var(--st-color-5, 38, 41, 44));
	--oemt-text: #dcdedf;
	--oemt-muted: #8b929a;
	--oemt-pass: rgb(var(--st-green, 36, 166, 90));
	--oemt-warn: rgb(var(--st-yellow, 239, 141, 75));
	--oemt-fail: rgb(var(--st-red, 240, 74, 74));
	--oemt-radius: var(--st-border-radius, 8px);
	--oemt-gap: 12px;
	--oemt-speed: 0.2s;
	position: absolute; inset: 0;
	display: flex; flex-direction: column; gap: var(--oemt-gap);
	padding: var(--oemt-gap);
	background: transparent; color: var(--oemt-text);
	font-family: inherit; font-size: 14px;
	box-sizing: border-box; overflow: hidden;
}
.oemt-root *, .oemt-root *::before, .oemt-root *::after { box-sizing: border-box; }
.oemt-root button, .oemt-root input, .oemt-root select, .oemt-root textarea { font-family: inherit; }
.oemt-root.oemt-reduced-motion { --oemt-speed: 0s; }
.oemt-root.oemt-reduced-motion * { animation: none !important; }

/* Flat cards, as in the theme: no borders or shadows, radius from the theme slider */
.oemt-panel { background: var(--oemt-panel); border: none; box-shadow: none; border-radius: var(--oemt-radius); padding: 14px; }
.oemt-panel.oemt-flush { padding: 0; overflow: hidden; }
.oemt-label { font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--oemt-muted); margin: 0 0 10px; }
.oemt-muted { color: var(--oemt-muted); }
.oemt-small { font-size: 12px; }
.oemt-row { display: flex; align-items: center; gap: 8px; }
.oemt-row.oemt-wrap { flex-wrap: wrap; }
.oemt-spacer { flex: 1; }
.oemt-stack { display: flex; flex-direction: column; gap: var(--oemt-gap); }
.oemt-grid { display: grid; gap: var(--oemt-gap); grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.oemt-scroll { overflow-y: auto; min-height: 0; }

/* Fallback header (only when items can't go into Steam's top bar) + "More" row */
.oemt-topbar { display: flex; align-items: center; gap: 18px; padding: 0 14px; height: 46px; flex: none; }
.oemt-brand { display: flex; align-items: center; gap: 8px; font-weight: 900; font-size: 13px; }
.oemt-brand svg { width: 18px; height: 18px; color: var(--oemt-accent); }
.oemt-tabs { display: flex; gap: 4px; height: 100%; overflow-x: auto; scrollbar-width: none; }
.oemt-tab {
	appearance: none; background: none; border: 0; color: var(--oemt-muted); cursor: pointer;
	padding: 0 12px; height: 100%; font: inherit; font-weight: 600; font-size: 13px;
	text-transform: uppercase; white-space: nowrap; position: relative;
	transition: color var(--oemt-speed);
}
.oemt-tab:hover { color: #fff; }
.oemt-tab.oemt-active { color: var(--oemt-accent); }
.oemt-tab.oemt-active::after { content: ""; position: absolute; left: 12px; right: 12px; bottom: 0; height: 3.2px; border-radius: 3px; background: var(--oemt-accent); }
.oemt-more { display: flex; align-items: center; gap: 2px; height: 34px; padding: 0 6px; flex: none; background: var(--oemt-panel); border-radius: var(--oemt-radius); }
.oemt-more .oemt-tab { height: 100%; padding: 0 10px; font-size: 12px; }
.oemt-more .oemt-tab.oemt-active::after { left: 10px; right: 10px; }

/* Scrollbars: thin, rounded, quiet until hovered (matches the theme's "Modern (OEmt)" option) */
.oemt-root * { scrollbar-width: thin; }
.oemt-root ::-webkit-scrollbar { width: 8px; height: 8px; }
.oemt-root ::-webkit-scrollbar-track { background: transparent; }
.oemt-root ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; }
.oemt-root :hover::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,0.22); }
.oemt-root ::-webkit-scrollbar-thumb:hover { background-color: var(--oemt-accent); }
.oemt-root ::-webkit-scrollbar-corner { background: transparent; }
.oemt-root ::-webkit-scrollbar-button { display: none; }

.oemt-pagebar { display: flex; align-items: center; gap: 10px; flex: none; min-width: 0; }
.oemt-crumbs { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.oemt-crumb-sep { color: var(--oemt-muted); }
.oemt-pillbtn { appearance: none; background: none; border: 0; padding: 0; cursor: pointer; }
.oemt-more { overflow-x: auto; scrollbar-width: none; }
.oemt-tab:focus-visible, .oemt-btn:focus-visible { outline: 2px solid var(--oemt-accent); outline-offset: 2px; }
.oemt-tab-divider { width: 1px; align-self: center; height: 18px; background: var(--oemt-line); margin: 0 6px; flex: none; }
.oemt-tab-steam { opacity: 0.8; }
.oemt-body { flex: 1; min-height: 0; position: relative; }
.oemt-tabpage { position: absolute; inset: 0; overflow-y: auto; }
.oemt-tabpage[hidden] { display: none; }

/* Pills */
.oemt-pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: var(--oemt-radius); font-size: 11px; font-weight: 600; text-transform: uppercase; background: var(--oemt-raised); color: var(--oemt-muted); }
.oemt-pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.oemt-pill.oemt-pass { color: var(--oemt-pass); }
.oemt-pill.oemt-warn { color: var(--oemt-warn); }
.oemt-pill.oemt-fail { color: var(--oemt-fail); }
.oemt-pill.oemt-accent { color: var(--oemt-accent); }

/* Buttons: theme style. Dark fill, lighter on hover; primary uses the accent */
.oemt-btn {
	appearance: none; border: none; background: var(--oemt-raised); color: var(--oemt-text);
	border-radius: var(--oemt-radius); padding: 8px 14px; font: inherit; font-weight: 600; cursor: pointer;
	transition: background-color var(--oemt-speed) ease-in-out, color var(--oemt-speed) ease-in-out;
}
.oemt-btn:hover:not(:disabled) { background: var(--oemt-hover); color: #fff; }
.oemt-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.oemt-btn.oemt-primary { background: var(--oemt-accent); color: #fff; }
.oemt-btn.oemt-primary:hover:not(:disabled) { background: var(--oemt-accent-2); }
.oemt-btn.oemt-big { padding: 10px 28px; font-size: 15px; font-weight: 700; text-transform: uppercase; }
.oemt-btn.oemt-danger { color: var(--oemt-fail); }
.oemt-btn.oemt-danger:hover:not(:disabled) { background: var(--oemt-fail); color: #fff; }

/* Inputs */
.oemt-input, .oemt-select, .oemt-textarea {
	background: var(--oemt-raised); color: var(--oemt-text); border: 1px solid transparent;
	border-radius: var(--oemt-radius); padding: 8px 10px; font: inherit; outline: none;
	transition: border-color var(--oemt-speed);
}
.oemt-input:focus, .oemt-select:focus, .oemt-textarea:focus { border-color: var(--oemt-accent); }
.oemt-textarea { width: 100%; min-height: 120px; font-size: 12px; resize: vertical; }
.oemt-switch { position: relative; width: 36px; height: 20px; flex: none; appearance: none; background: var(--oemt-raised); border-radius: 999px; border: none; cursor: pointer; transition: background var(--oemt-speed); }
.oemt-switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: var(--oemt-muted); transition: transform var(--oemt-speed), background var(--oemt-speed); }
.oemt-switch:checked { background: var(--oemt-accent); }
.oemt-switch:checked::after { transform: translateX(16px); background: #fff; }

/* Hero + stat strip (the theme's game page look) */
.oemt-hero { position: relative; height: 300px; border-radius: var(--oemt-radius); overflow: hidden; background: linear-gradient(120deg, var(--oemt-accent), var(--oemt-panel) 70%); flex: none; }
.oemt-hero img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.oemt-hero-caption { position: absolute; left: 0; right: 0; bottom: 0; padding: 18px 20px; background: linear-gradient(transparent, rgba(0,0,0,0.75)); }
.oemt-hero-title { font-size: 26px; font-weight: 800; }
.oemt-strip { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
.oemt-stat .oemt-stat-k { font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--oemt-text); }
.oemt-stat .oemt-stat-v { font-size: 12px; color: var(--oemt-muted); }

/* Library */
.oemt-library { display: grid; grid-template-columns: 270px 1fr; gap: var(--oemt-gap); height: 100%; }
.oemt-gamelist { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.oemt-gameitem { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: var(--oemt-radius); cursor: pointer; border: 0; background: none; color: var(--oemt-text); font: inherit; text-align: left; width: 100%; transition: background-color var(--oemt-speed); }
.oemt-gameitem:hover { background: var(--oemt-raised); }
.oemt-gameitem.oemt-active { background: color-mix(in srgb, var(--oemt-accent) 30%, transparent); color: #fff; }
.oemt-gameitem img { width: 46px; height: 21px; border-radius: 3px; object-fit: cover; background: var(--oemt-raised); flex: none; }
.oemt-gameitem span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Cards + tables */
.oemt-capsule { border-radius: var(--oemt-radius); overflow: hidden; background: var(--oemt-raised); cursor: pointer; border: none; text-align: left; padding: 0; color: inherit; font: inherit; transition: background-color var(--oemt-speed); }
.oemt-capsule:hover { background: var(--oemt-hover); }
.oemt-capsule img { display: block; width: 100%; aspect-ratio: 460 / 215; object-fit: cover; background: var(--oemt-panel); }
.oemt-capsule div { padding: 8px 10px; }
.oemt-table { width: 100%; border-collapse: collapse; }
.oemt-table th { text-align: left; font-size: 12px; text-transform: uppercase; color: var(--oemt-muted); font-weight: 600; padding: 6px 8px; border-bottom: 1px solid var(--oemt-line); }
.oemt-table td { padding: 7px 8px; border-bottom: 1px solid var(--oemt-line); vertical-align: top; }
.oemt-log { font-size: 12px; }
.oemt-log .oemt-lvl-error { color: var(--oemt-fail); }
.oemt-log .oemt-lvl-warn { color: var(--oemt-warn); }
.oemt-log .oemt-lvl-debug { color: var(--oemt-muted); }
.oemt-banner { border-left: 3px solid var(--oemt-warn); }
.oemt-banner.oemt-fail { border-left-color: var(--oemt-fail); }
.oemt-folder { outline: 2px solid transparent; transition: outline-color var(--oemt-speed), background-color var(--oemt-speed); }
.oemt-folder.oemt-dropping { outline-color: var(--oemt-accent); background: color-mix(in srgb, var(--oemt-accent) 10%, var(--oemt-panel)); }
.oemt-account { background: var(--oemt-raised); cursor: grab; }
.oemt-account:active { cursor: grabbing; }
.oemt-grip { color: var(--oemt-muted); letter-spacing: -2px; }
.oemt-empty { padding: 26px; text-align: center; color: var(--oemt-muted); }
@keyframes oemt-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.oemt-tabpage > * { animation: oemt-fade var(--oemt-speed) ease-out; }
`;
