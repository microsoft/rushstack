// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import type { SpawnSyncReturns } from 'child_process';
import { JsonFile, JsonObject, Executable } from '@rushstack/node-core-library';

import {
  tryFindRushJsonLocation,
  RUSH_LIB_NAME,
  RushLibModuleType,
  requireRushLibUnderFolderPath,
  sdkContext
} from './helpers';

declare const global: NodeJS.Global &
  typeof globalThis & {
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
  message: string;

  /**
   * The type of message.  More message types may be added in the future.
   */
  messageType: 'info' | 'debug';
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
   * If a long-running operation is required, then `progressBarPercent` will
   * start at 0.0 and count upwards and finish at 100.0 if the operation completes
   * successfully.  If the long-running operation has not yet started, or
   * is not required, then the value will be `undefined`.
   */
  progressBarPercent: number | undefined;
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
    progressBarPercent: number | undefined
  ): void {
    if (!abortSignal.aborted) {
      return;
    }

    if (onNotifyEvent) {
      onNotifyEvent({
        logMessage: {
          messageType: 'info',
          message: `The operation was canceled`
        },
        progressBarPercent
      });
    }

    const error: Error = new Error('The operation was canceled');
    error.name = 'AbortError';
    throw error;
  }

  /**
   * Returns true if the Rush engine has already been loaded.
   */
  public static get alreadyLoaded(): boolean {
    return sdkContext.rushLibModule !== undefined;
  }

  /**
   * Manually load the Rush engine based on rush.json found for `rushJsonSearchFolder`.
   * Throws an exception if {@link RushSdkLoader.alreadyLoaded} is already `true`.
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

    if (RushSdkLoader.alreadyLoaded) {
      throw new Error('RushSdkLoader.loadAsync() failed because the Rush engine has already been loaded');
    }

    const onNotifyEvent: SdkNotifyEventCallback | undefined = options.onNotifyEvent;
    let progressBarPercent: number | undefined = undefined;

    const abortSignal: AbortSignal = options.abortSignal ?? { aborted: false };

    try {
      const rushJsonSearchFolder: string = options.rushJsonSearchFolder ?? process.cwd();

      if (onNotifyEvent) {
        onNotifyEvent({
          logMessage: {
            messageType: 'debug',
            message: `Searching for rush.json starting from: ` + rushJsonSearchFolder
          },
          progressBarPercent
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
              messageType: 'info',
              message: `Trying to load  ${RUSH_LIB_NAME} installed by install-run-rush`
            },
            progressBarPercent
          });
        }
        sdkContext.rushLibModule = requireRushLibUnderFolderPath(installRunNodeModuleFolder);
      } catch (e) {
        let installAndRunRushStderrContent: string = '';
        try {
          const installAndRunRushJSPath: string = path.join(
            monorepoRoot,
            'common/scripts/install-run-rush.js'
          );

          if (onNotifyEvent) {
            onNotifyEvent({
              logMessage: {
                messageType: 'info',
                message: 'The Rush engine has not been installed yet. Invoking install-run-rush.js...'
              },
              progressBarPercent
            });
          }

          // Start the installation
          progressBarPercent = 0;

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

          RushSdkLoader._checkForCancel(abortSignal, onNotifyEvent, progressBarPercent);

          // TODO: Implement incremental progress updates
          progressBarPercent = 90;

          // Retry to load "rush-lib" after install-run-rush run
          if (onNotifyEvent) {
            onNotifyEvent({
              logMessage: {
                messageType: 'debug',
                message: `Trying to load  ${RUSH_LIB_NAME} installed by install-run-rush a second time`
              },
              progressBarPercent
            });
          }

          sdkContext.rushLibModule = requireRushLibUnderFolderPath(installRunNodeModuleFolder);

          progressBarPercent = 100;
        } catch (e) {
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
              messageType: 'debug',
              message: `Loaded ${RUSH_LIB_NAME} installed by install-run-rush`
            },
            progressBarPercent
          });
        }
      }
    } catch (e) {
      if (onNotifyEvent) {
        onNotifyEvent({
          logMessage: {
            messageType: 'info',
            message: 'The operation failed: ' + (e.message ?? 'An unknown error occurred')
          },
          progressBarPercent
        });
      }
      throw e;
    }
  }
}
