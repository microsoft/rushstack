// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { LegacyAdapters, FileSystem, Terminal } from '@rushstack/node-core-library';
import * as glob from 'glob';
import * as globEscape from 'glob-escape';
import * as path from 'path';
import * as chokidar from 'chokidar';

import { Async } from '../utilities/Async';
import { performance } from 'perf_hooks';
import { IPluginPackage } from '../pluginFramework/IPluginPackage';
import { Build, HeftCompilation } from '../pluginFramework/HeftCompilation';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { ICompileStage, ICopyStaticAssetsConfiguration } from '../cli/actions/BuildAction';
import { PrefixProxyTerminalProvider } from '../utilities/PrefixProxyTerminalProvider';

const PLUGIN_NAME: string = 'CopyStaticAssetsPlugin';

export const copyStaticAssetsPlugin: IPluginPackage = {
  displayName: PLUGIN_NAME,
  apply: (heftCompilation: HeftCompilation, heftConfiguration: HeftConfiguration) => {
    heftCompilation.hooks.build.tap(PLUGIN_NAME, (build: Build) => {
      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileStage) => {
        const terminal: Terminal = new Terminal(
          new PrefixProxyTerminalProvider(heftConfiguration.terminalProvider, '[copy-static-assets] ')
        );

        compile.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          const startTime: number = performance.now();

          const configuration: ICopyStaticAssetsConfiguration = compile.copyStaticAssetsConfiguration;
          if (!configuration.sourceFolderName) {
            return;
          }
          const sourceFolderPath: string = path.join(
            heftConfiguration.buildFolder,
            configuration.sourceFolderName
          );

          async function expandGlobPattern(pattern: string): Promise<Set<string>> {
            const results: string[] = await LegacyAdapters.convertCallbackToPromise(glob, pattern, {
              cwd: sourceFolderPath,
              nodir: true,
              ignore: configuration.exclude
            });

            return new Set<string>(results);
          }

          let fileExtensionsGlobPattern: string | undefined = undefined;
          if (configuration.fileExtensions?.length) {
            const escapedExtensions: string[] = globEscape(
              compile.copyStaticAssetsConfiguration.fileExtensions
            );
            fileExtensionsGlobPattern = `**/*+(${escapedExtensions.join('|')})`;
          }

          const resolvedDestinationFolders: string[] = configuration.destinationFolderNames.map(
            (destinationFolder) => path.join(heftConfiguration.buildFolder, destinationFolder)
          );

          async function copyStaticAssetsAsync(
            assetPathsToCopy: string[],
            logDuration: boolean
          ): Promise<void> {
            if (assetPathsToCopy.length === 0) {
              return;
            }

            let copyCount: number = 0;
            for (const resolvedDestinationFolder of resolvedDestinationFolders) {
              await Async.forEachLimitAsync(assetPathsToCopy, 100, async (assetPath: string) => {
                await FileSystem.copyFileAsync({
                  sourcePath: path.join(sourceFolderPath, assetPath),
                  destinationPath: path.join(resolvedDestinationFolder, assetPath)
                });
                copyCount++;
              });
            }

            if (logDuration) {
              const duration: number = performance.now() - startTime;
              terminal.writeLine(
                `Copied ${copyCount} static asset${copyCount === 1 ? '' : 's'} in ${Math.round(duration)}ms`
              );
            } else {
              terminal.writeLine(`Copied ${copyCount} static asset${copyCount === 1 ? '' : 's'}`);
            }
          }

          let assetsToCopy: Set<string>;
          if (configuration.fileExtensions?.length) {
            const escapedExtensions: string[] = globEscape(
              compile.copyStaticAssetsConfiguration.fileExtensions
            );
            const pattern: string = `**/*+(${escapedExtensions.join('|')})`;
            assetsToCopy = await expandGlobPattern(pattern);
          } else {
            assetsToCopy = new Set<string>();
          }

          for (const include of configuration.include || []) {
            const explicitlyIncludedPaths: Set<string> = await expandGlobPattern(include);
            for (const explicitlyIncludedPath of explicitlyIncludedPaths) {
              assetsToCopy.add(explicitlyIncludedPath);
            }
          }

          await copyStaticAssetsAsync(Array.from(assetsToCopy), true);

          if (build.watchMode) {
            if (fileExtensionsGlobPattern) {
              const watcher: chokidar.FSWatcher = chokidar.watch(
                [fileExtensionsGlobPattern, ...(configuration.include || [])],
                {
                  cwd: sourceFolderPath,
                  ignoreInitial: true,
                  ignored: configuration.exclude
                }
              );

              async function copyAsset(assetPath: string): Promise<void> {
                await copyStaticAssetsAsync([assetPath], false);
              }

              watcher.on('add', copyAsset);
              watcher.on('change', copyAsset);
              watcher.on('unlink', (assetPath) => {
                let deleteCount: number = 0;
                for (const resolvedDestinationFolder of resolvedDestinationFolders) {
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
        });
      });
    });
  }
};
