// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminal, Import } from '@rushstack/node-core-library';
import type {
  HeftConfiguration,
  HeftSession,
  ICompileSubstage,
  IBuildStageContext,
  IHeftPlugin,
  ScopedLogger
} from '@rushstack/heft';

import { configurationFileLoader, IWorkboxConfigurationJson } from './WorkboxConfigLoader.js';

import { copyFile } from 'fs';

const workboxBuild: typeof import('workbox-build') = Import.lazy('workbox-build', require);

const PLUGIN_NAME: string = 'WorkboxPlugin';

interface IWorkboxConfigurationFileCacheEntry {
  configurationFile: IWorkboxConfigurationJson | undefined;
}

/**
 * @internal
 */
export class WorkboxPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  private _workboxConfigurationFileCache: Map<string, IWorkboxConfigurationFileCacheEntry> = new Map<
    string,
    IWorkboxConfigurationFileCacheEntry
  >();

  private _logger!: ScopedLogger;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    this._logger = heftSession.requestScopedLogger('workbox');
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileSubstage) => {
        compile.hooks.afterCompile.tapPromise(PLUGIN_NAME, async () => {
          await this._runWorkboxAsync(heftSession, heftConfiguration, build.properties.production);
        });
        compile.hooks.afterRecompile.tapPromise(PLUGIN_NAME, async () => {
          await this._runWorkboxAsync(heftSession, heftConfiguration, build.properties.production);
        });
      });
    });
  }

  private async _ensureConfigFileLoadedAsync(
    terminal: ITerminal,
    heftConfiguration: HeftConfiguration
  ): Promise<IWorkboxConfigurationJson | undefined> {
    const buildFolder: string = heftConfiguration.buildFolder;

    let workboxConfigurationFileCacheEntry: IWorkboxConfigurationFileCacheEntry | undefined =
      this._workboxConfigurationFileCache.get(buildFolder);

    if (!workboxConfigurationFileCacheEntry) {
      workboxConfigurationFileCacheEntry = {
        configurationFile: await configurationFileLoader().tryLoadConfigurationFileForProjectAsync(
          terminal,
          buildFolder,
          heftConfiguration.rigConfig
        )
      };

      this._workboxConfigurationFileCache.set(buildFolder, workboxConfigurationFileCacheEntry);
    }

    return workboxConfigurationFileCacheEntry.configurationFile;
  }

  private async _runWorkboxAsync(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    isProduction: boolean
  ): Promise<void> {
    const workboxConfigurationJson: IWorkboxConfigurationJson | undefined =
      await this._ensureConfigFileLoadedAsync(this._logger.terminal, heftConfiguration);
    if (!workboxConfigurationJson) {
      throw new Error('Unable to find an workbox.json config');
    }
    const { swSrc, swDest, globDirectory, globPatterns, globIgnores, modifyURLPrefix } =
      workboxConfigurationJson;

    // just copy sw file into dest if not in production
    if (!isProduction) {
      this._logger.terminal.writeLine(`Development build, copying ${swSrc} to ${swDest} without transform.`);
      await FileSystem.copyFileAsync({ source: swSrc, target: swDest });
    }

    this._logger.terminal.writeLine(`Injecting manifest in ${swSrc}, writing to ${swDest}.`);
    return workboxBuild
      .injectManifest({
        swSrc,
        swDest,
        globDirectory,
        globPatterns,
        globIgnores,
        modifyURLPrefix
      })
      .then(({ count, size }) => {
        this._logger.terminal.writeLine(
          `Generated ${swDest}, which will precache ${count} files, totaling ${size} bytes.`
        );
      });
  }
}
