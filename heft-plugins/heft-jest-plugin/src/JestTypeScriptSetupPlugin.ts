// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  HeftConfiguration,
  IHeftTaskPlugin,
  HeftTaskSession,
  IHeftTaskRunHookOptions,
  IIHeftTaskCleanHookOptions
} from '@rushstack/heft';
import type {
  ITypeScriptConfigurationJson,
  ITypeScriptPluginAccessor
} from '@rushstack/heft-typescript-plugin';

import { HeftJestDataFile, type IHeftJestDataFileJson } from './HeftJestDataFile';

const PLUGIN_NAME: string = 'JestTypeScriptSetupPlugin';

/**
 * @internal
 */
export class JestTypeScriptSetupPlugin implements IHeftTaskPlugin {
  public readonly pluginName: string = PLUGIN_NAME;
  private _heftJestDataFileJson: IHeftJestDataFileJson | undefined;

  /**
   * Runs required setup before running Jest through the JestPlugin.
   */
  private static async _setupJestAsync(
    heftTaskSession: HeftTaskSession,
    heftConfiguration: HeftConfiguration,
    heftJestDataFileJson: IHeftJestDataFileJson
  ): Promise<void> {
    // Write the data file used by jest-build-transform
    await HeftJestDataFile.saveForProjectAsync(heftConfiguration.buildFolder, heftJestDataFileJson);
    heftTaskSession.logger.terminal.writeVerboseLine('Wrote heft-jest-data.json file');
  }

  /**
   * Setup the hooks and custom CLI options for the Jest plugin.
   *
   * @override
   */
  public apply(heftTaskSession: HeftTaskSession, heftConfiguration: HeftConfiguration): void {
    heftTaskSession.hooks.clean.tapPromise(
      PLUGIN_NAME,
      async (cleanOptions: IIHeftTaskCleanHookOptions) => {}
    );

    heftTaskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      const heftJestDataFile: IHeftJestDataFileJson = this._heftJestDataFileJson || {
        emitFolderNameForTests: 'lib',
        extensionForTests: '.js',
        // TODO: !heftConfiguration.watchMode
        skipTimestampCheck: true,
        isTypeScriptProject: false
      };
      await JestTypeScriptSetupPlugin._setupJestAsync(heftTaskSession, heftConfiguration, heftJestDataFile);
    });

    heftTaskSession.requestAccessToPluginByName(
      '@rushstack/heft-typescript-plugin',
      'TypeScriptPlugin',
      (accessor: ITypeScriptPluginAccessor) => {
        accessor.onTypeScriptConfigurationLoadedHook?.tap(
          PLUGIN_NAME,
          (configuration: ITypeScriptConfigurationJson) => {
            this._heftJestDataFileJson = {
              emitFolderNameForTests: configuration.emitFolderNameForTests || 'lib',
              extensionForTests: configuration.emitCjsExtensionForCommonJS ? '.cjs' : '.js',
              // TODO: !heftConfiguration.watchMode
              skipTimestampCheck: true,
              isTypeScriptProject: true
            };
          }
        );
      }
    );
  }
}

export default new JestTypeScriptSetupPlugin();
