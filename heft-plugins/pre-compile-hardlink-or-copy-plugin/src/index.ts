// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This Heft plugin creates a symlink before the compilation step runs.
 *
 * @packageDocumentation
 */

import * as path from 'path';
import {
  IHeftPlugin,
  HeftConfiguration,
  HeftSession,
  IBuildStageContext,
  IPreCompileSubstage
} from '@rushstack/heft';
import { JsonSchema, FileSystem, FileSystemStats } from '@rushstack/node-core-library';

const PLUGIN_NAME: string = 'PreCompileHardlinkOrCopyPlugin';

/**
 * @public
 */
export interface IPreCompileHardlinkOrCopyPluginOptions {
  linkTarget: string;
  newLinkPath: string;
  copyInsteadOfHardlink: boolean;
}

/**
 * @public
 */
export class PreCompileHardlinkOrCopyPlugin implements IHeftPlugin<IPreCompileHardlinkOrCopyPluginOptions> {
  private static __optionsSchema: JsonSchema | undefined;
  private static get _optionsSchema(): JsonSchema {
    if (!PreCompileHardlinkOrCopyPlugin.__optionsSchema) {
      PreCompileHardlinkOrCopyPlugin.__optionsSchema = JsonSchema.fromFile(
        path.resolve(__dirname, 'pre-compile-hardlink-or-copy-plugin.schema.json')
      );
    }

    return PreCompileHardlinkOrCopyPlugin.__optionsSchema;
  }

  public readonly displayName: string = PLUGIN_NAME;

  public apply(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    options?: IPreCompileHardlinkOrCopyPluginOptions
  ): void {
    if (options) {
      heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
        build.hooks.preCompile.tap(PLUGIN_NAME, (preCompile: IPreCompileSubstage) => {
          preCompile.hooks.run.tapPromise(PLUGIN_NAME, async () => {
            await this._runLinkOrCopy(heftConfiguration, options);
          });
        });
      });
    }
  }

  private async _runLinkOrCopy(
    heftConfiguration: HeftConfiguration,
    options: IPreCompileHardlinkOrCopyPluginOptions
  ): Promise<void> {
    try {
      PreCompileHardlinkOrCopyPlugin._optionsSchema.validateObject(options, 'plugins.json');
    } catch (e) {
      throw new Error(`Invalid options object: ${e}`);
    }

    const resolvedLinkPath: string = path.resolve(heftConfiguration.buildFolder, options.newLinkPath);
    const resolvedTargetPath: string = path.resolve(heftConfiguration.buildFolder, options.linkTarget);
    const linkCount: number = await this._createLinksOrCopiesRecursive(
      resolvedLinkPath,
      resolvedTargetPath,
      options.copyInsteadOfHardlink
    );
    if (options.copyInsteadOfHardlink) {
      heftConfiguration.terminal.writeLine(`Copied ${linkCount} files`);
    } else {
      heftConfiguration.terminal.writeLine(`Linked ${linkCount} files`);
    }
  }

  private async _createLinksOrCopiesRecursive(
    newLinkPath: string,
    linkTargetPath: string,
    copyInsteadOfHardlink: boolean
  ): Promise<number> {
    let linkedFileCount: number = 0;
    const targetStats: FileSystemStats = await FileSystem.getStatisticsAsync(linkTargetPath);
    if (targetStats.isDirectory()) {
      await FileSystem.ensureFolderAsync(newLinkPath);
      const folderContents: string[] = await FileSystem.readFolderAsync(linkTargetPath);
      await Promise.all(
        folderContents.map((folderElementName) => {
          return this._createLinksOrCopiesRecursive(
            path.join(newLinkPath, folderElementName),
            path.join(linkTargetPath, folderElementName),
            copyInsteadOfHardlink
          ).then((copyCount) => (linkedFileCount += copyCount));
        })
      );
    } else {
      if (copyInsteadOfHardlink) {
        await FileSystem.copyFileAsync({ sourcePath: linkTargetPath, destinationPath: newLinkPath });
      } else {
        await FileSystem.createHardLinkAsync({ newLinkPath: newLinkPath, linkTargetPath: linkTargetPath });
      }

      linkedFileCount++;
    }

    return linkedFileCount;
  }
}

export default new PreCompileHardlinkOrCopyPlugin();
