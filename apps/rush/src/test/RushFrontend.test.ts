// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import * as rushLib from '@microsoft/rush-lib';
import type { ILaunchOptions } from '@microsoft/rush-lib';
import { EnvironmentConfiguration } from '@microsoft/rush-lib/lib/api/EnvironmentConfiguration';
import { RushCommandLineParser } from '@microsoft/rush-lib/lib/cli/RushCommandLineParser';
import {
  ReporterHost,
  ReporterManager,
  type IReporter,
  type IReporterContext,
  type IReporterEventEnvelope,
  type IReporterEventSink
} from '@rushstack/rush-reporter';

import { launchRushFrontendAsync, type IRushFrontendProcessLifecycle } from '../RushFrontend';
import type { IRushFrontendLaunchOptions } from '../IRushFrontendLaunchOptions';
import {
  initializeRushReporterHostAsync,
  type IInitializedRushReporterHost,
  type IRushReporterSelection
} from '../RushReporterHost';
import { RushVersionSelector } from '../RushVersionSelector';
import type { MinimalRushConfiguration } from '../MinimalRushConfiguration';

async function createInitializedHostAsync(
  order: string[],
  reason: IInitializedRushReporterHost['selection']['reason'] = 'pre-major legacy default'
): Promise<IInitializedRushReporterHost> {
  order.push('host');
  const host: ReporterHost = new ReporterHost({ env: {} });
  await host.manager.initializeAsync();
  let closePromise: Promise<void> | undefined;
  const hasExplicitReporter: boolean = reason === 'explicit --reporter';
  return {
    host,
    sink: host.getSink(),
    selection: {
      reporter: 'legacy',
      logLevel: 'normal',
      outputs: [],
      commandJson: false,
      enabled: false,
      reporterControlsOwnedByFrontend: hasExplicitReporter,
      reporterValueFlagsToStrip: hasExplicitReporter ? ['--reporter'] : [],
      reason
    },
    closeAsync: (timeoutMs?: number) => {
      if (!closePromise) {
        order.push('close');
        closePromise = host.manager.closeAsync(timeoutMs);
      }
      return closePromise;
    }
  };
}

async function createEnabledHostAsync(
  closeAsync?: (timeoutMs?: number) => Promise<void>
): Promise<IInitializedRushReporterHost> {
  const host: ReporterHost = new ReporterHost({ env: {} });
  await host.manager.initializeAsync();
  return {
    host,
    sink: host.getSink(),
    selection: {
      reporter: 'json',
      logLevel: 'normal',
      outputs: [],
      commandJson: false,
      enabled: true,
      reporterControlsOwnedByFrontend: true,
      reporterValueFlagsToStrip: ['--reporter', '--output', '--log-level'],
      reason: 'explicit --reporter'
    },
    closeAsync: closeAsync ?? ((timeoutMs?: number) => host.manager.closeAsync(timeoutMs))
  };
}

async function createPhaseHangingHostAsync(
  hangingPhase: 'flush' | 'close'
): Promise<IInitializedRushReporterHost> {
  const never: Promise<void> = new Promise(() => undefined);
  const reporter: IReporter = {
    name: `hang-${hangingPhase}`,
    initializeAsync: async (context: IReporterContext) => {
      void context;
    },
    report: (event: IReporterEventEnvelope<unknown>) => {
      void event;
    },
    flushAsync: () => (hangingPhase === 'flush' ? never : Promise.resolve()),
    closeAsync: () => (hangingPhase === 'close' ? never : Promise.resolve())
  };
  const manager: ReporterManager = new ReporterManager();
  manager.addReporter(reporter);
  const host: ReporterHost = new ReporterHost({ env: {}, manager });
  await manager.initializeAsync();
  let closePromise: Promise<void> | undefined;
  return {
    host,
    sink: host.getSink(),
    selection: {
      reporter: 'json',
      logLevel: 'normal',
      outputs: [],
      commandJson: false,
      enabled: true,
      reporterControlsOwnedByFrontend: true,
      reporterValueFlagsToStrip: ['--reporter', '--output', '--log-level'],
      reason: 'explicit --reporter'
    },
    closeAsync: (timeoutMs?: number) => {
      closePromise ??= manager.closeAsync(timeoutMs);
      return closePromise;
    }
  };
}

interface ITestProcessLifecycle extends IRushFrontendProcessLifecycle {
  beforeExitListener: (() => void) | undefined;
  readonly signalListeners: Map<'SIGINT' | 'SIGTERM', () => void>;
  readonly terminatedSignals: Array<'SIGINT' | 'SIGTERM'>;
  readonly exitCodes: number[];
  readonly closeErrors: Error[];
}

