// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { LegacyAdapters, FileSystem } from '@rushstack/node-core-library';
import * as glob from 'glob';
import * as globEscape from 'glob-escape';
import * as path from 'path';
import * as chokidar from 'chokidar';

import { Async } from '../utilities/Async';
import { performance } from 'perf_hooks';
import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';
import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { IBuildStageContext, ICompileSubstage } from '../stages/BuildStage';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import { HeftConfigFiles } from '../utilities/HeftConfigFiles';

const PLUGIN_NAME: string = 'CopyStaticAssetsPlugin';

export interface ISharedCopyStaticAssetsConfiguration {
  /**
   * File extensions that should be copied from the src folder to the destination folder(s)
   */
  fileExtensions?: string[];

  /**
   * Globs that should be explicitly excluded. This takes precedence over globs listed in "includeGlobs" and
   * files that match the file extensions provided in "fileExtensions".
   */
  excludeGlobs?: string[];

  /**
   * Globs that should be explicitly included.
   */
  includeGlobs?: string[];
}

export interface ICopyStaticAssetsConfigurationJson extends ISharedCopyStaticAssetsConfiguration {}

interface ICopyStaticAssetsConfiguration extends ISharedCopyStaticAssetsConfiguration {
  /**
   * The folder from which assets should be copied. For example, "src". This defaults to "src".
   *
   * This folder is directly under the folder containing the project's package.json file
   */
  sourceFolderName: string;

  /**
   * The folder(s) to which assets should be copied. For example ["lib", "lib-cjs"]. This defaults to ["lib"]
   *
   * These folders are directly under the folder containing the project's package.json file
   */
  destinationFolderNames: string[];
}

interface ICopyStaticAssetsOptions {
  logger: ScopedLogger;
  buildFolder: string;
  copyStaticAssetsConfiguration: ICopyStaticAssetsConfiguration;
  watchMode: boolean;
}

interface IRunWatchOptions extends ICopyStaticAssetsOptions {
  fileExtensionsGlobPattern: string | undefined;
  resolvedSourceFolderPath: string;
  resolvedDestinationFolderPaths: string[];
}

export class CopyStaticAssetsPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileSubstage) => {
        compile.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          const logger: ScopedLogger = heftSession.requestScopedLogger('copy-static-assets');

