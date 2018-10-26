// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'child_process';
import * as path from 'path';
import * as os from 'os';

import {
  IPackageJson,
  FileSystem,
  Terminal
} from '@microsoft/node-core-library';
import { Constants } from './Constants';

/**
 * @beta
 */
export interface IBaseCmdTaskOptions {
  /**
   * Optional list of custom args to pass to the tool
   */
  customArgs?: string[];
}

/**
 * Options for a CmdTask.
 * @beta
 */
export interface IBaseTaskOptions<TTaskConfig> {
    /**
   * The initial config of the task.
   */
  taskOptions: TTaskConfig;

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
export class CmdRunner<TTaskConfig extends IBaseCmdTaskOptions> {
  private static __nodePath: string | undefined; // tslint:disable-line:variable-name
  private static get _nodePath(): string | undefined {
    if (!CmdRunner.__nodePath) {
      try {
        if (os.platform() === 'win32') {
          // We're on Windows
          const whereOutput: string = childProcess.execSync('where node', { stdio: [] }).toString();
          const lines: string[] = whereOutput.split(os.EOL).filter((line) => !!line);

          // take the first result, see https://github.com/Microsoft/web-build-tools/issues/759
          CmdRunner.__nodePath = lines[0];
        } else {
          // We aren't on Windows - assume we're on *NIX or Darwin
          CmdRunner.__nodePath = childProcess.execSync('which node', { stdio: [] }).toString();
        }
      } catch (e) {
        return undefined;
      }

      CmdRunner.__nodePath = CmdRunner.__nodePath.trim();
      if (!FileSystem.exists(CmdRunner.__nodePath)) {
        return undefined;
      }
    }

    return CmdRunner.__nodePath;
  }

  private _constants: Constants;
  private _terminal: Terminal;
  private _options: IBaseTaskOptions<TTaskConfig>;
  private _errorHasBeenLogged: boolean;

  constructor(
    constants: Constants,
    terminal: Terminal,
    options: IBaseTaskOptions<TTaskConfig>
  ) {
    this._constants = constants;
    this._terminal = terminal;
    this._options = options;
  }

  public runCmd(options: IRunCmdOptions): Promise<void> {
    const {
      args,
      onData = this._onData.bind(this),
      onError = this._onError.bind(this),
      onClose = this._onClose.bind(this)
    }: IRunCmdOptions = options;

    const packageJson: IPackageJson | undefined = this._options.packageJson;

    if (!packageJson) {
      return Promise.reject(new Error(`Unable to find the package.json file for ${this._options}.`));
    }

    // Print the version
    this._terminal.writeLine(`${this._options} version: ${packageJson.version}`);

    const binaryPath: string = path.resolve(this._options.packagePath, this._options.packageBinPath);
    if (!FileSystem.exists(binaryPath)) {
      return Promise.reject(new Error(
        `The binary is missing. This indicates that ${this._options} is not ` +
        'installed correctly.'
      ));
    }

    return new Promise((resolve: () => void, reject: (error: Error) => void) => {
      const nodePath: string | undefined = CmdRunner._nodePath;
      if (!nodePath) {
        reject(new Error('Unable to find node executable'));
        return;
      }

      // Invoke the tool and watch for log messages
      const spawnResult: childProcess.ChildProcess = childProcess.spawn(
        nodePath,
        [binaryPath, ...args],
        {
          cwd: this._constants.projectFolderPath,
          env: process.env,
          stdio: 'pipe'
        }
      );

      spawnResult.stdout.on('data', onData);
      spawnResult.stderr.on('data', (data: Buffer) => {
        this._errorHasBeenLogged = true;
        onError(data);
      });

      spawnResult.on('close', (code) => onClose(code, this._errorHasBeenLogged, resolve, reject));
    });
  }

  protected _onData(data: Buffer): void {
    this._terminal.writeLine(data.toString().trim());
  }

  protected _onError(data: Buffer): void {
    this._terminal.writeError(data.toString().trim());
  }

  protected _onClose(code: number, hasErrors: boolean, resolve: () => void, reject: (error: Error) => void): void {
    if (code !== 0 || hasErrors) {
      reject(new Error(`exited with code ${code}`));
    } else {
      resolve();
    }
  }

  protected _getArgs(): string[] {
    return this._options.taskOptions.customArgs || [];
  }
}
