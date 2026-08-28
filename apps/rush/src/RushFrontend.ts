// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ILaunchOptions } from '@microsoft/rush-lib';
import { DEFAULT_SIGNAL_FLUSH_TIMEOUT_MS } from '@rushstack/rush-reporter';

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
          void this.closeAsync(DEFAULT_SIGNAL_FLUSH_TIMEOUT_MS)
            .catch((error: Error) => {
              this._processLifecycle.reportCloseError(error);
            })
            .finally(() => {
              this._processLifecycle.terminate(signal);
            });
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
    processLifecycle = createProcessLifecycle()
  } = options;

  const reporterHost: IInitializedRushReporterHost = await initializeReporterHostAsync({
    repositoryOptIn: configuration?.useRushReporter
  });
  const reporterLifecycle: RushFrontendReporterLifecycle = new RushFrontendReporterLifecycle(
    reporterHost,
    processLifecycle
  );
  reporterLifecycle.start();
  if (reporterHost.selection.reporterControlsOwnedByFrontend) {
    process.argv = stripReporterValueControls(process.argv);
  }
  const reporterLaunchOptions: IRushFrontendLaunchOptions = {
    ...launchOptions,
    reporterEventSink: reporterHost.sink,
    reporterCloseAsync: () => reporterLifecycle.closeAsync()
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
      await reporterLifecycle.closeAsync();
    } catch (closeError) {
      throw new AggregateError([error, closeError], 'Rush failed and the reporter host could not close.');
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
