// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { randomUUID } from 'node:crypto';

import type { ILaunchOptions } from '@microsoft/rush-lib';
import {
  DEFAULT_SIGNAL_FLUSH_TIMEOUT_MS,
  REPORTER_PROTOCOL_VERSION
} from '@rushstack/rush-reporter';

import {
  initializeRushReporterHostAsync,
  stripReporterValueControls,
  type IRushReporterHostOptions,
  type IInitializedRushReporterHost
} from './RushReporterHost';
import { RushCommandSelector } from './RushCommandSelector';
import { RushVersionSelector } from './RushVersionSelector';
import type { MinimalRushConfiguration } from './MinimalRushConfiguration';
import type { IRushFrontendLaunchOptions } from './IRushFrontendLaunchOptions';

export interface IRushFrontendOptions {
  readonly currentPackageVersion: string;
  readonly rushVersionToLoad: string | undefined;
  readonly configuration: MinimalRushConfiguration | undefined;
  readonly launchOptions: ILaunchOptions;
  readonly currentRushLib: typeof import('@microsoft/rush-lib');
  readonly initializeReporterHostAsync?: (
    options: IRushReporterHostOptions
  ) => Promise<IInitializedRushReporterHost>;
  readonly createVersionSelector?: (currentPackageVersion: string) => RushVersionSelector;
  readonly executeCurrentRush?: (
    currentPackageVersion: string,
    currentRushLib: typeof import('@microsoft/rush-lib'),
    launchOptions: IRushFrontendLaunchOptions
  ) => void | Promise<void>;
  readonly createSessionId?: () => string;
  readonly processLifecycle?: IRushFrontendProcessLifecycle;
}

type RushTerminationSignal = 'SIGINT' | 'SIGTERM';

export interface IRushFrontendProcessLifecycle {
  registerBeforeExit(listener: () => void): () => void;
  registerSignal(signal: RushTerminationSignal, listener: () => void): () => void;
  terminate(signal: RushTerminationSignal): void;
  setExitCode(exitCode: number): void;
  reportCloseError(error: Error): void;
}

class RushFrontendReporterLifecycle {
  private readonly _reporterHost: IInitializedRushReporterHost;
  private readonly _processLifecycle: IRushFrontendProcessLifecycle;
  private _disposeBeforeExit: (() => void) | undefined;
  private readonly _disposeSignalHandlers: Array<() => void> = [];
  private _closePromise: Promise<void> | undefined;

  public constructor(
    reporterHost: IInitializedRushReporterHost,
    processLifecycle: IRushFrontendProcessLifecycle
  ) {
    this._reporterHost = reporterHost;
    this._processLifecycle = processLifecycle;
  }

  public start(): void {
    this._disposeBeforeExit = this._processLifecycle.registerBeforeExit(() => {
      void this.closeAsync().catch((error: Error) => {
        this._processLifecycle.reportCloseError(error);
        this._processLifecycle.setExitCode(1);
      });
    });
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      this._disposeSignalHandlers.push(
        this._processLifecycle.registerSignal(signal, () => {
          this._disposeSignals();
          void this._closeForSignalAsync(signal);
        })
      );
    }
  }

  public closeAsync(timeoutMs?: number): Promise<void> {
    if (!this._closePromise) {
      this._closePromise = Promise.resolve()
        .then(() => this._reporterHost.closeAsync(timeoutMs))
        .finally(() => this._dispose());
    }
    return this._closePromise;
  }

  private _dispose(): void {
    this._disposeBeforeExit?.();
    this._disposeBeforeExit = undefined;
    this._disposeSignals();
  }

  private _disposeSignals(): void {
    for (const dispose of this._disposeSignalHandlers.splice(0)) {
      dispose();
    }
  }

  private async _closeForSignalAsync(signal: RushTerminationSignal): Promise<void> {
    const closeResult: Promise<Error | undefined> = this.closeAsync(DEFAULT_SIGNAL_FLUSH_TIMEOUT_MS).then(
      () => undefined,
      (error: Error) => error
    );
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline: Promise<'deadline'> = new Promise((resolve: (value: 'deadline') => void) => {
      timeout = setTimeout(() => resolve('deadline'), DEFAULT_SIGNAL_FLUSH_TIMEOUT_MS);
    });

    const result: Error | 'deadline' | undefined = await Promise.race([closeResult, deadline]);
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    if (result === 'deadline') {
      this._processLifecycle.reportCloseError(
        new Error(`Reporter close exceeded the ${DEFAULT_SIGNAL_FLUSH_TIMEOUT_MS}ms signal deadline.`)
      );
    } else if (result) {
      this._processLifecycle.reportCloseError(result);
    }
    this._dispose();
    this._processLifecycle.terminate(signal);
  }
}

