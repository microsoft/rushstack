// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { Compilation, Compiler, WebpackPluginInstance } from 'webpack';

import { Async } from '@rushstack/node-core-library';
import type { IScopedLogger } from '@rushstack/heft';

type ITerminal = IScopedLogger['terminal'];
type OutputFileSystem = NonNullable<Compiler['outputFileSystem']>;

const PLUGIN_NAME: 'DeleteStaleAssetsPlugin' = 'DeleteStaleAssetsPlugin';

/**
 * The stage of webpack's CleanPlugin: after the emit taps that add assets, and before webpack writes the
 * files.
 */
const EMIT_STAGE: 100 = 100;

const UNLINK_CONCURRENCY: 10 = 10;
const WEBPACK_FRAGMENT_STRIPPING_MAJOR_VERSION: 5 = 5;
const WEBPACK_FRAGMENT_STRIPPING_MINOR_VERSION: 104 = 104;

interface IAssetPaths {
  /**
   * The output paths of every asset of the compilation.
   */
  all: Set<string>;
  /**
   * The output paths that a later compilation deletes if it no longer emits them. Hot update files aren't
   * included, because a client can still request them after the next compilation.
   */
  tracked: Set<string>;
}

/**
 * In watch mode, deletes the output files that earlier compilations emitted and the current compilation
 * doesn't, such as the chunk of a dynamic import that was removed, or a file whose name contains a hash that
 * changed. Webpack's watch mode never deletes these files.
 *
 * @remarks
 * Unlike webpack's `output.clean`, this plugin deletes only files that the same compiler emitted earlier in
 * the session. Other files in the output folder, such as the outputs of other tasks, are never deleted.
 *
 * - The first compilation deletes nothing.
 * - A compilation with errors deletes nothing. The next compilation without errors deletes the files that it
 *   doesn't emit from both compilations.
 * - A compilation that emits nothing (for example, one with errors when `optimization.emitOnErrors` is false)
 *   doesn't reach this plugin, so the files on disk are still those of the previous emit.
 * - Hot update files are never deleted, because a client can still request them after the next compilation.
 * - Like `output.clean`, it never deletes a file that webpack writes outside the output folder, such as the
 *   asset `../manifest.json`. Some plugins emit such files in the first compilation only.
 * - Like `output.clean`, if a plugin emits a file in the output folder in some compilations only, a
 *   compilation that doesn't emit it deletes it.
 */
export class DeleteStaleAssetsPlugin implements WebpackPluginInstance {
  readonly #terminal: ITerminal;
  #previousAssetPaths: Set<string> | undefined;

  public constructor(terminal: ITerminal) {
    this.#terminal = terminal;
  }

  public apply(compiler: Compiler): void {
    // Delete the stale files before webpack writes the new ones. On a case-insensitive file system, a file
    // that was renamed only by case is the same file as the new one, so deleting it after the write would
    // delete the new file.
    compiler.hooks.emit.tapPromise(
      { name: PLUGIN_NAME, stage: EMIT_STAGE },
      async (compilation: Compilation): Promise<void> => {
        await this.#onEmitAsync(compiler, compilation);
      }
    );
  }

  async #onEmitAsync(compiler: Compiler, compilation: Compilation): Promise<void> {
    const outputPath: string = compilation.getPath(compiler.outputPath, {});
    const outputFileSystem: OutputFileSystem | undefined = compiler.outputFileSystem ?? undefined;
    const assetPaths: IAssetPaths = getAssetPaths(
      compilation,
      outputPath,
      outputFileSystem,
      doesWebpackStripAssetFragments(compiler.webpack.version)
    );

    const previousAssetPaths: Set<string> | undefined = this.#previousAssetPaths;
    if (!previousAssetPaths) {
      this.#previousAssetPaths = assetPaths.tracked;
      return;
    }

    if (compilation.getStats().hasErrors()) {
      for (const assetPath of assetPaths.tracked) {
        previousAssetPaths.add(assetPath);
      }
      return;
    }

    const staleAssetPaths: string[] = [];
    for (const assetPath of previousAssetPaths) {
      if (!assetPaths.all.has(assetPath)) {
        staleAssetPaths.push(assetPath);
      }
    }

    // A file that couldn't be deleted stays tracked, so that the next compilation tries again.
    const nextAssetPaths: Set<string> = assetPaths.tracked;
    this.#previousAssetPaths = nextAssetPaths;
    if (staleAssetPaths.length === 0) {
      return;
    }

