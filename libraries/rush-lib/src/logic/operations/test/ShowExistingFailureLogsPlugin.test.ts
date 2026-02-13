// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@rushstack/node-core-library');

import { FileSystem } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { ShowExistingFailureLogsPlugin } from '../ShowExistingFailureLogsPlugin';
import { PhasedCommandHooks } from '../../../pluginFramework/PhasedCommandHooks';
import { OperationStatus } from '../OperationStatus';

describe(ShowExistingFailureLogsPlugin.name, () => {
  let mockTerminalProvider: StringBufferTerminalProvider;
  let mockTerminal: Terminal;
  let hooks: PhasedCommandHooks;
  let plugin: ShowExistingFailureLogsPlugin;

  beforeEach(() => {
    mockTerminalProvider = new StringBufferTerminalProvider(false);
    mockTerminal = new Terminal(mockTerminalProvider);
    hooks = new PhasedCommandHooks();
    plugin = new ShowExistingFailureLogsPlugin({ terminal: mockTerminal });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should apply the plugin to hooks', () => {
    plugin.apply(hooks);
    expect(hooks.beforeExecuteOperation.isUsed()).toBe(true);
  });

  it('should handle operations with existing error logs', async () => {
    // Mock FileSystem.existsAsync to return true (error log exists)
    jest.spyOn(FileSystem, 'existsAsync').mockResolvedValue(true);

    // Apply the plugin
    plugin.apply(hooks);

    // Create a minimal mock context
    const mockRunnerContext = {
      operation: {
        logFilenameIdentifier: 'test-operation',
        associatedProject: {
          projectFolder: '/test/project',
          packageName: 'test-package'
        }
      },
      _operationMetadataManager: {
        tryRestoreAsync: jest.fn()
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runWithTerminalAsync: jest.fn(async (callback: any) => {
        await callback(mockTerminal, mockTerminalProvider);
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    // Trigger the beforeExecuteOperation hook
    const result = await hooks.beforeExecuteOperation.promise(mockRunnerContext);

    expect(result).toBe(OperationStatus.Failure);
    expect(FileSystem.existsAsync).toHaveBeenCalled();
  });

  it('should handle operations without error logs', async () => {
    // Mock FileSystem.existsAsync to return false (no error log)
    jest.spyOn(FileSystem, 'existsAsync').mockResolvedValue(false);

    // Apply the plugin
    plugin.apply(hooks);

    // Create a minimal mock context
    const mockRunnerContext = {
      operation: {
        logFilenameIdentifier: 'test-operation',
        associatedProject: {
          projectFolder: '/test/project'
        }
      },
      _operationMetadataManager: {
        tryRestoreAsync: jest.fn()
      },
      runWithTerminalAsync: jest.fn()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    // Trigger the beforeExecuteOperation hook
    const result = await hooks.beforeExecuteOperation.promise(mockRunnerContext);

    expect(result).toBe(OperationStatus.Skipped);
    expect(FileSystem.existsAsync).toHaveBeenCalled();
    expect(mockRunnerContext.runWithTerminalAsync).not.toHaveBeenCalled();
  });
});
