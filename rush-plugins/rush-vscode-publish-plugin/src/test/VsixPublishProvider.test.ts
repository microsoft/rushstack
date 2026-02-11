// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('node:child_process', () => {
  const actual: typeof import('node:child_process') = jest.requireActual('node:child_process');
  return {
    ...actual,
    spawn: jest.fn()
  };
});

import { EventEmitter } from 'node:events';
import * as childProcess from 'node:child_process';

import type {
  IPublishProviderPublishOptions,
  IPublishProviderCheckExistsOptions,
  IPublishProjectInfo
} from '@rushstack/rush-sdk';

import { VsixPublishProvider } from '../VsixPublishProvider';

interface IMockChildProcess extends EventEmitter {
  stdin: EventEmitter;
  stdout: EventEmitter;
  stderr: EventEmitter;
}

function createMockSpawnProcess(exitCode: number = 0): IMockChildProcess {
  const cp: IMockChildProcess = Object.assign(new EventEmitter(), {
    stdin: new EventEmitter(),
    stdout: new EventEmitter(),
    stderr: new EventEmitter()
  });

  setTimeout(() => {
    cp.emit('close', exitCode);
  }, 0);

  return cp;
}

interface IMockProject {
  packageName: string;
  publishFolder: string;
}

function createMockProject(overrides?: Partial<IMockProject>): IMockProject {
  return {
    packageName: '@scope/test-extension',
    publishFolder: '/fake/extension/folder',
    ...overrides
  };
}

interface IMockLogger {
  terminal: {
    writeLine: jest.Mock;
  };
}

function createMockLogger(): IMockLogger {
  return {
    terminal: {
      writeLine: jest.fn()
    }
  };
}

describe(VsixPublishProvider.name, () => {
  let provider: VsixPublishProvider;

  beforeEach(() => {
    provider = new VsixPublishProvider();
    jest.clearAllMocks();
  });

  describe('providerName', () => {
    it('returns "vsix"', () => {
      expect(provider.providerName).toBe('vsix');
    });
  });

  describe('publishAsync', () => {
    it('calls vsce publish with default vsix path and azure credential', async () => {
      const mockLogger: IMockLogger = createMockLogger();
      (childProcess.spawn as jest.Mock).mockReturnValue(createMockSpawnProcess(0));

      const options: IPublishProviderPublishOptions = {
        projects: [
          {
            project: createMockProject(),
            newVersion: '1.0.0',
            previousVersion: '0.9.0',
            changeType: 2,
            providerConfig: undefined
          } as unknown as IPublishProjectInfo
        ],
        tag: undefined,
        dryRun: false,
        logger: mockLogger
      } as unknown as IPublishProviderPublishOptions;

      await provider.publishAsync(options);

      expect(childProcess.spawn).toHaveBeenCalledTimes(1);
      const spawnArgs: unknown[] = (childProcess.spawn as jest.Mock).mock.calls[0];
      const args: string[] = spawnArgs[1] as string[];
      expect(args).toContain('publish');
      expect(args).toContain('--no-dependencies');
      expect(args).toContain('--packagePath');
      expect(args).toContain('--azure-credential');
      // Default vsix path
      expect(args.some((a: string) => a.includes('dist/vsix/extension.vsix'))).toBe(true);
    });

    it('uses custom vsix path from providerConfig', async () => {
      const mockLogger: IMockLogger = createMockLogger();
      (childProcess.spawn as jest.Mock).mockReturnValue(createMockSpawnProcess(0));

      const options: IPublishProviderPublishOptions = {
        projects: [
          {
            project: createMockProject(),
            newVersion: '1.0.0',
            previousVersion: '0.9.0',
            changeType: 2,
            providerConfig: {
              vsixPathPattern: 'output/my-extension.vsix'
            }
          } as unknown as IPublishProjectInfo
        ],
        tag: undefined,
        dryRun: false,
        logger: mockLogger
      } as unknown as IPublishProviderPublishOptions;

      await provider.publishAsync(options);

      const spawnArgs: unknown[] = (childProcess.spawn as jest.Mock).mock.calls[0];
      const args: string[] = spawnArgs[1] as string[];
      expect(args.some((a: string) => a.includes('output/my-extension.vsix'))).toBe(true);
    });

    it('omits --azure-credential when useAzureCredential is false', async () => {
      const mockLogger: IMockLogger = createMockLogger();
      (childProcess.spawn as jest.Mock).mockReturnValue(createMockSpawnProcess(0));

      const options: IPublishProviderPublishOptions = {
        projects: [
          {
            project: createMockProject(),
            newVersion: '1.0.0',
            previousVersion: '0.9.0',
            changeType: 2,
            providerConfig: {
              useAzureCredential: false
            }
          } as unknown as IPublishProjectInfo
        ],
        tag: undefined,
        dryRun: false,
        logger: mockLogger
      } as unknown as IPublishProviderPublishOptions;

      await provider.publishAsync(options);

      const spawnArgs: unknown[] = (childProcess.spawn as jest.Mock).mock.calls[0];
      const args: string[] = spawnArgs[1] as string[];
      expect(args).not.toContain('--azure-credential');
    });

    it('logs dry run message without spawning', async () => {
      const mockLogger: IMockLogger = createMockLogger();

      const options: IPublishProviderPublishOptions = {
        projects: [
          {
            project: createMockProject(),
            newVersion: '1.0.0',
            previousVersion: '0.9.0',
            changeType: 2,
            providerConfig: undefined
          } as unknown as IPublishProjectInfo
        ],
        tag: undefined,
        dryRun: true,
        logger: mockLogger
      } as unknown as IPublishProviderPublishOptions;

      await provider.publishAsync(options);

      expect(childProcess.spawn).not.toHaveBeenCalled();
      expect(mockLogger.terminal.writeLine).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN]'));
    });

    it('rejects when vsce exits with non-zero code', async () => {
      const mockLogger: IMockLogger = createMockLogger();
      (childProcess.spawn as jest.Mock).mockReturnValue(createMockSpawnProcess(1));

      const options: IPublishProviderPublishOptions = {
        projects: [
          {
            project: createMockProject(),
            newVersion: '1.0.0',
            previousVersion: '0.9.0',
            changeType: 2,
            providerConfig: undefined
          } as unknown as IPublishProjectInfo
        ],
        tag: undefined,
        dryRun: false,
        logger: mockLogger
      } as unknown as IPublishProviderPublishOptions;

      await expect(provider.publishAsync(options)).rejects.toThrow(/exited with code 1/);
    });
  });

  describe('checkExistsAsync', () => {
    it('always returns false', async () => {
      const options: IPublishProviderCheckExistsOptions = {
        project: createMockProject(),
        version: '1.0.0',
        providerConfig: undefined
      } as unknown as IPublishProviderCheckExistsOptions;

      const result: boolean = await provider.checkExistsAsync(options);
      expect(result).toBe(false);
    });
  });
});