          const copyStaticAssetsConfiguration: ICopyStaticAssetsConfiguration = await this._loadCopyStaticAssetsConfigurationAsync(
            heftConfiguration.buildFolder
          );
          await this._runCopyAsync({
            logger,
            copyStaticAssetsConfiguration,
            buildFolder: heftConfiguration.buildFolder,
            watchMode: build.properties.watchMode
          });
        });
      });
    });
  }

  private async _loadCopyStaticAssetsConfigurationAsync(
    buildFolder: string
  ): Promise<ICopyStaticAssetsConfiguration> {
    let copyStaticAssetsConfigurationJson: ICopyStaticAssetsConfigurationJson | undefined;
    try {
      copyStaticAssetsConfigurationJson = await HeftConfigFiles.copyStaticAssetsConfigurationLoader.loadConfigurationFileAsync(
        path.resolve(buildFolder, '.heft', 'copy-static-assets.json')
      );
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      }
    }

    return {
      ...copyStaticAssetsConfigurationJson,

      // For now - these may need to be revised later
      sourceFolderName: 'src',
      destinationFolderNames: ['lib']
    };
  }

  private async _expandGlobPatternAsync(
    resolvedSourceFolderPath: string,
    pattern: string,
    exclude: string[] | undefined
  ): Promise<Set<string>> {
    const results: string[] = await LegacyAdapters.convertCallbackToPromise(glob, pattern, {
      cwd: resolvedSourceFolderPath,
      nodir: true,
      ignore: exclude
    });

    return new Set<string>(results);
  }

  private async _copyStaticAssetsAsync(
    assetPathsToCopy: string[],
    resolvedSourceFolderPath: string,
    resolvedDestinationFolders: string[]
  ): Promise<number> {
    if (assetPathsToCopy.length === 0) {
      return 0;
    }

    let copyCount: number = 0;
    for (const resolvedDestinationFolder of resolvedDestinationFolders) {
      await Async.forEachLimitAsync(assetPathsToCopy, 100, async (assetPath: string) => {
        await FileSystem.copyFileAsync({
          sourcePath: path.join(resolvedSourceFolderPath, assetPath),
          destinationPath: path.join(resolvedDestinationFolder, assetPath)
        });
        copyCount++;
      });
    }

    return copyCount;
  }

  private async _runCopyAsync(options: ICopyStaticAssetsOptions): Promise<void> {
    const { logger, buildFolder, copyStaticAssetsConfiguration, watchMode } = options;

    if (!copyStaticAssetsConfiguration.sourceFolderName) {
      return;
    }

    const startTime: number = performance.now();
    const resolvedSourceFolderPath: string = path.join(
      buildFolder,
      copyStaticAssetsConfiguration.sourceFolderName
    );
    const resolvedDestinationFolderPaths: string[] = copyStaticAssetsConfiguration.destinationFolderNames.map(
      (destinationFolder) => path.join(buildFolder, destinationFolder)
    );

    let fileExtensionsGlobPattern: string | undefined = undefined;
    if (copyStaticAssetsConfiguration.fileExtensions?.length) {
      const escapedExtensions: string[] = globEscape(copyStaticAssetsConfiguration.fileExtensions);
      fileExtensionsGlobPattern = `**/*+(${escapedExtensions.join('|')})`;
    }

    let assetsToCopy: Set<string>;
    if (copyStaticAssetsConfiguration.fileExtensions?.length) {
      const escapedExtensions: string[] = globEscape(copyStaticAssetsConfiguration.fileExtensions);
      const pattern: string = `**/*+(${escapedExtensions.join('|')})`;
      assetsToCopy = await this._expandGlobPatternAsync(
        resolvedSourceFolderPath,
        pattern,
        copyStaticAssetsConfiguration.excludeGlobs
      );
    } else {
      assetsToCopy = new Set<string>();
    }

    for (const include of copyStaticAssetsConfiguration.includeGlobs || []) {
      const explicitlyIncludedPaths: Set<string> = await this._expandGlobPatternAsync(
        resolvedSourceFolderPath,
        include,
        copyStaticAssetsConfiguration.excludeGlobs
      );
      for (const explicitlyIncludedPath of explicitlyIncludedPaths) {
        assetsToCopy.add(explicitlyIncludedPath);
      }
    }

    const copyCount: number = await this._copyStaticAssetsAsync(
      Array.from(assetsToCopy),
      resolvedSourceFolderPath,
      resolvedDestinationFolderPaths
    );
    const duration: number = performance.now() - startTime;
    logger.terminal.writeLine(
      `Copied ${copyCount} static asset${copyCount === 1 ? '' : 's'} in ${Math.round(duration)}ms`
    );

    if (watchMode) {
      await this._runWatchAsync({
        ...options,
        resolvedSourceFolderPath,
        resolvedDestinationFolderPaths,
        fileExtensionsGlobPattern
      });
    }
  }

  private async _runWatchAsync(options: IRunWatchOptions): Promise<void> {
    const {
      logger,
      fileExtensionsGlobPattern,
      resolvedSourceFolderPath,
      resolvedDestinationFolderPaths,
      copyStaticAssetsConfiguration
    } = options;

    if (fileExtensionsGlobPattern) {
      const watcher: chokidar.FSWatcher = chokidar.watch(
        [fileExtensionsGlobPattern, ...(copyStaticAssetsConfiguration.includeGlobs || [])],
        {
          cwd: resolvedSourceFolderPath,
          ignoreInitial: true,
          ignored: copyStaticAssetsConfiguration.excludeGlobs
        }
      );

      const copyAsset: (assetPath: string) => Promise<void> = async (assetPath: string) => {
        const copyCount: number = await this._copyStaticAssetsAsync(
          [assetPath],
          resolvedSourceFolderPath,
          resolvedDestinationFolderPaths
        );
        logger.terminal.writeLine(`Copied ${copyCount} static asset${copyCount === 1 ? '' : 's'}`);
      };

      watcher.on('add', copyAsset);
      watcher.on('change', copyAsset);
      watcher.on('unlink', (assetPath) => {
        let deleteCount: number = 0;
        for (const resolvedDestinationFolder of resolvedDestinationFolderPaths) {
          FileSystem.deleteFile(path.resolve(resolvedDestinationFolder, assetPath));
          deleteCount++;
        }
        logger.terminal.writeLine(`Deleted ${deleteCount} static asset${deleteCount === 1 ? '' : 's'}`);
      });
    }

    return new Promise(() => {
      /* never resolve */
    });
  }
}
