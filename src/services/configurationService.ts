/**
 * Configuration Service
 * Access VSCode configuration
 */

import * as vscode from 'vscode';
import { createDecorator } from '../di/instantiation';

export const IConfigurationService = createDecorator<IConfigurationService>('configurationService');

export interface IConfigurationService {
	readonly _serviceBrand: undefined;

	/**
	 * Get configuration value
	 * @param section Config path, supports "scope.key" format (e.g. "claudix.environmentVariables")
	 * @param defaultValue Default value
	 */
	getValue<T>(section: string, defaultValue?: T): T | undefined;

	/**
	 * Update configuration value
	 * @param section Config path, supports "scope.key" format
	 * @param value New value
	 * @param target Config target (Global, Workspace, WorkspaceFolder)
	 */
	updateValue(section: string, value: any, target?: vscode.ConfigurationTarget): Thenable<void>;

	/**
	 * Configuration change event
	 */
	onDidChangeConfiguration: vscode.Event<vscode.ConfigurationChangeEvent>;
}

export class ConfigurationService implements IConfigurationService {
	readonly _serviceBrand: undefined;

	get onDidChangeConfiguration(): vscode.Event<vscode.ConfigurationChangeEvent> {
		return vscode.workspace.onDidChangeConfiguration;
	}

	getValue<T>(section: string, defaultValue?: T): T | undefined {
		// Support "scope.key" format, e.g. "claudix.environmentVariables"
		const parts = section.split('.');
		if (parts.length > 1) {
			const scope = parts[0];
			const key = parts.slice(1).join('.');
			const config = vscode.workspace.getConfiguration(scope);
			return config.get<T>(key, defaultValue as T);
		}

		// Single-level config, e.g. "editor.fontSize"
		const config = vscode.workspace.getConfiguration();
		return config.get<T>(section, defaultValue as T);
	}

	updateValue(section: string, value: any, target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global): Thenable<void> {
		// Support "scope.key" format
		const parts = section.split('.');
		if (parts.length > 1) {
			const scope = parts[0];
			const key = parts.slice(1).join('.');
			const config = vscode.workspace.getConfiguration(scope);
			return config.update(key, value, target);
		}

		// Single-level config
		const config = vscode.workspace.getConfiguration();
		return config.update(section, value, target);
	}
}
