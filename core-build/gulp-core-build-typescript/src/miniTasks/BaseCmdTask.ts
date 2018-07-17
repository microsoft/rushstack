// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'child_process';
import * as path from 'path';
import * as os from 'os';

import {
  JsonFile,
  IPackageJson,
  FileSystem
} from '@microsoft/node-core-library';
import { GulpTask } from '@microsoft/gulp-core-build';

export interface IBaseCmdTaskConfig {
  /**
   * Optional list of custom args to pass to the tool
   */
  customArgs?: string[];

  /**
   * The path to the package if the task should override the version of the package.
   */
  overridePackagePath?: string;

  /**
   * The directory in which the tool should be invoked.
   */
  buildDirectory?: string;
}

/**
 * Options for a CmdTask.
 * @public
 */
export interface IBaseTaskOptions<TTaskConfig> {
  /**
   * The initial config of the task.
   */
  initialTaskConfig?: TTaskConfig;

  /**
   * The name of the package to resolve.
   */
  packageName: string;

  /**
   * The path to the binary to invoke inside the package.
   */
  packageBinPath: string;
}

/**
 * This base task provides support for finding and then executing a binary in a node package.
 *
 * @alpha
 */
export abstract class BaseCmdTask<TTaskConfig extends IBaseCmdTaskConfig> extends GulpTask<TTaskConfig> {
  private static __nodePath: string | undefined; // tslint:disable-line:variable-name
  private static get _nodePath(): string | undefined {
    if (!BaseCmdTask.__nodePath) {
      try {
        if (os.platform() === 'win32') {
          // We're on Windows
          const whereOutput: string = childProcess.execSync('where node', { stdio: [] }).toString();
          const lines: string[] = whereOutput.split(os.EOL).filter((line) => !!line);
          BaseCmdTask.__nodePath = lines[lines.length - 1];
        } else {
          // We aren't on Windows - assume we're on *NIX or Darwin
          BaseCmdTask.__nodePath = childProcess.execSync('which node', { stdio: [] }).toString();
        }
      } catch (e) {
        return undefined;
      }

      BaseCmdTask.__nodePath = BaseCmdTask.__nodePath.trim();
      if (!FileSystem.exists(BaseCmdTask.__nodePath)) {
        return undefined;
      }
    }

    return BaseCmdTask.__nodePath;
  }

  protected _packageName: string;
  protected _packageBinPath: string;
  protected _errorHasBeenLogged: boolean;

  constructor(name: string, options: IBaseTaskOptions<TTaskConfig>) {
    super(name, options.initialTaskConfig);

    this._packageName = options.packageName;
    this._packageBinPath = options.packageBinPath;
  }

  public executeTask(gulp: Object, completeCallback: (error?: string) => void): Promise<void> | undefined {
    let binaryPackagePath: string = require.resolve(this._packageName);
    let packageJsonPath: string;
    while (!FileSystem.exists(packageJsonPath = path.join(binaryPackagePath, 'package.json'))) {
      const tempBinaryPackagePath: string = path.dirname(binaryPackagePath);
      if (binaryPackagePath === tempBinaryPackagePath) {
        // We've hit the disk root
        completeCallback(`Unable to find the package.json file for ${this._packageName}.`);
        return;
      }

      binaryPackagePath = tempBinaryPackagePath;
    }

    if (this.taskConfig.overridePackagePath) {
      // The package version is being overridden
      if (!FileSystem.exists(this.taskConfig.overridePackagePath)) {
        completeCallback(
          `The specified ${this._packageName} path (${this.taskConfig.overridePackagePath}) does not ` +
          'exist'
        );
        return;
      }

      binaryPackagePath = this.taskConfig.overridePackagePath;
    }

    // Print the version
    const packageJson: IPackageJson = JsonFile.load(packageJsonPath);
    this.log(`${this._packageName} version: ${packageJson.version}`);

    const binaryPath: string = path.resolve(binaryPackagePath, this._packageBinPath);
    if (!FileSystem.exists(binaryPath)) {
      completeCallback(
        `The binary is missing. This indicates that ${this._packageName} is not ` +
        'installed correctly.'
      );
      return;
    }

    return new Promise((resolve: () => void, reject: (error: Error) => void) => {
      const nodePath: string | undefined = BaseCmdTask._nodePath;
      if (!nodePath) {
        reject(new Error('Unable to find node executable'));
        return;
      }

      // Invoke the tool and watch for log messages
      const spawnResult: childProcess.ChildProcess = childProcess.spawn(
        nodePath,
        [binaryPath, ...this._getArgs()],
        {
          cwd: this._buildDirectory,
          env: process.env,
          stdio: 'pipe'
        }
      );

      spawnResult.stdout.on('data', this._onData.bind(this));
      spawnResult.stderr.on('data', (data: Buffer) => {
        this._errorHasBeenLogged = true;
        this._onError(data);
      });

      spawnResult.on('close', (code) => this._onClose(code, this._errorHasBeenLogged, resolve, reject));
    });
  }

  protected get _buildDirectory(): string {
    return this.taskConfig.buildDirectory || this.buildConfig.rootPath;
  }

  protected _onData(data: Buffer): void {
    this.log(data.toString().trim());
  }

  protected _onError(data: Buffer): void {
    this.logError(data.toString().trim());
  }

  protected _onClose(code: number, hasErrors: boolean, resolve: () => void, reject: (error: Error) => void): void {
    if (code !== 0 || hasErrors) {
      reject(new Error(`exited with code ${code}`));
    } else {
      resolve();
    }
  }

  protected _getArgs(): string[] {
    return this.taskConfig.customArgs || [];
  }
}