    const unlink: OutputFileSystem['unlink'] = outputFileSystem?.unlink;
    if (!unlink) {
      for (const assetPath of staleAssetPaths) {
        nextAssetPaths.add(assetPath);
      }
      compilation.warnings.push(
        new compiler.webpack.WebpackError(
          `${PLUGIN_NAME}: The output file system can't delete files, so ${staleAssetPaths.length} ` +
            `file(s) that an earlier compilation emitted and this compilation doesn't were not deleted.`
        )
      );
      return;
    }

    const deletedAssetPaths: string[] = [];
    await Async.forEachAsync(
      staleAssetPaths,
      async (assetPath: string) => {
        const error: NodeJS.ErrnoException | null = await new Promise(
          (resolve: (unlinkError: NodeJS.ErrnoException | null) => void) => {
            unlink.call(outputFileSystem, assetPath, resolve);
          }
        );
        if (!error) {
          deletedAssetPaths.push(assetPath);
        } else if (error.code !== 'ENOENT') {
          nextAssetPaths.add(assetPath);
          compilation.errors.push(
            new compiler.webpack.WebpackError(
              `${PLUGIN_NAME}: Could not delete "${assetPath}", which an earlier compilation emitted and ` +
                `this compilation doesn't: ${error.message}`
            )
          );
        }
      },
      { concurrency: UNLINK_CONCURRENCY }
    );

    if (deletedAssetPaths.length > 0) {
      this.#terminal.writeLine(
        `Deleted ${deletedAssetPaths.length} output file(s) that earlier compilations emitted and ` +
          `this compilation doesn't`
      );
      for (const assetPath of deletedAssetPaths.sort()) {
        this.#terminal.writeVerboseLine(`Deleted "${assetPath}"`);
      }
    }
  }
}

/**
 * Gets the paths that webpack writes the compilation's assets to, except for the paths outside the output
 * folder.
 */
function getAssetPaths(
  compilation: Compilation,
  outputPath: string,
  outputFileSystem: OutputFileSystem | undefined,
  stripFragment: boolean
): IAssetPaths {
  // Like webpack, join with the output file system's join, or else with the path rules of the output path.
  const pathApi: path.PlatformPath = path.posix.isAbsolute(outputPath) ? path.posix : path.win32;
  const join: (path1: string, path2: string) => string = outputFileSystem?.join
    ? outputFileSystem.join.bind(outputFileSystem)
    : pathApi.join;
  const all: Set<string> = new Set();
  const tracked: Set<string> = new Set();
  for (const { name, info } of compilation.getAssets()) {
    const targetFile: string = getAssetTargetFile(name, stripFragment);
    const assetPath: string = join(outputPath, targetFile);
    // Check the path that webpack writes rather than the asset name: the file of "./../manifest.json" is
    // outside the output folder, and the file of "..json" is in it.
    if (!isInFolder(pathApi, outputPath, assetPath)) {
      continue;
    }
    all.add(assetPath);
    if (!info.hotModuleReplacement) {
      tracked.add(assetPath);
    }
  }

  return { all, tracked };
}

function getAssetTargetFile(assetName: string, stripFragment: boolean): string {
  const queryIndex: number = assetName.indexOf('?');
  const fragmentIndex: number = stripFragment ? assetName.indexOf('#') : -1;
  let separatorIndex: number = -1;
  if (queryIndex >= 0 && fragmentIndex >= 0) {
    separatorIndex = Math.min(queryIndex, fragmentIndex);
  } else if (queryIndex >= 0) {
    separatorIndex = queryIndex;
  } else {
    separatorIndex = fragmentIndex;
  }

  return separatorIndex >= 0 ? assetName.slice(0, separatorIndex) : assetName;
}

function doesWebpackStripAssetFragments(version: string | undefined): boolean {
  if (!version) {
    return true;
  }

  const dotIndex: number = version.indexOf('.');
  if (dotIndex < 0) {
    return true;
  }

  const majorVersion: number = parseInt(version, 10);
  const minorVersion: number = parseInt(version.slice(dotIndex + 1), 10);
  return (
    majorVersion > WEBPACK_FRAGMENT_STRIPPING_MAJOR_VERSION ||
    (majorVersion === WEBPACK_FRAGMENT_STRIPPING_MAJOR_VERSION &&
      minorVersion >= WEBPACK_FRAGMENT_STRIPPING_MINOR_VERSION)
  );
}

/**
 * Returns true if the path is in the folder, and isn't the folder itself.
 */
function isInFolder(pathApi: path.PlatformPath, folderPath: string, filePath: string): boolean {
  const relativePath: string = pathApi.relative(folderPath, filePath);
  // The relative path is absolute if the file is on another drive. On win32 it is also absolute if its first
  // segment is a drive, e.g. `C:\a.js` for `C:\dist\C:\a.js`.
  return (
    relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${pathApi.sep}`) &&
    !pathApi.isAbsolute(relativePath)
  );
}
