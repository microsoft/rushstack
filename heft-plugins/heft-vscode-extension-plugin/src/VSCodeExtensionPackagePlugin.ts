// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  HeftConfiguration,
  IHeftTaskPlugin,
  IHeftTaskSession,
  IHeftTaskRunHookOptions
} from '@rushstack/heft';
import { Executable } from '@rushstack/node-core-library';
import * as path from 'node:path';

interface IVSCodeExtensionPackagePluginOptions {
  /**
   * The directory where the unpacked VSIX files are located.
   * This is typically the output directory of the VSCode extension build.
   */
  unpackedDirectory: string;
  /**
   * The directory where the packaged VSIX file will be saved.
   */
  vsixDirectory: string;
}

const PLUGIN_NAME: 'vscode-extension-package-plugin' = 'vscode-extension-package-plugin';

export default class VSCodeExtensionPackagePlugin
  implements IHeftTaskPlugin<IVSCodeExtensionPackagePluginOptions>
{
  public apply(
    heftTaskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: IVSCodeExtensionPackagePluginOptions
  ): void {
    heftTaskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      const { unpackedDirectory, vsixDirectory } = pluginOptions;
      const {
        logger: { terminal }
      } = heftTaskSession;

      terminal.writeLine(`Packaging VSIX from ${unpackedDirectory} to ${vsixDirectory}`);

      Executable.spawnSync(
        'vsce',
        ['package', '--no-dependencies', '--out', `${path.resolve(vsixDirectory)}`],
        {
          currentWorkingDirectory: path.resolve(unpackedDirectory)
        }
      );
    });
  }
}
