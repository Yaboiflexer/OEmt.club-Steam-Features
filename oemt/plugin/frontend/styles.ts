// OEmt.club page styles. Layout language: floating rounded panels on a charcoal canvas, small
// uppercase section labels, an underlined top tab strip. Colours come from CSS variables so the
// accent (settings: ui.accent) and reduced motion (ui.reduced_motion) apply live.
// Rendered as a <style> element inside the page, so it lands in whichever Steam window shows it.
// Font: Lucida Console everywhere (ships with Windows, so nothing is downloaded).
export const CSS = `
.oemt-root {
	--oemt-font: "Lucida Console", Consolas, monospace;
	--oemt-bg: #16181c;
	--oemt-panel: #1e2127;
	--oemt-raised: #262a32;
	--oemt-line: rgba(255, 255, 255, 0.06);
	--oemt-text: #e6e8ec;
	--oemt-muted: #8a919c;
	--oemt-pass: #5fbf7f;
	--oemt-warn: #e0b04f;
	--oemt-fail: #e06464;
	--oemt-radius: 10px;
	--oemt-gap: 10px;
	--oemt-speed: 140ms;
	position: absolute; inset: 0;
	display: flex; flex-direction: column; gap: var(--oemt-gap);
	padding: var(--oemt-gap);
	background: var(--oemt-bg); color: var(--oemt-text);
	font-family: var(--oemt-font); font-size: 14px;
	box-sizing: border-box; overflow: hidden;
}
.oemt-root *, .oemt-root *::before, .oemt-root *::after { box-sizing: border-box; }
.oemt-root button, .oemt-root input, .oemt-root select, .oemt-root textarea { font-family: var(--oemt-font); }
.oemt-root.oemt-reduced-motion { --oemt-speed: 0ms; }
.oemt-root.oemt-reduced-motion * { animation: none !important; }

.oemt-panel { background: var(--oemt-panel); border: 1px solid var(--oemt-line); border-radius: var(--oemt-radius); padding: 14px; }
.oemt-panel.oemt-flush { padding: 0; overflow: hidden; }
.oemt-label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--oemt-muted); margin: 0 0 10px; }
.oemt-muted { color: var(--oemt-muted); }
.oemt-small { font-size: 11px; }
.oemt-row { display: flex; align-items: center; gap: 8px; }
.oemt-row.oemt-wrap { flex-wrap: wrap; }
.oemt-spacer { flex: 1; }
.oemt-stack { display: flex; flex-direction: column; gap: var(--oemt-gap); }
.oemt-grid { display: grid; gap: var(--oemt-gap); grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.oemt-scroll { overflow-y: auto; min-height: 0; }

/* top bar + tabs */
.oemt-topbar { display: flex; align-items: center; gap: 18px; padding: 0 14px; height: 48px; flex: none; }
.oemt-brand { display: flex; align-items: center; gap: 8px; font-weight: 800; letter-spacing: 0.02em; font-size: 14px; }
.oemt-brand svg { width: 18px; height: 18px; color: var(--oemt-accent); }
.oemt-tabs { display: flex; gap: 4px; height: 100%; overflow-x: auto; scrollbar-width: none; }
.oemt-tab {
	appearance: none; background: none; border: 0; color: var(--oemt-muted); cursor: pointer;
	padding: 0 12px; height: 100%; font: inherit; font-weight: 700; font-size: 12px;
	letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap;
	border-bottom: 2px solid transparent; transition: color var(--oemt-speed), border-color var(--oemt-speed);
}
.oemt-tab:hover { color: var(--oemt-text); }
.oemt-tab.oemt-active { color: var(--oemt-text); border-bottom-color: var(--oemt-accent); }
.oemt-more { display: flex; align-items: center; gap: 2px; height: 30px; padding: 0 6px; flex: none; }
.oemt-more .oemt-tab { height: 100%; padding: 0 9px; font-size: 11px; }

/* Modern scrollbars: thin, rounded, quiet until hovered */
.oemt-root * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.14) transparent; }
.oemt-root ::-webkit-scrollbar { width: 8px; height: 8px; }
.oemt-root ::-webkit-scrollbar-track { background: transparent; }
.oemt-root ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; transition: background var(--oemt-speed); }
.oemt-root :hover::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,0.22); }
.oemt-root ::-webkit-scrollbar-thumb:hover { background-color: color-mix(in srgb, var(--oemt-accent) 70%, transparent); }
.oemt-root ::-webkit-scrollbar-thumb:active { background-color: var(--oemt-accent); }
.oemt-root ::-webkit-scrollbar-corner { background: transparent; }
.oemt-root ::-webkit-scrollbar-button { display: none; }

.oemt-tab-divider { width: 1px; align-self: center; height: 18px; background: var(--oemt-line); margin: 0 6px; flex: none; }
.oemt-tab-steam { font-weight: 500; opacity: 0.8; }
.oemt-body { flex: 1; min-height: 0; position: relative; }
.oemt-tabpage { position: absolute; inset: 0; overflow-y: auto; }
.oemt-tabpage[hidden] { display: none; }

/* pills + buttons */
.oemt-pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; background: var(--oemt-raised); color: var(--oemt-muted); }
.oemt-pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.oemt-pill.oemt-pass { color: var(--oemt-pass); }
.oemt-pill.oemt-warn { color: var(--oemt-warn); }
.oemt-pill.oemt-fail { color: var(--oemt-fail); }
.oemt-pill.oemt-accent { color: var(--oemt-accent); }
.oemt-btn {
	appearance: none; border: 1px solid var(--oemt-line); background: var(--oemt-raised); color: var(--oemt-text);
	border-radius: 6px; padding: 7px 12px; font: inherit; font-weight: 600; cursor: pointer;
	transition: filter var(--oemt-speed), background var(--oemt-speed);
}
.oemt-btn:hover:not(:disabled) { filter: brightness(1.15); }
.oemt-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.oemt-btn.oemt-primary { background: var(--oemt-accent); border-color: transparent; color: #fff; }
.oemt-btn.oemt-big { padding: 10px 26px; font-size: 15px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
.oemt-btn.oemt-danger { color: var(--oemt-fail); }

/* inputs */
.oemt-input, .oemt-select, .oemt-textarea {
	background: var(--oemt-bg); color: var(--oemt-text); border: 1px solid var(--oemt-line);
	border-radius: 6px; padding: 7px 9px; font: inherit; outline: none;
}
.oemt-input:focus, .oemt-select:focus, .oemt-textarea:focus { border-color: var(--oemt-accent); }
.oemt-textarea { width: 100%; min-height: 120px; font-family: Consolas, monospace; font-size: 12px; resize: vertical; }
.oemt-switch { position: relative; width: 36px; height: 20px; flex: none; appearance: none; background: var(--oemt-raised); border-radius: 999px; border: 1px solid var(--oemt-line); cursor: pointer; transition: background var(--oemt-speed); }
.oemt-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--oemt-muted); transition: transform var(--oemt-speed), background var(--oemt-speed); }
.oemt-switch:checked { background: var(--oemt-accent); }
.oemt-switch:checked::after { transform: translateX(16px); background: #fff; }

/* hero + stat strip */
.oemt-hero { position: relative; height: 300px; border-radius: var(--oemt-radius); overflow: hidden; background: linear-gradient(120deg, var(--oemt-accent), #1e2127 70%); flex: none; }
.oemt-hero img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.oemt-hero-caption { position: absolute; left: 0; right: 0; bottom: 0; padding: 18px 20px; background: linear-gradient(transparent, rgba(0,0,0,0.75)); }
.oemt-hero-title { font-size: 26px; font-weight: 800; }
.oemt-strip { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; }
.oemt-stat .oemt-stat-k { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--oemt-text); }
.oemt-stat .oemt-stat-v { font-size: 12px; color: var(--oemt-muted); }

/* library */
.oemt-library { display: grid; grid-template-columns: 270px 1fr; gap: var(--oemt-gap); height: 100%; }
.oemt-gamelist { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.oemt-gameitem { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 6px; cursor: pointer; border: 0; background: none; color: var(--oemt-text); font: inherit; text-align: left; width: 100%; }
.oemt-gameitem:hover { background: var(--oemt-raised); }
.oemt-gameitem.oemt-active { background: color-mix(in srgb, var(--oemt-accent) 28%, transparent); }
.oemt-gameitem img { width: 46px; height: 21px; border-radius: 3px; object-fit: cover; background: var(--oemt-raised); flex: none; }
.oemt-gameitem span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* cards + tables */
.oemt-capsule { border-radius: 8px; overflow: hidden; background: var(--oemt-raised); cursor: pointer; border: 1px solid var(--oemt-line); text-align: left; padding: 0; color: inherit; font: inherit; }
.oemt-capsule img { display: block; width: 100%; aspect-ratio: 460 / 215; object-fit: cover; background: var(--oemt-bg); }
.oemt-capsule div { padding: 8px 10px; }
.oemt-table { width: 100%; border-collapse: collapse; }
.oemt-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--oemt-muted); font-weight: 700; padding: 6px 8px; border-bottom: 1px solid var(--oemt-line); }
.oemt-table td { padding: 7px 8px; border-bottom: 1px solid var(--oemt-line); vertical-align: top; }
.oemt-log { font-family: Consolas, monospace; font-size: 12px; }
.oemt-log .oemt-lvl-error { color: var(--oemt-fail); }
.oemt-log .oemt-lvl-warn { color: var(--oemt-warn); }
.oemt-log .oemt-lvl-debug { color: var(--oemt-muted); }
.oemt-banner { border-left: 3px solid var(--oemt-warn); }
.oemt-banner.oemt-fail { border-left-color: var(--oemt-fail); }
.oemt-folder { transition: border-color var(--oemt-speed), background var(--oemt-speed); }
.oemt-folder.oemt-dropping { border-color: var(--oemt-accent); background: color-mix(in srgb, var(--oemt-accent) 10%, var(--oemt-panel)); }
.oemt-account { background: var(--oemt-raised); cursor: grab; }
.oemt-account:active { cursor: grabbing; }
.oemt-grip { color: var(--oemt-muted); letter-spacing: -2px; }
.oemt-empty { padding: 26px; text-align: center; color: var(--oemt-muted); }
@keyframes oemt-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.oemt-tabpage > * { animation: oemt-fade var(--oemt-speed) ease-out; }
`;
