// Music player in Steam's sidebar, inside the user panel above your profile (SpaceTheme's panel).
// Shows whatever Windows' media session is playing (Spotify app, a browser tab, …): cover art, title,
// artist, back / play-pause / next, a seekable progress bar, and the system volume.
// Rendered by a Millennium global component through a React portal into Steam's own DOM, with its
// own scoped styles (it lives outside the OEmt page). Hidden when turned off in Settings.
import { ChangeEvent, FC, MouseEvent, ReactElement, useEffect, useRef, useState } from 'react';
import { api, PlayerCommand, PlayerState, Volume } from './api';

const USER_PANEL = '._3cykd-VfN_xBxf3Qxriccm';
const HOST_ID = 'oemt-sidebar-player';
const STYLE_ID = 'oemt-sidebar-player-style';
const POLL_MS = 1500;

const CSS = `
#${HOST_ID} { display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: var(--st-border-radius, 6px);
  background: rgb(var(--st-color-1, 20, 24, 33)); color: #e8eaf0; font-size: 12px; min-width: 0; }
#${HOST_ID}:empty { display: none; }
#${HOST_ID} .op-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
#${HOST_ID} .op-art { width: 40px; height: 40px; border-radius: 4px; object-fit: cover; flex: none; background: rgb(var(--st-color-2, 27, 32, 43)); display: flex; align-items: center; justify-content: center; color: #9aa4b2; }
#${HOST_ID} .op-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
#${HOST_ID} .op-title { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#${HOST_ID} .op-sub { color: #9aa4b2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px; }
#${HOST_ID} .op-bar { position: relative; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.12); flex: 1; }
#${HOST_ID} .op-bar.op-seek { cursor: pointer; }
#${HOST_ID} .op-bar:hover { height: 6px; }
#${HOST_ID} .op-fill { position: absolute; inset: 0 auto 0 0; border-radius: 2px; background: rgb(var(--st-accent-1, 109, 106, 245)); }
#${HOST_ID} .op-time { color: #9aa4b2; font-size: 10px; font-variant-numeric: tabular-nums; flex: none; }
#${HOST_ID} .op-btn { appearance: none; border: 0; background: none; color: #c9ced8; width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex: none; padding: 0; }
#${HOST_ID} .op-btn:hover:not(:disabled) { color: #fff; background: rgba(255,255,255,0.08); }
#${HOST_ID} .op-btn:disabled { opacity: 0.35; cursor: default; }
#${HOST_ID} .op-btn svg { width: 14px; height: 14px; fill: currentColor; }
#${HOST_ID} .op-main { background: #f2f4f8; color: #14181f; width: 30px; height: 30px; }
#${HOST_ID} .op-main:hover:not(:disabled) { background: #fff; color: #000; }
#${HOST_ID} .op-vol { -webkit-appearance: none; appearance: none; flex: 1; min-width: 40px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.15); outline: none; cursor: pointer; }
#${HOST_ID} .op-vol::-webkit-slider-thumb { -webkit-appearance: none; width: 11px; height: 11px; border-radius: 50%; background: #f2f4f8; }
#${HOST_ID} .op-btn:focus-visible, #${HOST_ID} .op-vol:focus-visible { outline: 2px solid rgb(var(--st-accent-1, 109, 106, 245)); outline-offset: 1px; }
/* Dynamic spacing: SpaceTheme assumes a 90 px user panel; use its measured height instead (--oemt-panel-h). */
._3x1HklzyDs4TEjACrRO2tB ._1ijTaXJJA5YWl_fW2IxcaT { margin-bottom: calc(var(--oemt-panel-h, 90px) + 16px) !important; }
body:has(._1_yS5UP7el0aN4vntx3dx .wi0pDywRgOCxhG7OqQNaA) ._1ijTaXJJA5YWl_fW2IxcaT { margin-bottom: calc(var(--oemt-panel-h, 90px) + 6px + 49px + 16px) !important; }
._1_yS5UP7el0aN4vntx3dx { bottom: calc(16px + var(--oemt-panel-h, 90px) + 6px) !important; }
`;

