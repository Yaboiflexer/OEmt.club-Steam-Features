import { FC, useEffect, useState } from 'react';
import { api, SettingField } from '../api';
import { scheduleIpChecks } from '../iplog';
import { useShell } from '../shell';
import { ConfirmButton, Empty, ErrorText, Panel, useAsync } from '../ui';

const GROUPS: { id: string; label: string }[] = [
	{ id: 'appearance', label: 'Appearance' },
	{ id: 'library', label: 'Library' },
	{ id: 'sessions', label: 'Sessions' },
	{ id: 'network', label: 'Network' },
	{ id: 'privacy', label: 'Privacy' },
	{ id: 'integrations', label: 'Integrations' },
	{ id: 'diagnostics', label: 'Logging' },
];

/** Settings that change how the shell looks and must re-render it. */
const APPEARANCE_KEYS = new Set(['ui.accent', 'ui.reduced_motion', 'ui.default_tab']);

const Field: FC<{ field: SettingField; value: unknown; onSave: (v: unknown) => Promise<void> }> = ({ field, value, onSave }) => {
	const [draft, setDraft] = useState(String(value ?? ''));
	useEffect(() => setDraft(String(value ?? '')), [value]);

	switch (field.type) {
		case 'bool':
			return <input type="checkbox" className="oemt-switch" checked={value === true} onChange={(e) => onSave(e.target.checked)} />;
		case 'enum':
			return (
				<select className="oemt-select" value={String(value)} onChange={(e) => onSave(e.target.value)}>
					{(field.values ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
				</select>
			);
		case 'color':
			return (
				<div className="oemt-row">
					<input type="color" value={String(value)} onChange={(e) => onSave(e.target.value)} style={{ width: 36, height: 28, border: 0, background: 'none' }} />
					<input className="oemt-input" style={{ width: 100 }} value={draft} onChange={(e) => setDraft(e.target.value)}
						onBlur={() => draft !== value && onSave(draft)} onKeyDown={(e) => e.key === 'Enter' && onSave(draft)} />
				</div>
			);
		case 'int':
			return (
				<input className="oemt-input" type="number" style={{ width: 110 }} min={field.min} max={field.max} value={draft}
					onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== String(value) && onSave(Number(draft))}
					onKeyDown={(e) => e.key === 'Enter' && onSave(Number(draft))} />
			);
		default:
			return (
				<input className="oemt-input" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== value && onSave(draft)} />
			);
	}
};

export const SettingsView: FC = () => {
	const shell = useShell();
	const settings = useAsync(() => api.settings());
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [exported, setExported] = useState('');
	const [importText, setImportText] = useState('');
	const [importResult, setImportResult] = useState<string>();
	const [error, setError] = useState<unknown>();

	async function save(key: string, value: unknown) {
		try {
			await api.setSetting(key, value);
			setErrors(({ [key]: _, ...rest }) => rest);
			if (APPEARANCE_KEYS.has(key)) shell.refreshAppearance();
			if (key.startsWith('network.')) scheduleIpChecks();
		} catch (err) {
			setErrors((e) => ({ ...e, [key]: String((err as Error)?.message ?? err) }));
		}
		settings.reload();
	}

	async function resetAll() {
		setError(undefined);
		try {
			await api.resetSettings('');
			setErrors({});
			settings.reload();
			shell.refreshAppearance();
		} catch (err) {
			setError(err);
		}
	}

	async function doExport() {
		setError(undefined);
		try {
			const text = await api.exportSettings();
			setExported(text);
			navigator.clipboard?.writeText(text).catch(() => undefined);
		} catch (err) {
			setError(err);
		}
	}

	async function doImport() {
		setImportResult(undefined);
		try {
			const r = await api.importSettings(importText);
			setImportResult(`Applied ${r.applied} setting(s).` + (r.rejected.length ? ` Rejected: ${r.rejected.map((x) => `${x.key} (${x.reason})`).join(', ')}` : ''));
			settings.reload();
			shell.refreshAppearance();
		} catch (err) {
			setImportResult(`Import failed: ${String((err as Error)?.message ?? err)}`);
		}
	}

	if (!settings.data) return settings.error ? <ErrorText error={settings.error} /> : <Empty>Loading…</Empty>;
	const { values, schema, issues } = settings.data;

	return (
		<div className="oemt-stack">
			{error ? <ErrorText error={error} /> : null}
			{issues.length > 0 && (
				<div className="oemt-panel oemt-banner">
					<strong>Some stored settings were invalid and were repaired when Steam started:</strong>
					{issues.map((i, n) => <div key={n} className="oemt-muted">{i.key}: {i.problem}{i.action ? ` (${i.action})` : ''}</div>)}
				</div>
			)}

			{GROUPS.map((g) => {
				const fields = schema.filter((f) => f.group === g.id);
				if (!fields.length) return null;
				return (
					<Panel key={g.id} label={g.label}>
						{g.id === 'integrations' && <div className="oemt-muted oemt-small" style={{ marginBottom: 8 }}>Opt-in only. Nothing connects to these services in Phase 1.</div>}
						{fields.map((f) => (
							<div key={f.key} className="oemt-row" style={{ padding: '7px 0', borderBottom: '1px solid var(--oemt-line)' }}>
								<div style={{ flex: 1 }}>
									<div>{f.label}</div>
									<div className="oemt-muted oemt-small">
										{f.key}{f.type === 'int' && f.min != null ? ` · ${f.min}–${f.max}` : ''} · default {String(f.default)}
									</div>
									{errors[f.key] && <div className="oemt-small" style={{ color: 'var(--oemt-fail)' }}>{errors[f.key]}</div>}
								</div>
								<Field field={f} value={values[f.key]} onSave={(v) => save(f.key, v)} />
							</div>
						))}
					</Panel>
				);
			})}

			<Panel label="Backup">
				<div className="oemt-row oemt-wrap" style={{ marginBottom: 10 }}>
					<button className="oemt-btn" onClick={doExport}>Export settings</button>
					<span className="oemt-muted oemt-small">Copies an oemt-settings JSON document to the clipboard and shows it below.</span>
				</div>
				{exported && <textarea className="oemt-textarea" readOnly value={exported} onFocus={(e) => e.target.select()} />}
				<div className="oemt-label" style={{ marginTop: 14 }}>Import</div>
				<textarea className="oemt-textarea" placeholder="Paste an exported oemt-settings document" value={importText} onChange={(e) => setImportText(e.target.value)} />
				<div className="oemt-row" style={{ marginTop: 8 }}>
					<button className="oemt-btn oemt-primary" disabled={!importText.trim()} onClick={doImport}>Import</button>
					{importResult && <span className="oemt-muted">{importResult}</span>}
				</div>
			</Panel>

			<div className="oemt-row">
				<div className="oemt-spacer" />
				<ConfirmButton label="Reset all settings" confirmLabel="Click again to reset everything" onConfirm={resetAll} />
			</div>
		</div>
	);
};
