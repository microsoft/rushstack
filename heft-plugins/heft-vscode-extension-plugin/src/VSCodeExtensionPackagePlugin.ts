// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type {
  HeftConfiguration,
  IHeftTaskPlugin,
  IHeftTaskSession,
  IHeftTaskRunHookOptions
} from '@rushstack/heft';
import type { IWaitForExitResult } from '@rushstack/node-core-library';

import { executeAndWaitAsync, vsceScriptPath } from './util';

interface IVSCodeExtensionPackagePluginOptions {
  /**
   * The folder where the unpacked VSIX files are located.
   * This is typically the output folder of the VSCode extension build.
   */
  unpackedFolderPath: string;
  /**
   * The path where the packaged VSIX file will be saved.
   * This can be a directory or a full vsix file path.
   * If a directory is provided, the VSIX file will be named based on the extension's `package.json` name and version.
   */
  vsixPath: string;
  /**
   * The path where the generated manifest file will be saved.
   * This manifest is used for signing the VS Code extension.
   */
  manifestPath: string;
  /**
   * Additional flags to pass to the VSCE packaging command.
   */
  extraPackagingFlags?: string[];
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
      const { unpackedFolderPath, vsixPath, manifestPath, extraPackagingFlags = [] } = pluginOptions;
      const { buildFolderPath } = heftConfiguration;
      const {
        logger: { terminal }
      } = heftTaskSession;

      terminal.writeLine(`Using VSCE script: ${vsceScriptPath}`);

      terminal.writeLine(`Packaging VSIX from ${unpackedFolderPath} to ${vsixPath}`);
      const packageResult: IWaitForExitResult<string> = await executeAndWaitAsync(
        terminal,
        'node',
        [
          vsceScriptPath,
          'package',
          '--no-dependencies',
          '--out',
          path.resolve(vsixPath),
          ...extraPackagingFlags
        ],
        {
          currentWorkingDirectory: path.resolve(buildFolderPath, unpackedFolderPath)
        }
      );
      if (packageResult.exitCode !== 0) {
        throw new Error(`VSIX packaging failed with exit code ${packageResult.exitCode}`);
      }
      terminal.writeLine('VSIX successfully packaged.');

      terminal.writeLine(`Generating manifest at ${manifestPath}`);
      const manifestResult: IWaitForExitResult<string> = await executeAndWaitAsync(
        terminal,
        'node',
        [
          vsceScriptPath,
          'generate-manifest',
          '--packagePath',
          path.resolve(vsixPath),
          '--out',
          path.resolve(manifestPath)
        ],
        {
          currentWorkingDirectory: buildFolderPath
        }
      );
      if (manifestResult.exitCode !== 0) {
        throw new Error(`Manifest generation failed with exit code ${manifestResult.exitCode}`);
      }
      terminal.writeLine('Manifest successfully generated.');

      terminal.writeLine(`VSIX package and manifest generation completed successfully.`);
    });
  }
}