function createTestProcessLifecycle(): ITestProcessLifecycle {
  const lifecycle: ITestProcessLifecycle = {
    beforeExitListener: undefined,
    signalListeners: new Map(),
    terminatedSignals: [],
    exitCodes: [],
    closeErrors: [],
    registerBeforeExit: (listener: () => void) => {
      lifecycle.beforeExitListener = listener;
      return () => {
        if (lifecycle.beforeExitListener === listener) {
          lifecycle.beforeExitListener = undefined;
        }
      };
    },
    registerSignal: (signal: 'SIGINT' | 'SIGTERM', listener: () => void) => {
      lifecycle.signalListeners.set(signal, listener);
      return () => {
        if (lifecycle.signalListeners.get(signal) === listener) {
          lifecycle.signalListeners.delete(signal);
        }
      };
    },
    terminate: (signal: 'SIGINT' | 'SIGTERM') => {
      lifecycle.terminatedSignals.push(signal);
    },
    setExitCode: (exitCode: number) => {
      lifecycle.exitCodes.push(exitCode);
    },
    reportCloseError: (error: Error) => {
      lifecycle.closeErrors.push(error);
    }
  };
  return lifecycle;
}

function emitCommandStarted(sink: IReporterEventSink): void {
  sink.emit({
    protocolVersion: { major: 1, minor: 0 },
    sessionId: 'session',
    source: { packageName: '@microsoft/rush-lib', packageVersion: '5.178.1' },
    privacy: 'public',
    type: 'commandStarted',
    payload: { commandName: 'build' }
  });
}

