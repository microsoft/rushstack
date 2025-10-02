// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="node" preserve="true" />

import * as path from 'node:path';
import type { SpawnSyncReturns } from 'node:child_process';
import { JsonFile, type JsonObject, Executable } from '@rushstack/node-core-library';

import {
  tryFindRushJsonLocation,
  RUSH_LIB_NAME,
  type RushLibModuleType,
  requireRushLibUnderFolderPath,
  sdkContext
} from './helpers';

declare const global: typeof globalThis & {
  ___rush___rushLibModule?: RushLibModuleType;
  ___rush___rushLibModuleFromEnvironment?: RushLibModuleType;
  ___rush___rushLibModuleFromInstallAndRunRush?: RushLibModuleType;
};

/**
 * Type of {@link ISdkCallbackEvent.logMessage}
 * @public
 */
export interface IProgressBarCallbackLogMessage {
  /**
   * A status message to print in the log window, or `undefined` if there are
   * no further messages.  This string may contain newlines.
   */
  text: string;

  /**
   * The type of message.  More message types may be added in the future.
   */
  kind: 'info' | 'debug';
}

/**
 * Event options for {@link ILoadSdkAsyncOptions.onNotifyEvent}
 * @public
 */
export interface ISdkCallbackEvent {
  /**
   * Allows the caller to display log information about the operation.
   */
  logMessage: IProgressBarCallbackLogMessage | undefined;

  /**
   * Allows the caller to display a progress bar for long-running operations.
   *
   * @remarks
   * If a long-running operation is required, then `progressPercent` will
   * start at 0.0 and count upwards and finish at 100.0 if the operation completes
   * successfully.  If the long-running operation has not yet started, or
   * is not required, then the value will be `undefined`.
   */
  progressPercent: number | undefined;
}

/**
 * Type of {@link ILoadSdkAsyncOptions.onNotifyEvent}
 * @public
 */
export type SdkNotifyEventCallback = (sdkEvent: ISdkCallbackEvent) => void;

/**
 * Options for {@link RushSdkLoader.loadAsync}
 * @public
 */
export interface ILoadSdkAsyncOptions {
  /**
   * The folder to start from when searching for the Rush workspace configuration.
   * If this folder does not contain a `rush.json` file, then each parent folder
   * will be searched.  If `rush.json` is not found, then the SDK fails to load.
   */
  rushJsonSearchFolder?: string;

  /**
   * A cancellation token that the caller can use to prematurely abort the operation.
   */
  abortSignal?: AbortSignal;

  /**
   * Allows the caller to monitor the progress of the operation.
   */
  onNotifyEvent?: SdkNotifyEventCallback;
}

/**
 * Exposes operations that control how the `@microsoft/rush-lib` engine is
 * located and loaded.
 * @public
 */
export class RushSdkLoader {
  /**
   * Throws an "AbortError" exception if abortSignal.aborted is true.
   */
  private static _checkForCancel(
    abortSignal: AbortSignal,
    onNotifyEvent: SdkNotifyEventCallback | undefined,
    progressPercent: number | undefined
  ): void {
    if (!abortSignal?.aborted) {
      return;
    }

    if (onNotifyEvent) {
      onNotifyEvent({
        logMessage: {
          kind: 'info',
          text: `The operation was canceled`
        },
        progressPercent
      });
    }

    const error: Error = new Error('The operation was canceled');
    error.name = 'AbortError';
    throw error;
  }

  /**
   * Returns true if the Rush engine has already been loaded.
   */
  public static get isLoaded(): boolean {
    return sdkContext.rushLibModule !== undefined;
  }

