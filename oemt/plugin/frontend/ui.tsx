import { Component, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

// ---- formatting ---------------------------------------------------------------------------

export function fmtDuration(s?: number): string {
	if (s == null || !isFinite(s)) return '—';
	s = Math.max(0, Math.round(s));
	const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m`;
	return `${s}s`;
}

export function fmtBytes(n?: number): string {
	if (!n || n <= 0) return '—';
	const u = ['B', 'KB', 'MB', 'GB', 'TB'];
	let i = 0;
	while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
	return `${n.toFixed(i >= 3 ? 1 : 0)} ${u[i]}`;
}

/** Unix seconds -> "Today", "Yesterday", "3 days ago", or a date. */
export function fmtWhen(unix?: number): string {
	if (!unix) return 'Never';
	const d = new Date(unix * 1000), now = new Date();
	const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
	if (days <= 0) return 'Today';
	if (days === 1) return 'Yesterday';
	if (days < 7) return `${days} days ago`;
	return d.toLocaleDateString();
}

export function fmtTime(unix?: number): string {
	return unix ? new Date(unix * 1000).toLocaleString() : '—';
}

/** Steam's public CDN artwork. Missing art falls back to the gradient behind the <img>. */
export const art = {
	hero: (appid: string) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_hero.jpg`,
	header: (appid: string) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
};

// ---- small components -----------------------------------------------------------------------

export function Panel(props: { label?: string; right?: ReactNode; flush?: boolean; className?: string; children?: ReactNode }) {
	return (
		<section className={`oemt-panel${props.flush ? ' oemt-flush' : ''}${props.className ? ' ' + props.className : ''}`}>
			{(props.label || props.right) && (
				<div className="oemt-row" style={{ marginBottom: 10 }}>
					{props.label && <h3 className="oemt-label" style={{ margin: 0 }}>{props.label}</h3>}
					<div className="oemt-spacer" />
					{props.right}
				</div>
			)}
			{props.children}
		</section>
	);
}

export type Tone = 'pass' | 'warn' | 'fail' | 'accent' | 'neutral';

export function Pill(props: { tone?: Tone; children: ReactNode; title?: string }) {
	const tone = props.tone && props.tone !== 'neutral' ? ` oemt-${props.tone}` : '';
	return <span className={`oemt-pill${tone}`} title={props.title}>{props.children}</span>;
}

export function Stat(props: { k: string; v: ReactNode; title?: string }) {
	return (
		<div className="oemt-stat" title={props.title}>
			<div className="oemt-stat-k">{props.k}</div>
			<div className="oemt-stat-v">{props.v}</div>
		</div>
	);
}

export function Empty(props: { children: ReactNode }) {
	return <div className="oemt-empty">{props.children}</div>;
}

export function Art(props: { src: string; alt: string; className?: string }) {
	const [failed, setFailed] = useState(false);
	useEffect(() => setFailed(false), [props.src]);
	if (failed) return null;
	return <img className={props.className} src={props.src} alt={props.alt} loading="lazy" onError={() => setFailed(true)} />;
}

export function ErrorText(props: { error: unknown }) {
	if (!props.error) return null;
	return (
		<div className="oemt-panel oemt-banner oemt-fail">
			<strong>Something went wrong.</strong> <span className="oemt-muted">{String((props.error as Error)?.message ?? props.error)}</span>
		</div>
	);
}

/** Two-click confirmation for destructive actions, no modal needed. */
export function ConfirmButton(props: { label: string; confirmLabel: string; onConfirm: () => void; disabled?: boolean }) {
	const [armed, setArmed] = useState(false);
	useEffect(() => {
		if (!armed) return;
		const t = setTimeout(() => setArmed(false), 4000);
		return () => clearTimeout(t);
	}, [armed]);
	return (
		<button className="oemt-btn oemt-danger" disabled={props.disabled}
			onClick={() => (armed ? (setArmed(false), props.onConfirm()) : setArmed(true))}>
			{armed ? props.confirmLabel : props.label}
		</button>
	);
}

// ---- data hook --------------------------------------------------------------------------------

export interface Async<T> { data?: T; error?: unknown; loading: boolean; reload: () => void }

/** Loads on mount and on reload(). Stale responses from earlier calls are ignored. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): Async<T> {
	const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
	const seq = useRef(0);
	const run = useCallback(() => {
		const n = ++seq.current;
		setState((s) => ({ ...s, loading: true }));
		fn().then(
			(data) => n === seq.current && setState({ data, loading: false }),
			(error) => n === seq.current && setState((s) => ({ data: s.data, error, loading: false })),
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);
	useEffect(run, [run]);
	return { ...state, reload: run };
}

// ---- error boundary ---------------------------------------------------------------------------

export class ErrorBoundary extends Component<{ name: string; children?: ReactNode }, { error?: Error }> {
	state: { error?: Error } = {};

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	componentDidCatch(error: Error) {
		api.log('error', 'ui_crash', `${this.props.name}: ${error?.message ?? error}`);
	}

	render() {
		if (!this.state.error) return this.props.children;
		return (
			<div className="oemt-panel oemt-banner oemt-fail">
				<strong>{this.props.name} stopped working.</strong>
				<div className="oemt-muted" style={{ margin: '6px 0 10px' }}>{this.state.error.message}</div>
				<button className="oemt-btn" onClick={() => this.setState({ error: undefined })}>Try again</button>
			</div>
		);
	}
}
