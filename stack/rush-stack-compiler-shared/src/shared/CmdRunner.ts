// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'child_process';
import * as path from 'path';

import { IPackageJson, FileSystem, Terminal } from '@rushstack/node-core-library';
import { StandardBuildFolders } from './StandardBuildFolders';

/**
 * Options for a CmdTask.
 * @beta
 */
export interface IBaseTaskOptions {
  /**
   * The name of the package to resolve.
   */
  packagePath: string;

  /**
   *
   */
  packageJson: IPackageJson;

  /**
   * The path to the binary to invoke inside the package.
   */
  packageBinPath: string;
}

/**
 * @beta
 */
export interface IRunCmdOptions {
  args: string[];
  onData?: (data: Buffer) => void;
  onError?: (data: Buffer) => void;
  onClose?: (code: number, hasErrors: boolean, resolve: () => void, reject: (error: Error) => void) => void;
}

/**
 * This base task provides support for finding and then executing a binary in a node package.
 *
 * @beta
 */
export class CmdRunner {
  private static readonly _nodePath: string = process.execPath;

  private _standardBuildFolders: StandardBuildFolders;
  private _terminal: Terminal;
  private _options: IBaseTaskOptions;
  private _errorHasBeenLogged: boolean;

  public constructor(constants: StandardBuildFolders, terminal: Terminal, options: IBaseTaskOptions) {
    this._standardBuildFolders = constants;
    this._terminal = terminal;
    this._options = options;
  }

  public runCmd(options: IRunCmdOptions): Promise<void> {
    const {
      args,
      onData = this._onData.bind(this),
      onError = this._onError.bind(this),
      onClose = this._onClose.bind(this),
    }: IRunCmdOptions = options;

    const packageJson: IPackageJson | undefined = this._options.packageJson;

    if (!packageJson) {
      return Promise.reject(new Error(`Unable to find the package.json file for ${this._options}.`));
    }

    // Print the version
    this._terminal.writeLine(`${packageJson.name} version: ${packageJson.version}`);

    const binaryPath: string = path.resolve(this._options.packagePath, this._options.packageBinPath);
    if (!FileSystem.exists(binaryPath)) {
      return Promise.reject(
        new Error(
          `The binary is missing. This indicates that ${this._options.packageBinPath} is not ` +
            'installed correctly.'
        )
      );
    }

    return new Promise((resolve: () => void, reject: (error: Error) => void) => {
      const nodePath: string | undefined = CmdRunner._nodePath;
      if (!nodePath) {
        reject(new Error('Unable to find node executable'));
        return;
      }

      // Invoke the tool and watch for log messages
      const spawnResult: childProcess.ChildProcess = childProcess.spawn(nodePath, [binaryPath, ...args], {
        cwd: this._standardBuildFolders.projectFolderPath,
        env: process.env,
        stdio: 'pipe',
      });

      if (spawnResult.stdout !== null) {
        spawnResult.stdout.on('data', onData);
      }
      if (spawnResult.stderr !== null) {
        spawnResult.stderr.on('data', (data: Buffer) => {
          this._errorHasBeenLogged = true;
          onError(data);
        });
      }
      spawnResult.on('close', (code) => onClose(code, this._errorHasBeenLogged, resolve, reject));
    });
  }

  protected _onData(data: Buffer): void {
    this._terminal.writeLine(data.toString().trim());
  }

  protected _onError(data: Buffer): void {
    this._terminal.writeError(data.toString().trim());
  }

  protected _onClose(
    code: number,
    hasErrors: boolean,
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    if (code !== 0 || hasErrors) {
      reject(new Error(`exited with code ${code}`));
    } else {
      resolve();
    }
  }
}
