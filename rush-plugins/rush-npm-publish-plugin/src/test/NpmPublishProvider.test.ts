// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Mock child_process.spawn
jest.mock('node:child_process', () => {
  const actual: typeof import('node:child_process') = jest.requireActual('node:child_process');
  return {
    ...actual,
    spawn: jest.fn()
  };
});

// Mock FileSystem.exists
jest.mock('@rushstack/node-core-library', () => {
  const actual: typeof import('@rushstack/node-core-library') = jest.requireActual(
    '@rushstack/node-core-library'
  );
  return {
    ...actual,
    FileSystem: {
      ...actual.FileSystem,
      exists: jest.fn().mockReturnValue(false)
    }
  };
});

import { EventEmitter } from 'node:events';
import * as childProcess from 'node:child_process';

import { FileSystem } from '@rushstack/node-core-library';
import type {
  IPublishProviderPublishOptions,
  IPublishProviderCheckExistsOptions,
  IPublishProjectInfo
} from '@rushstack/rush-sdk';

import { NpmPublishProvider } from '../NpmPublishProvider';

interface IMockChildProcess extends EventEmitter {
  stdin: EventEmitter;
  stdout: EventEmitter;
  stderr: EventEmitter;
}

function createMockSpawnProcess(exitCode: number = 0, stdoutData?: string): IMockChildProcess {
  const cp: IMockChildProcess = Object.assign(new EventEmitter(), {
    stdin: new EventEmitter(),
    stdout: new EventEmitter(),
    stderr: new EventEmitter()
  });

  setTimeout(() => {
    if (stdoutData) {
      cp.stdout.emit('data', Buffer.from(stdoutData));
    }
    cp.emit('close', exitCode);
  }, 0);

  return cp;
}

interface IMockProject {
  packageName: string;
  publishFolder: string;
  rushConfiguration: {
    packageManager: string;
    packageManagerToolFilename: string;
    commonTempFolder: string;
  };
}

