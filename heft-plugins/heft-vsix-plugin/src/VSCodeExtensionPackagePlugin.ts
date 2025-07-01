// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  HeftConfiguration,
  IHeftTaskPlugin,
  IHeftTaskSession,
  IHeftTaskRunHookOptions
} from '@rushstack/heft';
import { Executable } from '@rushstack/node-core-library';

interface IVSCodeExtensionPackagePluginOptions {}

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
      const { buildFolderPath } = heftConfiguration;

      const vsixFolderPath: string = `${buildFolderPath}/dist/vsix`;
      const vsixUnpackedFolderPath: string = `${vsixFolderPath}/unpacked`;

      heftTaskSession.logger.terminal.writeLine(
        `Packaging VSIX from ${vsixUnpackedFolderPath} to ${vsixFolderPath}`
      );

      Executable.spawnSync('vsce', ['package', '--no-dependencies', '--out', `${vsixFolderPath}`], {
        currentWorkingDirectory: vsixUnpackedFolderPath
      });
    });
  }
}
