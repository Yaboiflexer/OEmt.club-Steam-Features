import { FC, useState } from 'react';
import { api, CapabilityStatus, Integration } from '../api';
import { Empty, ErrorText, Panel, Pill, useAsync } from '../ui';

const CAP_TONE: Record<CapabilityStatus, 'pass' | 'accent' | 'fail'> = { available: 'pass', planned: 'accent', unsupported: 'fail' };

function detectionTone(i: Integration) {
	if (i.detection.installed) return 'pass' as const;
	if (i.detection.status === 'error') return 'fail' as const;
	return 'neutral' as const;
}

const DETECTION_LABEL: Record<string, string> = {
	detected: 'Installed',
	not_installed: 'Not installed',
	not_detectable: 'Not detectable',
	unsupported_platform: 'Unsupported OS',
	error: 'Detection error',
};

export const IntegrationsView: FC = () => {
	const list = useAsync(() => api.integrations(false));
	const [busy, setBusy] = useState<string>();
	const [error, setError] = useState<unknown>();

	async function toggle(i: Integration, enabled: boolean) {
		setBusy(i.id);
		setError(undefined);
		try {
			await api.setSetting(`integrations.${i.id}.enabled`, enabled);
			list.reload();
		} catch (err) {
			setError(err);
		} finally {
			setBusy(undefined);
		}
	}

	return (
		<div className="oemt-stack">
			<div className="oemt-panel oemt-banner">
				Phase 1 only <strong>detects</strong> these apps and records whether you opt in. Nothing connects to Discord, Spotify or any other
				service yet, and OEmt never stores passwords or tokens.
			</div>
			{error ? <ErrorText error={error} /> : null}
			{list.error ? <ErrorText error={list.error} /> : null}
			<div className="oemt-row">
				<div className="oemt-spacer" />
				<button className="oemt-btn" onClick={() => api.integrations(true).then(list.reload, setError)}>Detect again</button>
			</div>
			{!list.data ? (
				<Empty>Checking installed apps…</Empty>
			) : (
				<div className="oemt-grid">
					{list.data.map((i) => (
						<Panel key={i.id} label={i.name} right={<Pill tone={detectionTone(i)}>{DETECTION_LABEL[i.detection.status] ?? i.detection.status}</Pill>}>
							{i.detection.detail && <div className="oemt-muted" style={{ marginBottom: 10 }}>{i.detection.detail}</div>}
							{i.capabilities.map((c) => (
								<div key={c.id} style={{ padding: '4px 0' }}>
									<div className="oemt-row">
										<Pill tone={CAP_TONE[c.status]}>{c.status}</Pill>
										<span>{c.label}</span>
									</div>
									{c.note && <div className="oemt-muted oemt-small" style={{ marginLeft: 4, marginTop: 2 }}>{c.note}</div>}
								</div>
							))}
							<label className="oemt-row" style={{ marginTop: 12, cursor: 'pointer' }}
								title={`Records that you want the ${i.name} integration when it ships (Phase ${i.phase}). Nothing is enabled now.`}>
								<input type="checkbox" className="oemt-switch" checked={i.enabled} disabled={busy === i.id}
									onChange={(e) => toggle(i, e.target.checked)} />
								<span>Opt in for Phase {i.phase}</span>
							</label>
						</Panel>
					))}
				</div>
			)}
		</div>
	);
};
