// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { LegacyAdapters, FileSystem, Terminal } from '@rushstack/node-core-library';
import * as glob from 'glob';
import * as globEscape from 'glob-escape';
import * as path from 'path';
import * as chokidar from 'chokidar';

import { Async } from '../utilities/Async';
import { performance } from 'perf_hooks';
import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';
import { Build, HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { ICompileStage, ICopyStaticAssetsConfiguration } from '../cli/actions/BuildAction';
import { PrefixProxyTerminalProvider } from '../utilities/PrefixProxyTerminalProvider';
const PLUGIN_NAME: string = 'CopyStaticAssetsPlugin';

interface ICopyStaticAssetsOptions {
  terminal: Terminal;
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
  public readonly displayName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: Build) => {
      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileStage) => {
        compile.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          const terminal: Terminal = new Terminal(
            new PrefixProxyTerminalProvider(heftConfiguration.terminalProvider, '[copy-static-assets] ')
          );

          await this._runCopyAsync({
            terminal,
            buildFolder: heftConfiguration.buildFolder,
            copyStaticAssetsConfiguration: compile.copyStaticAssetsConfiguration,
            watchMode: build.watchMode
          });
        });
      });
    });
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
    const { terminal, buildFolder, copyStaticAssetsConfiguration, watchMode } = options;

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
        copyStaticAssetsConfiguration.exclude
      );
    } else {
      assetsToCopy = new Set<string>();
    }

    for (const include of copyStaticAssetsConfiguration.include || []) {
      const explicitlyIncludedPaths: Set<string> = await this._expandGlobPatternAsync(
        resolvedSourceFolderPath,
        include,
        copyStaticAssetsConfiguration.exclude
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
    terminal.writeLine(
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
      terminal,
      fileExtensionsGlobPattern,
      resolvedSourceFolderPath,
      resolvedDestinationFolderPaths,
      copyStaticAssetsConfiguration
    } = options;

    if (fileExtensionsGlobPattern) {
      const watcher: chokidar.FSWatcher = chokidar.watch(
        [fileExtensionsGlobPattern, ...(copyStaticAssetsConfiguration.include || [])],
        {
          cwd: resolvedSourceFolderPath,
          ignoreInitial: true,
          ignored: copyStaticAssetsConfiguration.exclude
        }
      );

      const copyAsset: (assetPath: string) => Promise<void> = async (assetPath: string) => {
        const copyCount: number = await this._copyStaticAssetsAsync(
          [assetPath],
          resolvedSourceFolderPath,
          resolvedDestinationFolderPaths
        );
        terminal.writeLine(`Copied ${copyCount} static asset${copyCount === 1 ? '' : 's'}`);
      };

      watcher.on('add', copyAsset);
      watcher.on('change', copyAsset);
      watcher.on('unlink', (assetPath) => {
        let deleteCount: number = 0;
        for (const resolvedDestinationFolder of resolvedDestinationFolderPaths) {
          FileSystem.deleteFile(path.resolve(resolvedDestinationFolder, assetPath));
          deleteCount++;
        }
        terminal.writeLine(`Deleted ${deleteCount} static asset${deleteCount === 1 ? '' : 's'}`);
      });
    }

    return new Promise(() => {
      /* never resolve */
    });
  }
}
