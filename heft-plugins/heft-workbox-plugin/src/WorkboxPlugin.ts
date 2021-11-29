// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminal, Import, FileSystem } from '@rushstack/node-core-library';
import type {
  HeftConfiguration,
  HeftSession,
  ICompileSubstage,
  IBuildStageContext,
  IHeftPlugin,
  ScopedLogger
} from '@rushstack/heft';

import { configurationFileLoader, IWorkboxConfigurationJson } from './WorkboxConfigLoader';

const workboxBuild: typeof import('workbox-build') = Import.lazy('workbox-build', require);

const PLUGIN_NAME: string = 'WorkboxPlugin';

/**
 * @internal
 */
export class WorkboxPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  private _logger!: ScopedLogger;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    this._logger = heftSession.requestScopedLogger('workbox');
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileSubstage) => {
        compile.hooks.afterCompile.tapPromise(PLUGIN_NAME, async () => {
          await this._runWorkboxAsync(heftConfiguration, build.properties.production);
        });
        compile.hooks.afterRecompile.tapPromise(PLUGIN_NAME, async () => {
          await this._runWorkboxAsync(heftConfiguration, build.properties.production);
        });
      });
    });
  }

  private async _ensureConfigFileLoadedAsync(
    terminal: ITerminal,
    heftConfiguration: HeftConfiguration
  ): Promise<IWorkboxConfigurationJson | undefined> {
    const buildFolder: string = heftConfiguration.buildFolder;
    return await configurationFileLoader().tryLoadConfigurationFileForProjectAsync(
      terminal,
      buildFolder,
      heftConfiguration.rigConfig
    );
  }

  private async _runWorkboxAsync(heftConfiguration: HeftConfiguration, isProduction: boolean): Promise<void> {
    const workboxConfigurationJson: IWorkboxConfigurationJson | undefined =
      await this._ensureConfigFileLoadedAsync(this._logger.terminal, heftConfiguration);
    if (!workboxConfigurationJson) {
      this._logger.emitError(new Error('Unable to find an workbox.json config'));
      return;
    }
    const {
      serviceWorkerSourcePath,
      serviceWorkerOutputPath,
      globDirectory,
      globPatterns,
      globIgnores,
      modifyURLPrefix
    } = workboxConfigurationJson;

    // just copy sw file into dest if not in production
    if (!isProduction) {
      this._logger.terminal.writeLine(
        `Development build, copying ${serviceWorkerSourcePath} to ${serviceWorkerOutputPath} without transform.`
      );
      return FileSystem.copyFileAsync({
        sourcePath: serviceWorkerSourcePath,
        destinationPath: serviceWorkerOutputPath
      });
    }

    this._logger.terminal.writeLine(
      `Injecting manifest in ${serviceWorkerSourcePath}, writing to ${serviceWorkerOutputPath}.`
    );
    const { count, size } = await workboxBuild.injectManifest({
      swSrc: serviceWorkerSourcePath,
      swDest: serviceWorkerOutputPath,
      globDirectory,
      globPatterns,
      globIgnores,
      modifyURLPrefix
    });
    this._logger.terminal.writeLine(
      `Generated ${serviceWorkerOutputPath}, which will precache ${count} files, totaling ${size} bytes.`
    );
  }
}
