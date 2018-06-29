// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'child_process';
import * as path from 'path';
import * as fsx from 'fs-extra';

import {
  JsonFile,
  IPackageJson
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
    while (!fsx.existsSync(packageJsonPath = path.join(binaryPackagePath, 'package.json'))) {
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
      if (!fsx.existsSync(this.taskConfig.overridePackagePath)) {
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
    if (!fsx.existsSync(binaryPath)) {
      completeCallback(
        `The binary is missing. This indicates that ${this._packageName} is not ` +
        'installed correctly.'
      );
      return;
    }

    return new Promise((resolve: () => void, reject: (error: Error) => void) => {
      // Invoke the tool and watch for log messages
      const spawnResult: childProcess.ChildProcess = childProcess.spawn(
        'node',
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