export async function launchRushFrontendAsync(options: IRushFrontendOptions): Promise<void> {
  const {
    currentPackageVersion,
    rushVersionToLoad,
    configuration,
    launchOptions,
    currentRushLib,
    initializeReporterHostAsync = initializeRushReporterHostAsync,
    createVersionSelector = (version: string) => new RushVersionSelector(version),
    executeCurrentRush = RushCommandSelector.execute,
    createSessionId = randomUUID,
    processLifecycle = createProcessLifecycle()
  } = options;

  const engineArgv: string[] = stripReporterValueControls(process.argv.slice(2));
  const reporterHost: IInitializedRushReporterHost = await initializeReporterHostAsync({
    repositoryOptIn: configuration?.useRushReporter,
    forceLegacy: rushVersionToLoad !== undefined && rushVersionToLoad !== currentPackageVersion,
    selectedRushVersion: rushVersionToLoad,
    commonTempFolder: configuration?.commonTempFolder,
    actionName: engineArgv.find((argument: string) => !argument.startsWith('-'))
  });
  const reporterLifecycle: RushFrontendReporterLifecycle | undefined = reporterHost.selection.enabled
    ? new RushFrontendReporterLifecycle(reporterHost, processLifecycle)
    : undefined;
  reporterLifecycle?.start();
  if (reporterHost.selection.reporterControlsOwnedByFrontend) {
    process.argv = stripReporterValueControls(
      process.argv,
      new Set(reporterHost.selection.reporterValueFlagsToStrip)
    );
  }
  const reporterCloseAsync: () => Promise<void> = () =>
    reporterLifecycle?.closeAsync() ?? reporterHost.closeAsync();
  const sessionId: string = createSessionId();
  if (reporterHost.selection.enabled && reporterHost.logArtifact?.path) {
    reporterHost.sink.emit({
      protocolVersion: REPORTER_PROTOCOL_VERSION,
      sessionId,
      source: { packageName: '@microsoft/rush', packageVersion: currentPackageVersion },
      privacy: 'local-sensitive',
      type: 'artifactAvailable',
      payload: {
        role: 'log',
        path: reporterHost.logArtifact.path,
        format: 'plaintext',
        complete: false
      }
    });
  }
  const reporterLaunchOptions: IRushFrontendLaunchOptions = {
    ...launchOptions,
    reporter: {
      eventSink: reporterHost.sink,
      sessionId,
      operationStreamEnabled: reporterHost.selection.enabled
    },
    reporterCloseAsync
  };

  try {
    if (rushVersionToLoad && rushVersionToLoad !== currentPackageVersion) {
      const versionSelector: RushVersionSelector = createVersionSelector(currentPackageVersion);
      await versionSelector.ensureRushVersionInstalledAsync(
        rushVersionToLoad,
        configuration,
        reporterLaunchOptions
      );
    } else {
      await executeCurrentRush(currentPackageVersion, currentRushLib, reporterLaunchOptions);
    }
  } catch (error) {
    try {
      await reporterCloseAsync();
    } catch (closeError) {
      processLifecycle.reportCloseError(closeError as Error);
      processLifecycle.setExitCode(1);
    }
    throw error;
  }
}

function createProcessLifecycle(): IRushFrontendProcessLifecycle {
  return {
    registerBeforeExit: (listener: () => void) => {
      process.once('beforeExit', listener);
      return () => process.off('beforeExit', listener);
    },
    registerSignal: (signal: RushTerminationSignal, listener: () => void) => {
      process.once(signal, listener);
      return () => process.off(signal, listener);
    },
    terminate: (signal: RushTerminationSignal) => {
      process.kill(process.pid, signal);
    },
    setExitCode: (exitCode: number) => {
      process.exitCode = exitCode;
    },
    reportCloseError: (error: Error) => {
      process.stderr.write(`[reporter] Unable to finalize reporters: ${error.message}\n`);
    }
  };
}
