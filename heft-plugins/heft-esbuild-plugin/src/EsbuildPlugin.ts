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

import { configurationFileLoader, IEsbuildConfigurationJson } from './EsbuildConfigLoader.js';
import type { BuildFailure, BuildResult } from 'esbuild';

const esbuild: typeof import('esbuild') = Import.lazy('esbuild', require);

const PLUGIN_NAME: string = 'EsbuildPlugin';

interface IEsbuildConfigurationFileCacheEntry {
  configurationFile: IEsbuildConfigurationJson | undefined;
}

/**
 * @internal
 */
export class EsbuildPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  private _esbuildConfigurationFileCache: Map<string, IEsbuildConfigurationFileCacheEntry> = new Map<
    string,
    IEsbuildConfigurationFileCacheEntry
  >();

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    const logger: ScopedLogger = heftSession.requestScopedLogger('esbuild');
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileSubstage) => {
        compile.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
            let isFirstEmit: boolean = true;
            this._runEsbuildAsync(logger, heftConfiguration, build.properties.watchMode, () => {
              if (isFirstEmit) {
                isFirstEmit = false;
                if (build.properties.watchMode) {
                  resolve();
                }
              } else {
                compile.hooks.afterRecompile.promise().catch((error) => {
                  heftConfiguration.globalTerminal.writeErrorLine(
                    `An error occurred in an afterRecompile hook: ${error}`
                  );
                });
              }
            })
              .then(resolve)
              .catch(reject);
          });
        });
      });
    });
  }

  private async _ensureConfigFileLoadedAsync(
    terminal: ITerminal,
    heftConfiguration: HeftConfiguration
  ): Promise<IEsbuildConfigurationJson | undefined> {
    const buildFolder: string = heftConfiguration.buildFolder;

    let esbuildConfigurationFileCacheEntry: IEsbuildConfigurationFileCacheEntry | undefined =
      this._esbuildConfigurationFileCache.get(buildFolder);

    if (!esbuildConfigurationFileCacheEntry) {
      esbuildConfigurationFileCacheEntry = {
        configurationFile: await configurationFileLoader().tryLoadConfigurationFileForProjectAsync(
          terminal,
          buildFolder,
          heftConfiguration.rigConfig
        )
      };

      this._esbuildConfigurationFileCache.set(buildFolder, esbuildConfigurationFileCacheEntry);
    }

    return esbuildConfigurationFileCacheEntry.configurationFile;
  }

  private async _runEsbuildAsync(
    logger: ScopedLogger,
    heftConfiguration: HeftConfiguration,
    watchMode: boolean,
    callback: () => void
  ): Promise<void> {
    const esbuildConfigurationJson: IEsbuildConfigurationJson | undefined =
      await this._ensureConfigFileLoadedAsync(logger.terminal, heftConfiguration);
    if (!esbuildConfigurationJson) {
      throw new Error('Unable to find an esbuild.json config');
    }
    const { builds } = esbuildConfigurationJson;
    logger.terminal.writeLine(`Using Esbuild version ${esbuild.version}`);
    if (watchMode) {
      logger.terminal.writeLine('Watching files...');
    }
    const buildPromises: Promise<void>[] = builds.map(
      ({ entryPoints, outdir, outbase, bundle, target, format }): Promise<void> => {
        return esbuild
          .build({
            entryPoints: entryPoints,
            outdir: outdir,
            outbase: outbase,
            chunkNames: 'chunks/[name]',
            entryNames: '[dir]/[name]',
            bundle: bundle,
            plugins: [],
            splitting: true,
            target: target,
            format: format,
            watch: watchMode
              ? {
                  onRebuild: (error: BuildFailure | null, result: BuildResult | null): void => {
                    if (error) {
                      logger.terminal.writeError(`watch build failed: ${error}`);
                    }
                    callback();
                  }
                }
              : undefined
          })
          .then((result: BuildResult) => {
            if (!watchMode && result.stop) {
              result.stop();
            }
            callback();
          })
          .catch((err) => {
            logger.terminal.writeError('esbuild error', err);
          });
      }
    );

    await Promise.all(buildPromises);
  }
}
