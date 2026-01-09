/**
 * 服务测试 / Services Tests
 */

import { describe, it, expect } from 'vitest';
import * as vscode from 'vscode';
import { InstantiationServiceBuilder } from '../src/di/instantiationServiceBuilder';
import { registerServices } from '../src/services/serviceRegistry';
import { ILogService } from '../src/services/logService';

// Mock extension context
const mockContext = {
	extensionMode: vscode.ExtensionMode.Test,
	subscriptions: [],
	extensionPath: '/mock/path',
	extensionUri: { fsPath: '/mock/path' } as any,
	globalState: { get: () => undefined, update: () => Promise.resolve() } as any,
	workspaceState: { get: () => undefined, update: () => Promise.resolve() } as any,
	storagePath: '/mock/storage',
	globalStoragePath: '/mock/global-storage',
	logPath: '/mock/logs',
} as unknown as vscode.ExtensionContext;

describe('Services', () => {
	it('should register and retrieve log service', () => {
		const builder = new InstantiationServiceBuilder();
		registerServices(builder, mockContext);

		const instantiationService = builder.seal();

		instantiationService.invokeFunction(accessor => {
			const logService = accessor.get(ILogService);
			expect(logService).toBeDefined();

			// 测试日志方法不抛出异常
			expect(() => {
				logService.info('Test message');
				logService.warn('Warning');
				logService.error('Error');
			}).not.toThrow();
		});
	});
});
