// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  HeftConfiguration,
  IHeftTaskPlugin,
  IHeftTaskSession,
  IHeftTaskRunHookOptions
} from '@rushstack/heft';
import { Executable, IWaitForExitResult } from '@rushstack/node-core-library';
import type { ChildProcess } from 'node:child_process';
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

const vsceBasePackagePath: string = require.resolve('@vscode/vsce/package.json');
const vsceExecName: string = require(vsceBasePackagePath).bin.vsce;
const vsceExecutable: string = path.resolve(path.dirname(vsceBasePackagePath), vsceExecName);

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

      terminal.writeLine(`Using VSCE executable: ${vsceExecutable}`);
      terminal.writeLine(`Packaging VSIX from ${unpackedDirectory} to ${vsixDirectory}`);
      const childProcess: ChildProcess = Executable.spawn(
        vsceExecutable,
        ['package', '--no-dependencies', '--out', `${path.resolve(vsixDirectory)}`],
        {
          currentWorkingDirectory: path.resolve(unpackedDirectory)
        }
      );
      const result: IWaitForExitResult<string> = await Executable.waitForExitAsync(childProcess, {
        encoding: 'utf8'
      });
      if (result.stdout) {
        terminal.writeLine(`VSCE stdout: ${result.stdout}`);
      }
      if (result.stderr) {
        terminal.writeLine(`VSCE stderr: ${result.stderr}`);
      }

      if (result.exitCode !== 0) {
        throw new Error(`VSCE packaging failed with exit code ${result.exitCode}`);
      }
      terminal.writeLine('VSIX packaged.');
    });
  }
}
