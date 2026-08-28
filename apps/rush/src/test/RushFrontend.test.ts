// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import * as rushLib from '@microsoft/rush-lib';
import { ReporterHost, type IReporterEventSink } from '@rushstack/rush-reporter';

import { launchRushFrontendAsync, type IRushFrontendProcessLifecycle } from '../RushFrontend';
import {
  initializeRushReporterHostAsync,
  type IInitializedRushReporterHost,
  type IRushReporterSelection
} from '../RushReporterHost';
import { RushVersionSelector } from '../RushVersionSelector';

async function createInitializedHostAsync(
  order: string[],
  reason: IInitializedRushReporterHost['selection']['reason'] = 'pre-major legacy default'
): Promise<IInitializedRushReporterHost> {
  order.push('host');
  const host: ReporterHost = new ReporterHost({ env: {} });
  await host.manager.initializeAsync();
  let closePromise: Promise<void> | undefined;
  return {
    host,
    sink: host.getSink(),
    selection: {
      reporter: 'legacy',
      logLevel: 'normal',
      outputs: [],
      commandJson: false,
      enabled: false,
      reporterControlsOwnedByFrontend: true,
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
  it('creates the authoritative host before invoking the bundled rush-lib and passes only its sink', async () => {
    const order: string[] = [];
    let receivedOptions: Record<string, unknown> | undefined;
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
          receivedOptions = launchOptions as unknown as Record<string, unknown>;
          return launchOptions.reporterCloseAsync();
        },
        processLifecycle
      });

      expect(order).toEqual(['host', 'engine', 'close']);
      expect(process.argv).toEqual(['node', 'rush', 'build', '--json']);
      expect(receivedOptions?.reporterEventSink).toEqual(
        expect.objectContaining({ emit: expect.any(Function) }) as IReporterEventSink
      );
      expect(receivedOptions).not.toHaveProperty('selection');
      expect(receivedOptions).not.toHaveProperty('host');
      expect(receivedOptions).not.toHaveProperty('manager');
      expect(processLifecycle.beforeExitListener).toBeUndefined();
      expect(processLifecycle.signalListeners.size).toBe(0);
    } finally {
      process.argv = originalArgv;
    }
  });

  it('creates the host before selecting and installing a repository Rush version', async () => {
    const order: string[] = [];
    let receivedSink: IReporterEventSink | undefined;
    const processLifecycle: ITestProcessLifecycle = createTestProcessLifecycle();
    const versionSelector: RushVersionSelector = Object.create(RushVersionSelector.prototype);
    versionSelector.ensureRushVersionInstalledAsync = async (version, configuration, launchOptions) => {
      void version;
      void configuration;
      order.push('version-selection');
      receivedSink = (launchOptions as unknown as { reporterEventSink?: IReporterEventSink })
        .reporterEventSink;
      await launchOptions.reporterCloseAsync();
    };

    const originalArgv: string[] = process.argv;
    process.argv = ['node', 'rush', 'build', '--reporter=json', '--log-level=debug'];

    try {
      await launchRushFrontendAsync({
        currentPackageVersion: '5.178.1',
        rushVersionToLoad: '5.177.0',
        configuration: undefined,
        launchOptions: { isManaged: true },
        currentRushLib: rushLib,
        initializeReporterHostAsync: async () => {
          const initialized: IInitializedRushReporterHost = await createInitializedHostAsync(order);
          return {
            ...initialized,
            selection: {
              ...initialized.selection,
              reporter: 'json',
              logLevel: 'debug',
              enabled: true,
              reason: 'explicit --reporter'
            }
          };
        },
        createVersionSelector: () => versionSelector,
        processLifecycle
      });

      expect(order).toEqual(['host', 'version-selection', 'close']);
      expect(process.argv).toEqual(['node', 'rush', 'build']);
      expect(receivedSink).toEqual(expect.objectContaining({ emit: expect.any(Function) }));
    } finally {
      process.argv = originalArgv;
    }
  });

  it('uses beforeExit to close when an older engine ignores the optional close callback', async () => {
    const order: string[] = [];
    const processLifecycle: ITestProcessLifecycle = createTestProcessLifecycle();
    const versionSelector: RushVersionSelector = Object.create(RushVersionSelector.prototype);
    versionSelector.ensureRushVersionInstalledAsync = async () => {
      order.push('legacy-engine');
    };

    await launchRushFrontendAsync({
      currentPackageVersion: '5.178.1',
      rushVersionToLoad: '5.177.0',
      configuration: undefined,
      launchOptions: { isManaged: true },
      currentRushLib: rushLib,
      initializeReporterHostAsync: () => createInitializedHostAsync(order),
      createVersionSelector: () => versionSelector,
      processLifecycle
    });

    expect(order).toEqual(['host', 'legacy-engine']);
    processLifecycle.beforeExitListener!();
    await new Promise<void>((resolve: () => void) => setImmediate(resolve));

    expect(order).toEqual(['host', 'legacy-engine', 'close']);
    expect(processLifecycle.beforeExitListener).toBeUndefined();
    expect(processLifecycle.signalListeners.size).toBe(0);
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
          emitCommandStarted(launchOptions.reporterEventSink);
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

  it('closes exactly once when the engine rejects', async () => {
    const order: string[] = [];
    const initialized: IInitializedRushReporterHost = await createInitializedHostAsync(order);

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

    expect(order).toEqual(['host', 'close']);
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

  it('uses a bounded close before preserving signal termination', async () => {
    let resolveClose: (() => void) | undefined;
    const closePromise: Promise<void> = new Promise((resolve: () => void) => {
      resolveClose = resolve;
    });
    const closeAsync: jest.Mock<Promise<void>, [number?]> = jest.fn(() => closePromise);
    const host: ReporterHost = new ReporterHost({ env: {} });
    await host.manager.initializeAsync();
    const initialized: IInitializedRushReporterHost = {
      host,
      sink: host.getSink(),
      selection: {
        reporter: 'legacy',
        logLevel: 'normal',
        outputs: [],
        commandJson: false,
        enabled: false,
        reporterControlsOwnedByFrontend: true,
        reason: 'pre-major legacy default'
      },
      closeAsync
    };
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
});