function createMockProject(overrides?: Partial<IMockProject>): IMockProject {
  return {
    packageName: '@scope/test-package',
    publishFolder: '/fake/project/folder',
    rushConfiguration: {
      packageManager: 'pnpm',
      packageManagerToolFilename: '/fake/pnpm',
      commonTempFolder: '/fake/common/temp'
    },
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

describe(NpmPublishProvider.name, () => {
  let provider: NpmPublishProvider;

  beforeEach(() => {
    provider = new NpmPublishProvider();
    jest.clearAllMocks();
    (FileSystem.exists as jest.Mock).mockReturnValue(false);
  });

  describe('providerName', () => {
    it('returns "npm"', () => {
      expect(provider.providerName).toBe('npm');
    });
  });

  describe('publishAsync', () => {
    it('calls spawn with correct args for pnpm', async () => {
      const mockProject: IMockProject = createMockProject();
      const mockLogger: IMockLogger = createMockLogger();

      (childProcess.spawn as jest.Mock).mockReturnValue(createMockSpawnProcess(0));

      const options: IPublishProviderPublishOptions = {
        projects: [
          {
            project: mockProject,
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
      expect(spawnArgs[0]).toBe('/fake/pnpm');
      expect(spawnArgs[1]).toContain('publish');
      expect(spawnArgs[1]).toContain('--no-git-checks');
    });

    it('uses npm when package manager is yarn', async () => {
      const mockProject: IMockProject = createMockProject({
        rushConfiguration: {
          packageManager: 'yarn',
          packageManagerToolFilename: '/fake/yarn',
          commonTempFolder: '/fake/common/temp'
        }
      });
      const mockLogger: IMockLogger = createMockLogger();

      (childProcess.spawn as jest.Mock).mockReturnValue(createMockSpawnProcess(0));

      const options: IPublishProviderPublishOptions = {
        projects: [
          {
            project: mockProject,
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

      const spawnArgs: unknown[] = (childProcess.spawn as jest.Mock).mock.calls[0];
      expect(spawnArgs[0]).toBe('npm');
    });

    it('adds tag when provided via options', async () => {
      const mockProject: IMockProject = createMockProject();
      const mockLogger: IMockLogger = createMockLogger();

      (childProcess.spawn as jest.Mock).mockReturnValue(createMockSpawnProcess(0));

      const options: IPublishProviderPublishOptions = {
        projects: [
          {
            project: mockProject,
            newVersion: '1.0.0',
            previousVersion: '0.9.0',
            changeType: 2,
            providerConfig: undefined
          } as unknown as IPublishProjectInfo
        ],
        tag: 'beta',
        dryRun: false,
        logger: mockLogger
      } as unknown as IPublishProviderPublishOptions;

      await provider.publishAsync(options);

      const spawnArgs: unknown[] = (childProcess.spawn as jest.Mock).mock.calls[0];
      expect(spawnArgs[1]).toContain('--tag');
      expect(spawnArgs[1]).toContain('beta');
    });

    it('logs dry run message without spawning', async () => {
      const mockProject: IMockProject = createMockProject();
      const mockLogger: IMockLogger = createMockLogger();

      const options: IPublishProviderPublishOptions = {
        projects: [
          {
            project: mockProject,
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

    it('applies registry URL and auth token from providerConfig', async () => {
      const mockProject: IMockProject = createMockProject();
      const mockLogger: IMockLogger = createMockLogger();

      (childProcess.spawn as jest.Mock).mockReturnValue(createMockSpawnProcess(0));

      const options: IPublishProviderPublishOptions = {
        projects: [
          {
            project: mockProject,
            newVersion: '1.0.0',
            previousVersion: '0.9.0',
            changeType: 2,
            providerConfig: {
              registryUrl: 'https://custom.registry.com/npm/',
              npmAuthToken: 'test-token-123'
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
      expect(args.some((arg: string) => arg.includes('_authToken=test-token-123'))).toBe(true);

      const spawnOptions: Record<string, unknown> = spawnArgs[2] as Record<string, unknown>;
      const env: Record<string, string> = (spawnOptions as { env: Record<string, string> }).env;
      expect(env.npm_config_registry).toBe('https://custom.registry.com/npm/');
    });

    it('adds access level from providerConfig', async () => {
      const mockProject: IMockProject = createMockProject();
      const mockLogger: IMockLogger = createMockLogger();

      (childProcess.spawn as jest.Mock).mockReturnValue(createMockSpawnProcess(0));

      const options: IPublishProviderPublishOptions = {
        projects: [
          {
            project: mockProject,
            newVersion: '1.0.0',
            previousVersion: '0.9.0',
            changeType: 2,
            providerConfig: {
              access: 'public'
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
      expect(args).toContain('--access');
      expect(args).toContain('public');
    });

    it('rejects when spawn exits with non-zero code', async () => {
      const mockProject: IMockProject = createMockProject();
      const mockLogger: IMockLogger = createMockLogger();

      (childProcess.spawn as jest.Mock).mockReturnValue(createMockSpawnProcess(1));

      const options: IPublishProviderPublishOptions = {
        projects: [
          {
            project: mockProject,
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
    it('returns true when version exists in registry', async () => {
      (childProcess.spawn as jest.Mock).mockReturnValue(
        createMockSpawnProcess(0, JSON.stringify(['1.0.0', '1.1.0', '2.0.0']))
      );

      const options: IPublishProviderCheckExistsOptions = {
        project: createMockProject(),
        version: '1.1.0',
        providerConfig: undefined
      } as unknown as IPublishProviderCheckExistsOptions;

      const result: boolean = await provider.checkExistsAsync(options);
      expect(result).toBe(true);
    });

    it('returns false when version does not exist', async () => {
      (childProcess.spawn as jest.Mock).mockReturnValue(
        createMockSpawnProcess(0, JSON.stringify(['1.0.0', '1.1.0']))
      );

      const options: IPublishProviderCheckExistsOptions = {
        project: createMockProject(),
        version: '2.0.0',
        providerConfig: undefined
      } as unknown as IPublishProviderCheckExistsOptions;

      const result: boolean = await provider.checkExistsAsync(options);
      expect(result).toBe(false);
    });

    it('returns false when package does not exist (spawn fails)', async () => {
      (childProcess.spawn as jest.Mock).mockReturnValue(createMockSpawnProcess(1));

      const options: IPublishProviderCheckExistsOptions = {
        project: createMockProject(),
        version: '1.0.0',
        providerConfig: undefined
      } as unknown as IPublishProviderCheckExistsOptions;

      const result: boolean = await provider.checkExistsAsync(options);
      expect(result).toBe(false);
    });

    it('normalizes build metadata when checking version', async () => {
      (childProcess.spawn as jest.Mock).mockReturnValue(
        createMockSpawnProcess(0, JSON.stringify(['1.0.0-beta.1']))
      );

      const options: IPublishProviderCheckExistsOptions = {
        project: createMockProject(),
        version: '1.0.0-beta.1+build.123',
        providerConfig: undefined
      } as unknown as IPublishProviderCheckExistsOptions;

      const result: boolean = await provider.checkExistsAsync(options);
      expect(result).toBe(true);
    });

    it('handles single version string response', async () => {
      (childProcess.spawn as jest.Mock).mockReturnValue(createMockSpawnProcess(0, JSON.stringify('1.0.0')));

      const options: IPublishProviderCheckExistsOptions = {
        project: createMockProject(),
        version: '1.0.0',
        providerConfig: undefined
      } as unknown as IPublishProviderCheckExistsOptions;

      const result: boolean = await provider.checkExistsAsync(options);
      expect(result).toBe(true);
    });
  });

  describe('.npmrc-publish handling', () => {
    it('sets HOME env when .npmrc exists in publish-home', async () => {
      (FileSystem.exists as jest.Mock).mockReturnValue(true);
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

      const spawnArgs: unknown[] = (childProcess.spawn as jest.Mock).mock.calls[0];
      const spawnOptions: Record<string, unknown> = spawnArgs[2] as Record<string, unknown>;
      const env: Record<string, string> = (spawnOptions as { env: Record<string, string> }).env;
      expect(env.HOME).toBe('/fake/common/temp/publish-home');
    });
  });
});
