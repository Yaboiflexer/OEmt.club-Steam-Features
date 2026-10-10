// The OEmt.club tab registry. To add a feature, write a view component and add one entry here;
// the shell renders the tab strip from this list, mounts each page on first visit and keeps it
// alive (hidden) afterwards. Views can call useTabActive() to pause work while hidden.
//
// Tab ids double as values for the `ui.default_tab` setting; when adding a tab that should be
// selectable there, also add its id to `ui.default_tab` in backend/core/schema.lua.
import { FC } from 'react';
import { HomeView } from './views/Home';
import { LibraryView } from './views/Library';
import { SessionsView } from './views/Sessions';
import { IntegrationsView } from './views/Integrations';
import { PerformanceView } from './views/Performance';
import { NetworkView } from './views/Network';
import { SettingsView } from './views/Settings';
import { DiagnosticsView } from './views/Diagnostics';

export interface TabDef {
	id: string;
	label: string;
	Component: FC;
}

export const TABS = [
	{ id: 'home', label: 'Home', Component: HomeView },
	{ id: 'library', label: 'Library', Component: LibraryView },
	{ id: 'sessions', label: 'Sessions', Component: SessionsView },
	{ id: 'integrations', label: 'Integrations', Component: IntegrationsView },
	{ id: 'performance', label: 'Performance', Component: PerformanceView },
	{ id: 'network', label: 'Network', Component: NetworkView },
	{ id: 'settings', label: 'Settings', Component: SettingsView },
	{ id: 'diagnostics', label: 'Diagnostics', Component: DiagnosticsView },
] as const satisfies readonly TabDef[];

export type TabId = (typeof TABS)[number]['id'];
