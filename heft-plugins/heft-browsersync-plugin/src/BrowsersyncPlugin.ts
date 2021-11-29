// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminal, Import } from '@rushstack/node-core-library';
import type {
  HeftConfiguration,
  HeftSession,
  IBuildStageContext,
  IHeftPlugin,
  ScopedLogger,
  IPostBuildSubstage
} from '@rushstack/heft';

import { configurationFileLoader, IBrowsersyncConfigurationJson } from './BrowsersyncConfigLoader';

import type { BrowserSyncInstance } from 'browser-sync';

const browserSync: typeof import('browser-sync') = Import.lazy('browser-sync', require);

const PLUGIN_NAME: string = 'BrowsersyncPlugin';

interface IBrowsersyncConfigurationFileCacheEntry {
  configurationFile: IBrowsersyncConfigurationJson | undefined;
}

/**
 * @internal
 */
export class BrowsersyncPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  private _wdsConfigurationFileCache: Map<string, IBrowsersyncConfigurationFileCacheEntry> = new Map<
    string,
    IBrowsersyncConfigurationFileCacheEntry
  >();

  private _bs?: BrowserSyncInstance;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      if (!build.properties.serveMode) {
        return;
      }
      build.hooks.postBuild.tap(PLUGIN_NAME, (postBuild: IPostBuildSubstage) => {
        postBuild.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await this._runBrowsersyncAsync(heftSession, heftConfiguration);
        });
      });
    });
  }

  private async _ensureConfigFileLoadedAsync(
    terminal: ITerminal,
    heftConfiguration: HeftConfiguration
  ): Promise<IBrowsersyncConfigurationJson | undefined> {
    const buildFolder: string = heftConfiguration.buildFolder;
    return await configurationFileLoader().tryLoadConfigurationFileForProjectAsync(
      terminal,
      buildFolder,
      heftConfiguration.rigConfig
    );
  }

  private async _runBrowsersyncAsync(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration
  ): Promise<void> {
    const logger: ScopedLogger = heftSession.requestScopedLogger('browser-sync');

    logger.terminal.writeLine(`Using Browsersync version xxx`);
    const wdsConfigurationJson: IBrowsersyncConfigurationJson | undefined =
      await this._ensureConfigFileLoadedAsync(logger.terminal, heftConfiguration);
    if (!wdsConfigurationJson) {
      logger.emitError(new Error('Unable to find an wds.json config'));
      return;
    }
    const { rootDir, watch, port } = wdsConfigurationJson;
    this._bs = bs.create();
    this._bs.init({
      watch,
      server: rootDir,
      port
    });
  }
}