  /**
   * Manually load the Rush engine based on rush.json found for `rushJsonSearchFolder`.
   * Throws an exception if {@link RushSdkLoader.isLoaded} is already `true`.
   *
   * @remarks
   * This API supports an callback that can be used display a progress bar,
   * log of operations, and allow the operation to be canceled prematurely.
   */
  public static async loadAsync(options?: ILoadSdkAsyncOptions): Promise<void> {
    // SCENARIO 5: The rush-lib engine is loaded manually using rushSdkLoader.loadAsync().

    if (!options) {
      options = {};
    }

    if (RushSdkLoader.isLoaded) {
      throw new Error('RushSdkLoader.loadAsync() failed because the Rush engine has already been loaded');
    }

    const onNotifyEvent: SdkNotifyEventCallback | undefined = options.onNotifyEvent;
    let progressPercent: number | undefined = undefined;

    const abortSignal: AbortSignal | undefined = options.abortSignal;

    try {
      const rushJsonSearchFolder: string = options.rushJsonSearchFolder ?? process.cwd();

      if (onNotifyEvent) {
        onNotifyEvent({
          logMessage: {
            kind: 'debug',
            text: `Searching for rush.json starting from: ` + rushJsonSearchFolder
          },
          progressPercent
        });
      }

      const rushJsonPath: string | undefined = tryFindRushJsonLocation(rushJsonSearchFolder);
      if (!rushJsonPath) {
        throw new Error(
          'Unable to find rush.json in the specified folder or its parent folders:\n' +
            `${rushJsonSearchFolder}\n`
        );
      }
      const monorepoRoot: string = path.dirname(rushJsonPath);

      const rushJson: JsonObject = await JsonFile.loadAsync(rushJsonPath);
      const { rushVersion } = rushJson;

      const installRunNodeModuleFolder: string = path.join(
        monorepoRoot,
        `common/temp/install-run/@microsoft+rush@${rushVersion}`
      );

      try {
        // First, try to load the version of "rush-lib" that was installed by install-run-rush.js
        if (onNotifyEvent) {
          onNotifyEvent({
            logMessage: {
              kind: 'info',
              text: `Trying to load  ${RUSH_LIB_NAME} installed by install-run-rush`
            },
            progressPercent
          });
        }
        sdkContext.rushLibModule = requireRushLibUnderFolderPath(installRunNodeModuleFolder);
      } catch (e1) {
        let installAndRunRushStderrContent: string = '';
        try {
          const installAndRunRushJSPath: string = path.join(
            monorepoRoot,
            'common/scripts/install-run-rush.js'
          );

          if (onNotifyEvent) {
            onNotifyEvent({
              logMessage: {
                kind: 'info',
                text: 'The Rush engine has not been installed yet. Invoking install-run-rush.js...'
              },
              progressPercent
            });
          }

          // Start the installation
          progressPercent = 0;

          const installAndRunRushProcess: SpawnSyncReturns<string> = Executable.spawnSync(
            'node',
            [installAndRunRushJSPath, '--help'],
            {
              stdio: 'pipe'
            }
          );

          installAndRunRushStderrContent = installAndRunRushProcess.stderr;
          if (installAndRunRushProcess.status !== 0) {
            throw new Error(`The ${RUSH_LIB_NAME} package failed to install`);
          }

          if (abortSignal) {
            RushSdkLoader._checkForCancel(abortSignal, onNotifyEvent, progressPercent);
          }

          // TODO: Implement incremental progress updates
          progressPercent = 90;

          // Retry to load "rush-lib" after install-run-rush run
          if (onNotifyEvent) {
            onNotifyEvent({
              logMessage: {
                kind: 'debug',
                text: `Trying to load  ${RUSH_LIB_NAME} installed by install-run-rush a second time`
              },
              progressPercent
            });
          }

          sdkContext.rushLibModule = requireRushLibUnderFolderPath(installRunNodeModuleFolder);

          progressPercent = 100;
        } catch (e2) {
          // eslint-disable-next-line no-console
          console.error(`${installAndRunRushStderrContent}`);
          throw new Error(`The ${RUSH_LIB_NAME} package failed to load`);
        }
      }

      if (sdkContext.rushLibModule !== undefined) {
        // to track which scenario is active and how it got initialized.
        global.___rush___rushLibModuleFromInstallAndRunRush = sdkContext.rushLibModule;
        if (onNotifyEvent) {
          onNotifyEvent({
            logMessage: {
              kind: 'debug',
              text: `Loaded ${RUSH_LIB_NAME} installed by install-run-rush`
            },
            progressPercent
          });
        }
      }
    } catch (e) {
      if (onNotifyEvent) {
        onNotifyEvent({
          logMessage: {
            kind: 'info',
            text: 'The operation failed: ' + (e.message ?? 'An unknown error occurred')
          },
          progressPercent
        });
      }
      throw e;
    }
  }
}
