// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  HeftConfiguration,
  IHeftTaskPlugin,
  IHeftTaskSession,
  IHeftTaskRunHookOptions
} from '@rushstack/heft';
import { Executable, IExecutableSpawnOptions, IWaitForExitResult } from '@rushstack/node-core-library';
import type { ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { TerminalStreamWritable, TerminalProviderSeverity, ITerminal } from '@rushstack/terminal';

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
}

const PLUGIN_NAME: 'vscode-extension-package-plugin' = 'vscode-extension-package-plugin';

const vsceBasePackagePath: string = require.resolve('@vscode/vsce/package.json');
const vsceScript: string = path.resolve(vsceBasePackagePath, '../vsce');

async function execuateAndWaitAsync(
  terminal: ITerminal,
  command: string,
  args: string[],
  options: Omit<IExecutableSpawnOptions, 'stdio'> = {}
): Promise<IWaitForExitResult<string>> {
  const childProcess: ChildProcess = Executable.spawn(command, args, {
    ...options,
    stdio: [
      'ignore', // stdin
      'pipe', // stdout
      'pipe' // stderr
    ]
  });
  childProcess.stdout?.pipe(
    new TerminalStreamWritable({
      terminal,
      severity: TerminalProviderSeverity.log
    })
  );
  childProcess.stderr?.pipe(
    new TerminalStreamWritable({
      terminal,
      severity: TerminalProviderSeverity.error
    })
  );
  const result: IWaitForExitResult<string> = await Executable.waitForExitAsync(childProcess, {
    encoding: 'utf8'
  });
  return result;
}

export default class VSCodeExtensionPackagePlugin
  implements IHeftTaskPlugin<IVSCodeExtensionPackagePluginOptions>
{
  public apply(
    heftTaskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: IVSCodeExtensionPackagePluginOptions
  ): void {
    heftTaskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      const { unpackedFolderPath, vsixPath } = pluginOptions;
      const {
        logger: { terminal }
      } = heftTaskSession;

      terminal.writeLine(`Using VSCE script: ${vsceScript}`);
      terminal.writeLine(`Packaging VSIX from ${unpackedFolderPath} to ${vsixPath}`);

      const packageResult: IWaitForExitResult<string> = await execuateAndWaitAsync(
        terminal,
        'node',
        [vsceScript, 'package', '--no-dependencies', '--out', path.resolve(vsixPath)],
        {
          currentWorkingDirectory: path.resolve(unpackedFolderPath)
        }
      );
      if (packageResult.exitCode !== 0) {
        throw new Error(`VSIX packaging failed with exit code ${packageResult.exitCode}`);
      }

      terminal.writeLine('VSIX successfully packaged.');
    });
  }
}