const P = {
	previous: 'M6 5h2v14H6zM20 5v14L9 12z',
	play: 'M7 4.5v15l12-7.5z',
	pause: 'M6 4h4.5v16H6zM13.5 4H18v16h-4.5z',
	next: 'M16 5h2v14h-2zM4 5l11 7-11 7z',
	vol: 'M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z',
	muted: 'M3 9v6h4l5 5V4L7 9zm18.6 3-2.3-2.3-1.4 1.4 2.3 2.3-2.3 2.3 1.4 1.4 2.3-2.3 2.3 2.3 1.4-1.4-2.3-2.3 2.3-2.3-1.4-1.4z',
};
const Icon: FC<{ d: string }> = ({ d }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;

function fmt(s: number): string {
	if (!isFinite(s) || s < 0) s = 0;
	return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

const Player: FC<{ doc: Document }> = ({ doc }) => {
	const [enabled, setEnabled] = useState(false);
	const [p, setP] = useState<PlayerState>();
	const [vol, setVol] = useState<Volume>();
	const [cover, setCover] = useState<{ key: string; url?: string }>();
	const [pos, setPos] = useState(0);
	const synced = useRef({ pos: 0, at: 0, playing: false });
	const volTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const dragging = useRef(false);

	useEffect(() => {
		let stop = false;
		const tick = () => {
			if (doc.visibilityState === 'hidden') return;
			api.playerStatus().then((s) => {
				if (stop) return;
				setEnabled(s.enabled);
				setP(s.current);
				if (s.volume && !dragging.current) setVol(s.volume);
				if (s.current) synced.current = { pos: s.current.position, at: Date.now(), playing: s.current.state === 'playing' };
			}, () => undefined);
		};
		tick();
		const t = setInterval(tick, POLL_MS);
		const smooth = setInterval(() => {
			const s = synced.current;
			setPos(s.playing ? s.pos + (Date.now() - s.at) / 1000 : s.pos);
		}, 500);
		return () => { stop = true; clearInterval(t); clearInterval(smooth); };
	}, [doc]);

	useEffect(() => {
		if (!p?.has_thumb || cover?.key === p.thumb_key) return;
		api.playerCover(cover?.key ?? '').then((c) => setCover({ key: c.key ?? p.thumb_key, url: c.data_url ?? undefined }), () => undefined);
	}, [p?.thumb_key, p?.has_thumb]); // eslint-disable-line react-hooks/exhaustive-deps

	// Nothing playing: render nothing, so the host collapses (:empty) and the games list gets the room back.
	if (!enabled || !p?.title) return null;

	const send = (a: PlayerCommand, value = 0) => api.playerCommand(a, value).then((r) => r.volume && setVol(r.volume), () => undefined);
	const playing = p?.state === 'playing';
	const toggle = () => {
		if (!p) return;
		synced.current = { pos, at: Date.now(), playing: !playing };
		setP({ ...p, state: playing ? 'paused' : 'playing' });
		send('play_pause');
	};
	const dur = p?.duration ?? 0;
	const shown = Math.min(pos, dur || pos);
	const seek = (e: MouseEvent<HTMLDivElement>) => {
		if (!p?.can.seek || !dur) return;
		const r = e.currentTarget.getBoundingClientRect();
		const target = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
		synced.current = { pos: target, at: Date.now(), playing };
		setPos(target);
		send('seek', target);
	};
	const changeVolume = (e: ChangeEvent<HTMLInputElement>) => {
		const level = Number(e.target.value);
		dragging.current = true;
		setVol({ level, muted: false });
		clearTimeout(volTimer.current);
		volTimer.current = setTimeout(() => { send('volume', level).finally(() => { dragging.current = false; }); }, 120);
	};

	return (
		<>
			<>
					<div className="op-row">
						{cover?.key === p.thumb_key && cover.url ? <img className="op-art" src={cover.url} alt="" /> : <span className="op-art" aria-hidden="true">♪</span>}
						<div className="op-text">
							<span className="op-title" title={p.title}>{p.title}</span>
							<span className="op-sub" title={p.artist}>{p.artist ? `${p.artist} · ` : ''}{p.app}</span>
						</div>
					</div>
					<div className="op-row">
						<span className="op-time">{fmt(shown)}</span>
						<div className={`op-bar${p.can.seek && dur ? ' op-seek' : ''}`} onClick={seek} role="slider" aria-label="Position"
							aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(shown)}>
							<div className="op-fill" style={{ width: dur ? `${Math.min(100, (shown / dur) * 100)}%` : '0%' }} />
						</div>
						<span className="op-time">{dur ? fmt(dur) : '--:--'}</span>
					</div>
				</>
			<div className="op-row">
				<button className="op-btn" disabled={!p?.can.previous} onClick={() => send('previous')} aria-label="Previous" title="Previous"><Icon d={P.previous} /></button>
				<button className="op-btn op-main" disabled={!p?.can.play_pause} onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
					<Icon d={playing ? P.pause : P.play} />
				</button>
				<button className="op-btn" disabled={!p?.can.next} onClick={() => send('next')} aria-label="Next" title="Next"><Icon d={P.next} /></button>
				{vol && (
					<>
						<button className="op-btn" onClick={() => send('mute')} aria-label={vol.muted ? 'Unmute' : 'Mute'} title={vol.muted ? 'Unmute' : 'Mute'}>
							<Icon d={vol.muted || vol.level === 0 ? P.muted : P.vol} />
						</button>
						<input className="op-vol" type="range" min={0} max={100} step={1} value={vol.muted ? 0 : vol.level} onChange={changeVolume}
							aria-label="System volume" title={`Volume ${vol.muted ? 0 : vol.level}%`}
							style={{ background: `linear-gradient(to right, rgb(var(--st-accent-1, 109, 106, 245)) ${vol.muted ? 0 : vol.level}%, rgba(255,255,255,0.15) ${vol.muted ? 0 : vol.level}%)` }} />
					</>
				)}
			</div>
		</>
	);
};

/**
 * Global component factory: keeps a host element at the top of Steam's user panel (re-adding it when
 * Steam re-renders the panel) and portals the player into it.
 */
export function makeSidebarPlayer(getDoc: () => Document | undefined, log?: (msg: string) => void): FC {
	return () => {
		const [host, setHost] = useState<HTMLElement>();
		useEffect(() => {
			let reported = '';
			const report = (state: string) => { if (state !== reported) { reported = state; log?.(state); } };
			// Track the panel's real height so the games list and download bar keep clear of it.
			let observed: Element | undefined;
			let ro: ResizeObserver | undefined;
			const measure = (panel: Element) => {
				const h = Math.ceil(panel.getBoundingClientRect().height);
				if (h > 0) (panel.ownerDocument.documentElement as HTMLElement).style.setProperty('--oemt-panel-h', `${h}px`);
			};
			const watch = (panel: Element) => {
				measure(panel);
				if (observed === panel) return;
				ro?.disconnect();
				observed = panel;
				const RO = (panel.ownerDocument.defaultView as unknown as { ResizeObserver?: typeof ResizeObserver })?.ResizeObserver;
				if (RO) { ro = new RO(() => measure(panel)); ro.observe(panel); }
			};
			const ensure = () => {
				const doc = getDoc();
				const panel = doc?.querySelector(USER_PANEL);
				if (!doc || !panel) { if (doc) report('user panel not found'); return setHost(undefined); }
				if (!doc.getElementById(STYLE_ID)) {
					const s = doc.createElement('style');
					s.id = STYLE_ID;
					s.textContent = CSS;
					doc.head.append(s);
				}
				let el = doc.getElementById(HOST_ID);
				if (!el || el.parentElement !== panel) {
					el?.remove();
					el = doc.createElement('div');
					el.id = HOST_ID;
					panel.prepend(el);
				}
				report('attached to the user panel');
				watch(panel);
				setHost((h) => (h === el ? h : el!));
			};
			ensure();
			const t = setInterval(ensure, 1000);
			return () => {
				clearInterval(t);
				ro?.disconnect();
				const doc = getDoc();
				(doc?.documentElement as HTMLElement | undefined)?.style.removeProperty('--oemt-panel-h');
				doc?.getElementById(HOST_ID)?.remove();
				doc?.getElementById(STYLE_ID)?.remove();
			};
		}, []);
		const RD = (window as unknown as { SP_REACTDOM?: { createPortal?: (c: unknown, el: Element) => unknown } }).SP_REACTDOM;
		if (!host || !RD?.createPortal) return null;
		return RD.createPortal(<Player doc={host.ownerDocument} />, host) as ReactElement;
	};
}
