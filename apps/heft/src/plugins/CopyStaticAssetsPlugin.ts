// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, Terminal } from '@rushstack/node-core-library';
import * as path from 'path';
import * as chokidar from 'chokidar';

import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { IBuildStageContext, ICompileSubstage } from '../stages/BuildStage';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import { CoreConfigFiles, IExtendedSharedCopyConfiguration } from '../utilities/CoreConfigFiles';
import { ITypeScriptConfigurationJson } from './TypeScriptPlugin/TypeScriptPlugin';
import { CopyFilesPlugin, ICopyFilesOptions } from './CopyFilesPlugin';

const globEscape: (unescaped: string[]) => string[] = require('glob-escape'); // No @types/glob-escape package exists

const PLUGIN_NAME: string = 'CopyStaticAssetsPlugin';

interface ICopyStaticAssetsOptions extends ICopyFilesOptions {
  watchMode: boolean;
}

export class CopyStaticAssetsPlugin extends CopyFilesPlugin {
  /**
   * @override
   */
  public readonly pluginName: string = PLUGIN_NAME;

  /**
   * @override
   */
  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileSubstage) => {
        compile.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          const logger: ScopedLogger = heftSession.requestScopedLogger('copy-static-assets');

          const copyStaticAssetsConfiguration: IExtendedSharedCopyConfiguration = await this._loadCopyStaticAssetsConfigurationAsync(
            logger.terminal,
            heftConfiguration
          );

          await this.runCopyAsync({
            logger,
            copyConfigurations: [copyStaticAssetsConfiguration],
            buildFolder: heftConfiguration.buildFolder,
            watchMode: build.properties.watchMode
          });
        });
      });
    });
  }

  private async _loadCopyStaticAssetsConfigurationAsync(
    terminal: Terminal,
    heftConfiguration: HeftConfiguration
  ): Promise<IExtendedSharedCopyConfiguration> {
    const typescriptConfiguration:
      | ITypeScriptConfigurationJson
      | undefined = await CoreConfigFiles.typeScriptConfigurationFileLoader.tryLoadConfigurationFileForProjectAsync(
      terminal,
      heftConfiguration.buildFolder,
      heftConfiguration.rigConfig
    );

    const destinationFolders: string[] = ['lib'];
    for (const emitModule of typescriptConfiguration?.additionalModuleKindsToEmit || []) {
      destinationFolders.push(emitModule.outFolderName);
    }

    return {
      ...typescriptConfiguration?.staticAssetsToCopy,

      // For now - these may need to be revised later
      sourceFolder: 'src',
      destinationFolders,
      flatten: false,
      hardlink: false
    };
  }

  /**
   * @override
   */
  protected async runCopyAsync(options: ICopyStaticAssetsOptions): Promise<void> {
    // First, run the actual copy
    await super.runCopyAsync(options);

    // Then enter watch mode if requested
    if (options.watchMode) {
      await this._runWatchAsync(options);
    }
  }

  private async _runWatchAsync(options: ICopyStaticAssetsOptions): Promise<void> {
    const { buildFolder, copyConfigurations, logger } = options;
    const [copyStaticAssetsConfiguration] = copyConfigurations;

    // Obtain the glob patterns to provide to the watcher
    const globsToWatch: string[] = [...(copyStaticAssetsConfiguration.includeGlobs || [])];
    if (copyStaticAssetsConfiguration.fileExtensions?.length) {
      const escapedExtensions: string[] = globEscape(copyStaticAssetsConfiguration.fileExtensions);
      globsToWatch.push(`**/*+(${escapedExtensions.join('|')})`);
    }

    if (globsToWatch.length) {
      const resolvedSourceFolderPath: string = path.join(
        buildFolder,
        copyStaticAssetsConfiguration.sourceFolder
      );
      const resolvedDestinationFolderPaths: string[] = copyStaticAssetsConfiguration.destinationFolders.map(
        (destinationFolder) => {
          return path.join(buildFolder, destinationFolder);
        }
      );

      const watcher: chokidar.FSWatcher = chokidar.watch(globsToWatch, {
        cwd: resolvedSourceFolderPath,
        ignoreInitial: true,
        ignored: copyStaticAssetsConfiguration.excludeGlobs
      });

      const copyAsset: (assetPath: string) => Promise<void> = async (assetPath: string) => {
        const [copyCount] = await this.copyFilesAsync(
          resolvedDestinationFolderPaths.map((resolvedDestinationFolderPath) => {
            return {
              sourceFilePath: path.join(resolvedSourceFolderPath, assetPath),
              destinationFilePath: path.join(resolvedDestinationFolderPath, assetPath),
              hardlink: false
            };
          })
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