describe(launchRushFrontendAsync.name, () => {
  it('creates the authoritative host before invoking the bundled rush-lib and passes only its channel', async () => {
    const order: string[] = [];
    let receivedOptions: IRushFrontendLaunchOptions | undefined;
    const processLifecycle: ITestProcessLifecycle = createTestProcessLifecycle();
    const originalArgv: string[] = process.argv;
    process.argv = ['node', 'rush', 'build', '--reporter=legacy', '--json'];

    try {
      await launchRushFrontendAsync({
        currentPackageVersion: '5.178.1',
        rushVersionToLoad: undefined,
        configuration: undefined,
        launchOptions: { isManaged: false },
        currentRushLib: rushLib,
        initializeReporterHostAsync: () => createInitializedHostAsync(order, 'explicit --reporter'),
        executeCurrentRush: (version, selectedRushLib, launchOptions) => {
          void version;
          void selectedRushLib;
          order.push('engine');
          receivedOptions = launchOptions;
          return launchOptions.reporterCloseAsync();
        },
        processLifecycle
      });

      expect(order).toEqual(['host', 'engine', 'close']);
      expect(process.argv).toEqual(['node', 'rush', 'build', '--json']);
      expect(receivedOptions?.reporter).toEqual({
        eventSink: expect.objectContaining({ emit: expect.any(Function) }),
        sessionId: expect.any(String),
        operationStreamEnabled: false
      });
      expect(receivedOptions).not.toHaveProperty('selection');
      expect(receivedOptions).not.toHaveProperty('host');
      expect(receivedOptions).not.toHaveProperty('manager');
      expect(processLifecycle.beforeExitListener).toBeUndefined();
      expect(processLifecycle.signalListeners.size).toBe(0);
    } finally {
      process.argv = originalArgv;
    }
  });

  it('passes one typed reporter session through the real Rush launch boundary', async () => {
    const order: string[] = [];
    const initialized: IInitializedRushReporterHost = await createInitializedHostAsync(order);
    const createSessionId: jest.Mock<string, []> = jest.fn(() => 'session-from-frontend');
    let receivedOptions: ILaunchOptions | undefined;
    const launchSpy: jest.SpyInstance = jest
      .spyOn(rushLib.Rush, 'launch')
      .mockImplementation((version, launchOptions) => {
        void version;
        receivedOptions = launchOptions;
      });
    const originalArgv: string[] = process.argv;
    process.argv = ['node', 'rush', 'build'];

    try {
      await launchRushFrontendAsync({
        currentPackageVersion: '5.178.1',
        rushVersionToLoad: undefined,
        configuration: undefined,
        launchOptions: { isManaged: false },
        currentRushLib: rushLib,
        initializeReporterHostAsync: async () => initialized,
        createSessionId,
        processLifecycle: createTestProcessLifecycle()
      });

      expect(launchSpy).toHaveBeenCalledTimes(1);
      expect(createSessionId).toHaveBeenCalledTimes(1);
      expect(receivedOptions?.reporter).toEqual({
        eventSink: initialized.sink,
        sessionId: 'session-from-frontend',
        operationStreamEnabled: false
      });
      await initialized.closeAsync();
      expect(order).toEqual(['host', 'close']);
    } finally {
      launchSpy.mockRestore();
      process.argv = originalArgv;
    }
  });

  it('rejects an explicit reporter before initializing an incompatible selected engine', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-old-engine-'));
    const outputPath: string = path.join(directory, 'events.jsonl');
    const processLifecycle: ITestProcessLifecycle = createTestProcessLifecycle();
    const originalArgv: string[] = process.argv;
    process.argv = ['node', 'rush', 'build', '--reporter=json', `--output=json://${outputPath}`];
    const createVersionSelector: jest.Mock = jest.fn();

    try {
      await expect(
        launchRushFrontendAsync({
          currentPackageVersion: '5.178.1',
          rushVersionToLoad: '5.177.0',
          configuration: undefined,
          launchOptions: { isManaged: true },
          currentRushLib: rushLib,
          initializeReporterHostAsync: (options) =>
            initializeRushReporterHostAsync({
              ...options,
              argv: process.argv.slice(2),
              cwd: directory,
              env: {},
              stdout: { isTTY: false, write: () => undefined }
            }),
          createVersionSelector,
          processLifecycle
        })
      ).rejects.toThrow(/selected Rush engine 5\.177\.0 cannot safely use --reporter=json/);

      expect(createVersionSelector).not.toHaveBeenCalled();
      expect(processLifecycle.beforeExitListener).toBeUndefined();
      expect(processLifecycle.signalListeners.size).toBe(0);
      await expect(fs.promises.stat(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      process.argv = originalArgv;
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps an implicit repository opt-in on the legacy path for an incompatible engine', async () => {
    const processLifecycle: ITestProcessLifecycle = createTestProcessLifecycle();
    const versionSelector: RushVersionSelector = Object.create(RushVersionSelector.prototype);
    let receivedArgv: string[] | undefined;
    versionSelector.ensureRushVersionInstalledAsync = async (version, configuration, launchOptions) => {
      void version;
      void configuration;
      receivedArgv = [...process.argv];
      await launchOptions.reporterCloseAsync();
    };
    const originalArgv: string[] = process.argv;
    process.argv = ['node', 'rush', 'custom', '--output', 'custom.zip', '--log-level', 'custom', '--verbose'];
    let selection: IRushReporterSelection | undefined;

    try {
      await launchRushFrontendAsync({
        currentPackageVersion: '5.178.1',
        rushVersionToLoad: '5.177.0',
        configuration: { useRushReporter: true } as MinimalRushConfiguration,
        launchOptions: { isManaged: true },
        currentRushLib: rushLib,
        initializeReporterHostAsync: async (options) => {
          const initialized: IInitializedRushReporterHost = await initializeRushReporterHostAsync({
            ...options,
            argv: process.argv.slice(2),
            env: {},
            stdout: { isTTY: false, write: () => undefined },
            includeDefaultFileReporter: false
          });
          selection = initialized.selection;
          return initialized;
        },
        createVersionSelector: () => versionSelector,
        processLifecycle
      });

      expect(selection).toMatchObject({
        reporter: 'legacy',
        enabled: false,
        reporterControlsOwnedByFrontend: false,
        reporterValueFlagsToStrip: []
      });
      expect(receivedArgv).toEqual(process.argv);
      expect(processLifecycle.beforeExitListener).toBeUndefined();
      expect(processLifecycle.signalListeners.size).toBe(0);
    } finally {
      process.argv = originalArgv;
    }
  });

  it.each([
    {
      name: 'unsupported custom reporter',
      reporter: 'junit',
      expectedArgv: [
        'node',
        'rush',
        'custom',
        '--reporter',
        'junit',
        '--output',
        'custom.zip',
        '--log-level',
        'custom',
        '--verbose'
      ]
    },
    {
      name: 'explicit legacy reporter',
      reporter: 'legacy',
      expectedArgv: ['node', 'rush', 'custom', '--output', 'custom.zip', '--log-level', 'custom', '--verbose']
    }
  ])('preserves the old-engine $name escape path', async ({ reporter, expectedArgv }) => {
    const processLifecycle: ITestProcessLifecycle = createTestProcessLifecycle();
    const versionSelector: RushVersionSelector = Object.create(RushVersionSelector.prototype);
    let receivedArgv: string[] | undefined;
    versionSelector.ensureRushVersionInstalledAsync = async (version, configuration, launchOptions) => {
      void version;
      void configuration;
      receivedArgv = [...process.argv];
      await launchOptions.reporterCloseAsync();
    };
    const originalArgv: string[] = process.argv;
    process.argv = [
      'node',
      'rush',
      'custom',
      '--reporter',
      reporter,
      '--output',
      'custom.zip',
      '--log-level',
      'custom',
      '--verbose'
    ];

    try {
      await launchRushFrontendAsync({
        currentPackageVersion: '5.178.1',
        rushVersionToLoad: '5.177.0',
        configuration: undefined,
        launchOptions: { isManaged: true },
        currentRushLib: rushLib,
        initializeReporterHostAsync: (options) =>
          initializeRushReporterHostAsync({
            ...options,
            argv: process.argv.slice(2),
            env: {},
            stdout: { isTTY: false, write: () => undefined },
            includeDefaultFileReporter: false
          }),
        createVersionSelector: () => versionSelector,
        processLifecycle
      });

      expect(receivedArgv).toEqual(expectedArgv);
      expect(processLifecycle.beforeExitListener).toBeUndefined();
      expect(processLifecycle.signalListeners.size).toBe(0);
    } finally {
      process.argv = originalArgv;
    }
  });

  it.each([
    {
      name: 'unsupported reporter as a custom value',
      reporter: 'junit',
      env: {},
      expectedArguments: [
        '--reporter',
        'junit',
        '--output',
        'custom.zip',
        '--log-level',
        'custom',
        '--verbose'
      ],
      expectedEnabled: false
    },
    {
      name: 'supported reporter as frontend ownership',
      reporter: 'json',
      env: {},
      expectedArguments: ['--verbose'],
      expectedEnabled: true
    },
    {
      name: 'explicit legacy under the emergency override',
      reporter: 'legacy',
      env: { RUSH_REPORTER: 'legacy' },
      expectedArguments: ['--output', 'custom.zip', '--log-level', 'custom', '--verbose'],
      expectedEnabled: false
    }
  ])('runs the real custom command fixture with $name', async (testCase) => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-custom-command-'));
    const repoPath: string = path.join(directory, 'repo');
    const fixturePath: string = path.resolve(
      __dirname,
      '../../../../libraries/rush-lib/src/cli/test/basicAndRunBuildActionRepo'
    );
    await fs.promises.cp(fixturePath, repoPath, { recursive: true });
    const reporterOutputPath: string = path.join(directory, 'reporter.jsonl');
    const outputValue: string = testCase.reporter === 'json' ? `json://${reporterOutputPath}` : 'custom.zip';
    const logLevelValue: string = testCase.reporter === 'json' ? 'debug' : 'custom';
    const originalArgv: string[] = process.argv;
    const originalExitCode: string | number | null | undefined = process.exitCode;
    process.argv = [
      'node',
      'rush',
      'custom-output',
      '--reporter',
      testCase.reporter,
      '--output',
      outputValue
    ];
    if (testCase.reporter !== 'json') {
      process.argv.push('--log-level', logLevelValue);
    }
    process.argv.push('--verbose');
    let selection: IRushReporterSelection | undefined;

    try {
      EnvironmentConfiguration.reset();
      await launchRushFrontendAsync({
        currentPackageVersion: '5.178.1',
        rushVersionToLoad: undefined,
        configuration: undefined,
        launchOptions: { isManaged: true },
        currentRushLib: rushLib,
        initializeReporterHostAsync: async (options) => {
          const initialized: IInitializedRushReporterHost = await initializeRushReporterHostAsync({
            ...options,
            argv: process.argv.slice(2),
            cwd: repoPath,
            env: testCase.env,
            stdout: { isTTY: false, write: () => undefined },
            includeDefaultFileReporter: false
          });
          selection = initialized.selection;
          return initialized;
        },
        executeCurrentRush: (version, selectedRushLib, launchOptions) => {
          void version;
          void selectedRushLib;
          const parser: RushCommandLineParser = new RushCommandLineParser({
            cwd: repoPath,
            reporterCloseAsync: launchOptions.reporterCloseAsync
          });
          return parser.executeAsync().then(() => undefined);
        },
        processLifecycle: createTestProcessLifecycle()
      });

      expect(selection?.enabled).toBe(testCase.expectedEnabled);
      expect(
        JSON.parse(await fs.promises.readFile(path.join(repoPath, 'custom-output-args.json'), 'utf8'))
      ).toEqual(testCase.expectedArguments);
    } finally {
      EnvironmentConfiguration.reset();
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects an unsupported reporter typo when repository opt-in establishes ownership', async () => {
    const originalArgv: string[] = process.argv;
    process.argv = ['node', 'rush', 'custom-output', '--reporter=junit'];

    try {
      await expect(
        launchRushFrontendAsync({
          currentPackageVersion: '5.178.1',
          rushVersionToLoad: undefined,
          configuration: { useRushReporter: true } as MinimalRushConfiguration,
          launchOptions: { isManaged: true },
          currentRushLib: rushLib,
          initializeReporterHostAsync: (options) =>
            initializeRushReporterHostAsync({
              ...options,
              argv: process.argv.slice(2),
              env: {},
              stdout: { isTTY: false, write: () => undefined },
              includeDefaultFileReporter: false
            }),
          processLifecycle: createTestProcessLifecycle()
        })
      ).rejects.toThrow('Unsupported reporter "junit"');
    } finally {
      process.argv = originalArgv;
    }
  });

  it('runs a value-less custom reporter flag through the real frontend and parser boundary', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-custom-reporter-flag-'));
    const repoPath: string = path.join(directory, 'repo');
    const fixturePath: string = path.resolve(
      __dirname,
      '../../../../libraries/rush-lib/src/cli/test/basicAndRunRebuildActionRepo'
    );
    await fs.promises.cp(fixturePath, repoPath, { recursive: true });
    const originalArgv: string[] = process.argv;
    const originalExitCode: string | number | null | undefined = process.exitCode;
    process.argv = ['node', 'rush', 'custom-reporter-flag', '--reporter'];
    const processLifecycle: ITestProcessLifecycle = createTestProcessLifecycle();
    let selection: IRushReporterSelection | undefined;

    try {
      EnvironmentConfiguration.reset();
      await launchRushFrontendAsync({
        currentPackageVersion: '5.178.1',
        rushVersionToLoad: undefined,
        configuration: undefined,
        launchOptions: { isManaged: true },
        currentRushLib: rushLib,
        initializeReporterHostAsync: async (options) => {
          const initialized: IInitializedRushReporterHost = await initializeRushReporterHostAsync({
            ...options,
            argv: process.argv.slice(2),
            cwd: repoPath,
            env: {},
            stdout: { isTTY: false, write: () => undefined },
            includeDefaultFileReporter: false
          });
          selection = initialized.selection;
          return initialized;
        },
        executeCurrentRush: (version, selectedRushLib, launchOptions) => {
          void version;
          void selectedRushLib;
          const parser: RushCommandLineParser = new RushCommandLineParser({
            cwd: repoPath,
            reporterCloseAsync: launchOptions.reporterCloseAsync
          });
          return parser.executeAsync().then(() => undefined);
        },
        processLifecycle
      });

      expect(selection).toMatchObject({
        reporter: 'legacy',
        enabled: false,
        reporterControlsOwnedByFrontend: false
      });
      expect(
        JSON.parse(await fs.promises.readFile(path.join(repoPath, 'custom-reporter-flag-args.json'), 'utf8'))
      ).toEqual(['--reporter']);
      expect(processLifecycle.beforeExitListener).toBeUndefined();
      expect(processLifecycle.signalListeners.size).toBe(0);
    } finally {
      EnvironmentConfiguration.reset();
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('flushes and closes an explicit output through the real frontend boundary on success', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-frontend-'));
    const outputPath: string = path.join(directory, 'events.jsonl');
    const originalArgv: string[] = process.argv;
    let stdoutText: string = '';
    process.argv = ['node', 'rush', 'build', '--reporter=json', `--output=json://${outputPath}`];

    try {
      await launchRushFrontendAsync({
        currentPackageVersion: '5.178.1',
        rushVersionToLoad: undefined,
        configuration: undefined,
        launchOptions: { isManaged: false },
        currentRushLib: rushLib,
        initializeReporterHostAsync: (options) =>
          initializeRushReporterHostAsync({
            ...options,
            argv: process.argv.slice(2),
            cwd: directory,
            env: {},
            stdout: {
              isTTY: false,
              write: (text: string) => {
                stdoutText += text;
              }
            },
            includeDefaultFileReporter: false
          }),
        executeCurrentRush: (version, selectedRushLib, launchOptions) => {
          void version;
          void selectedRushLib;
          emitCommandStarted(launchOptions.reporter.eventSink);
          return launchOptions.reporterCloseAsync();
        },
        processLifecycle: createTestProcessLifecycle()
      });

      expect(JSON.parse(stdoutText).type).toBe('commandStarted');
      expect(JSON.parse(await fs.promises.readFile(outputPath, 'utf8')).type).toBe('commandStarted');
    } finally {
      process.argv = originalArgv;
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('flushes an explicit output before the parser process.exit backstop', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-parser-exit-'));
    const outputPath: string = path.join(directory, 'events.jsonl');
    const originalArgv: string[] = process.argv;
    const originalExitCode: string | number | null | undefined = process.exitCode;
    process.argv = ['node', 'rush', 'build', '--reporter=json', `--output=json://${outputPath}`];
    let outputAtExit: string | undefined;

    try {
      await launchRushFrontendAsync({
        currentPackageVersion: '5.178.1',
        rushVersionToLoad: undefined,
        configuration: undefined,
        launchOptions: { isManaged: false },
        currentRushLib: rushLib,
        initializeReporterHostAsync: (options) =>
          initializeRushReporterHostAsync({
            ...options,
            argv: process.argv.slice(2),
            cwd: directory,
            env: {},
            stdout: { isTTY: false, write: () => undefined },
            includeDefaultFileReporter: false
          }),
        executeCurrentRush: (version, selectedRushLib, launchOptions) => {
          void version;
          void selectedRushLib;
          emitCommandStarted(launchOptions.reporter.eventSink);
          const parser: RushCommandLineParser = Object.create(RushCommandLineParser.prototype);
          Object.defineProperty(parser, '_debugParameter', { value: { value: false } });
          Object.defineProperty(parser, '_rushOptions', {
            value: { reporterCloseAsync: launchOptions.reporterCloseAsync }
          });
          process.exitCode = 1;

          return new Promise<void>((resolve: () => void) => {
            jest.spyOn(process, 'exit').mockImplementation(() => {
              outputAtExit = fs.readFileSync(outputPath, 'utf8');
              resolve();
              return undefined as never;
            });
            jest.spyOn(console, 'error').mockImplementation(() => undefined);
            (
              parser as unknown as {
                _reportErrorAndSetExitCode(error: Error): void;
              }
            )._reportErrorAndSetExitCode(new Error('parser failed'));
          });
        },
        processLifecycle: createTestProcessLifecycle()
      });

      expect(JSON.parse(outputAtExit!).type).toBe('commandStarted');
    } finally {
      jest.restoreAllMocks();
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('preserves pass-through arguments byte-for-byte through the real frontend boundary', async () => {
    const originalArgv: string[] = process.argv;
    const passThroughArguments: string[] = [
      '--',
      '--reporter=unknown',
      '--reporter',
      'tool-reporter',
      '--output=not-a-url',
      '--output',
      'tool-output',
      '--log-level=loud',
      '--log-level',
      'tool-level',
      '--quiet',
      '-q',
      '--verbose',
      '--debug',
      '-d',
      '--json',
      'ordinary',
      'value with spaces'
    ];
    process.argv = ['node', 'rush', 'build', '--reporter=json', ...passThroughArguments];
    let receivedArgv: string[] | undefined;
    let selection: IRushReporterSelection | undefined;

    try {
      await launchRushFrontendAsync({
        currentPackageVersion: '5.178.1',
        rushVersionToLoad: undefined,
        configuration: undefined,
        launchOptions: { isManaged: false },
        currentRushLib: rushLib,
        initializeReporterHostAsync: async (options) => {
          const initialized: IInitializedRushReporterHost = await initializeRushReporterHostAsync({
            ...options,
            argv: process.argv.slice(2),
            env: {},
            stdout: { isTTY: false, write: () => undefined },
            includeDefaultFileReporter: false
          });
          selection = initialized.selection;
          return initialized;
        },
        executeCurrentRush: (version, selectedRushLib, launchOptions) => {
          void version;
          void selectedRushLib;
          receivedArgv = [...process.argv];
          return launchOptions.reporterCloseAsync();
        },
        processLifecycle: createTestProcessLifecycle()
      });

      expect(selection).toMatchObject({
        reporter: 'json',
        logLevel: 'normal',
        commandJson: false,
        enabled: true
      });
      expect(receivedArgv).toEqual(['node', 'rush', 'build', ...passThroughArguments]);
    } finally {
      process.argv = originalArgv;
    }
  });

  it('preserves custom value parameters when repository opt-in enables reporting', async () => {
    const originalArgv: string[] = process.argv;
    process.argv = ['node', 'rush', 'custom', '--output', 'custom.zip', '--log-level', 'custom', '--verbose'];
    let receivedArgv: string[] | undefined;
    let selection: IRushReporterSelection | undefined;

    try {
      await launchRushFrontendAsync({
        currentPackageVersion: '5.178.1',
        rushVersionToLoad: undefined,
        configuration: { useRushReporter: true } as MinimalRushConfiguration,
        launchOptions: { isManaged: true },
        currentRushLib: rushLib,
        initializeReporterHostAsync: async (options) => {
          const initialized: IInitializedRushReporterHost = await initializeRushReporterHostAsync({
            ...options,
            argv: process.argv.slice(2),
            env: {},
            stdout: { isTTY: false, write: () => undefined },
            includeDefaultFileReporter: false
          });
          selection = initialized.selection;
          return initialized;
        },
        executeCurrentRush: (version, selectedRushLib, launchOptions) => {
          void version;
          void selectedRushLib;
          receivedArgv = [...process.argv];
          return launchOptions.reporterCloseAsync();
        },
        processLifecycle: createTestProcessLifecycle()
      });

      expect(selection).toMatchObject({
        reporter: 'plaintext',
        logLevel: 'verbose',
        outputs: [],
        enabled: true,
        reporterControlsOwnedByFrontend: false,
        reporterValueFlagsToStrip: []
      });
      expect(receivedArgv).toEqual(process.argv);
    } finally {
      process.argv = originalArgv;
    }
  });

  it('closes exactly once when the engine rejects', async () => {
    const closeAsync: jest.Mock<Promise<void>, [number?]> = jest.fn(async () => undefined);
    const initialized: IInitializedRushReporterHost = await createEnabledHostAsync(closeAsync);

    await expect(
      launchRushFrontendAsync({
        currentPackageVersion: '5.178.1',
        rushVersionToLoad: undefined,
        configuration: undefined,
        launchOptions: { isManaged: false },
        currentRushLib: rushLib,
        initializeReporterHostAsync: async () => initialized,
        executeCurrentRush: () => Promise.reject(new Error('engine rejected')),
        processLifecycle: createTestProcessLifecycle()
      })
    ).rejects.toThrow('engine rejected');

    expect(closeAsync).toHaveBeenCalledTimes(1);
  });

  it('closes exactly once when command selection fails', async () => {
    const order: string[] = [];
    const initialized: IInitializedRushReporterHost = await createInitializedHostAsync(order);
    const originalArgv: string[] = process.argv;
    process.argv = ['node', 'rush', 'build'];

    try {
      await expect(
        launchRushFrontendAsync({
          currentPackageVersion: '5.178.1',
          rushVersionToLoad: undefined,
          configuration: undefined,
          launchOptions: { isManaged: false },
          currentRushLib: {} as typeof import('@microsoft/rush-lib'),
          initializeReporterHostAsync: async () => initialized,
          processLifecycle: createTestProcessLifecycle()
        })
      ).rejects.toThrow('Unable to find the "Rush" entry point');

      expect(order).toEqual(['host', 'close']);
    } finally {
      process.argv = originalArgv;
    }
  });

  it('preserves the command failure when reporter close also fails', async () => {
    const initialized: IInitializedRushReporterHost = await createEnabledHostAsync(async () => {
      throw new Error('close failed');
    });
    const processLifecycle: ITestProcessLifecycle = createTestProcessLifecycle();

    await expect(
      launchRushFrontendAsync({
        currentPackageVersion: '5.178.1',
        rushVersionToLoad: undefined,
        configuration: undefined,
        launchOptions: { isManaged: false },
        currentRushLib: rushLib,
        initializeReporterHostAsync: async () => initialized,
        executeCurrentRush: () => Promise.reject(new Error('command failed')),
        processLifecycle
      })
    ).rejects.toThrow('command failed');

    expect(processLifecycle.exitCodes).toEqual([1]);
    expect(processLifecycle.closeErrors).toEqual([expect.objectContaining({ message: 'close failed' })]);
  });

  it.each(['rush', 'rushx', 'rush-pnpm'])(
    'does not install lifecycle listeners for the disabled %s path',
    async (commandName) => {
      const originalArgv: string[] = process.argv;
      process.argv = [
        'node',
        commandName,
        'custom',
        '--reporter',
        'junit',
        '--output',
        'custom.zip',
        '--log-level',
        'custom',
        '--verbose'
      ];
      const processLifecycle: ITestProcessLifecycle = createTestProcessLifecycle();
      let receivedArgv: string[] | undefined;

      try {
        await launchRushFrontendAsync({
          currentPackageVersion: '5.178.1',
          rushVersionToLoad: undefined,
          configuration: undefined,
          launchOptions: { isManaged: false },
          currentRushLib: rushLib,
          initializeReporterHostAsync: (options) =>
            initializeRushReporterHostAsync({
              ...options,
              argv: process.argv.slice(2),
              env: {},
              commandName: commandName as 'rush' | 'rushx' | 'rush-pnpm',
              stdout: { isTTY: false, write: () => undefined },
              includeDefaultFileReporter: false
            }),
          executeCurrentRush: (version, selectedRushLib, launchOptions) => {
            void version;
            void selectedRushLib;
            receivedArgv = [...process.argv];
            return launchOptions.reporterCloseAsync();
          },
          processLifecycle
        });

        expect(receivedArgv).toEqual(process.argv);
        expect(processLifecycle.beforeExitListener).toBeUndefined();
        expect(processLifecycle.signalListeners.size).toBe(0);
      } finally {
        process.argv = originalArgv;
      }
    }
  );

  it('uses a bounded close before preserving signal termination', async () => {
    let resolveClose: (() => void) | undefined;
    const closePromise: Promise<void> = new Promise((resolve: () => void) => {
      resolveClose = resolve;
    });
    const closeAsync: jest.Mock<Promise<void>, [number?]> = jest.fn(() => closePromise);
    const initialized: IInitializedRushReporterHost = await createEnabledHostAsync(closeAsync);
    const processLifecycle: ITestProcessLifecycle = createTestProcessLifecycle();

    await launchRushFrontendAsync({
      currentPackageVersion: '5.178.1',
      rushVersionToLoad: undefined,
      configuration: undefined,
      launchOptions: { isManaged: false },
      currentRushLib: rushLib,
      initializeReporterHostAsync: async () => initialized,
      executeCurrentRush: () => undefined,
      processLifecycle
    });

    processLifecycle.signalListeners.get('SIGTERM')!();
    await Promise.resolve();
    expect(closeAsync).toHaveBeenCalledTimes(1);
    expect(closeAsync).toHaveBeenCalledWith(2000);
    expect(processLifecycle.terminatedSignals).toEqual([]);

    resolveClose!();
    await closePromise;
    await new Promise<void>((resolve: () => void) => setImmediate(resolve));

    expect(processLifecycle.terminatedSignals).toEqual(['SIGTERM']);
    expect(processLifecycle.signalListeners.size).toBe(0);
    expect(processLifecycle.beforeExitListener).toBeUndefined();
  });

  it('enforces the signal deadline when a longer close is already in flight', async () => {
    jest.useFakeTimers();
    const closeAsync: jest.Mock<Promise<void>, [number?]> = jest.fn(() => new Promise<void>(() => undefined));
    const initialized: IInitializedRushReporterHost = await createEnabledHostAsync(closeAsync);
    const processLifecycle: ITestProcessLifecycle = createTestProcessLifecycle();

    try {
      await launchRushFrontendAsync({
        currentPackageVersion: '5.178.1',
        rushVersionToLoad: undefined,
        configuration: undefined,
        launchOptions: { isManaged: false },
        currentRushLib: rushLib,
        initializeReporterHostAsync: async () => initialized,
        executeCurrentRush: (version, selectedRushLib, launchOptions) => {
          void version;
          void selectedRushLib;
          void launchOptions.reporterCloseAsync();
        },
        processLifecycle
      });
      await Promise.resolve();
      expect(closeAsync).toHaveBeenCalledWith(undefined);

      processLifecycle.signalListeners.get('SIGTERM')!();
      await jest.advanceTimersByTimeAsync(1999);
      expect(processLifecycle.terminatedSignals).toEqual([]);
      await jest.advanceTimersByTimeAsync(1);

      expect(processLifecycle.terminatedSignals).toEqual(['SIGTERM']);
      expect(processLifecycle.closeErrors).toEqual([
        expect.objectContaining({ message: 'Reporter close exceeded the 2000ms signal deadline.' })
      ]);
      expect(closeAsync).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it.each(['flush', 'close'] as const)(
    'uses one signal deadline when the reporter %s phase hangs',
    async (hangingPhase) => {
      jest.useFakeTimers();
      const initialized: IInitializedRushReporterHost = await createPhaseHangingHostAsync(hangingPhase);
      const processLifecycle: ITestProcessLifecycle = createTestProcessLifecycle();

      try {
        await launchRushFrontendAsync({
          currentPackageVersion: '5.178.1',
          rushVersionToLoad: undefined,
          configuration: undefined,
          launchOptions: { isManaged: false },
          currentRushLib: rushLib,
          initializeReporterHostAsync: async () => initialized,
          executeCurrentRush: () => undefined,
          processLifecycle
        });

        processLifecycle.signalListeners.get('SIGINT')!();
        await jest.advanceTimersByTimeAsync(1999);
        expect(processLifecycle.terminatedSignals).toEqual([]);
        await jest.advanceTimersByTimeAsync(1);

        expect(processLifecycle.terminatedSignals).toEqual(['SIGINT']);
        expect(processLifecycle.closeErrors).toEqual([
          expect.objectContaining({ message: 'Reporter close exceeded the 2000ms signal deadline.' })
        ]);
      } finally {
        jest.useRealTimers();
      }
    }
  );
});
