// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as resolve from 'resolve';

import {
  JsonFile,
  IPackageJson
} from '@microsoft/node-core-library';
import { GulpTask } from '@microsoft/gulp-core-build';
import * as RushStackCompiler from '@microsoft/rush-stack-compiler';
import { GCBTerminalProvider } from './GCBTerminalProvider';

export interface IRSCTaskConfig extends Object {
  buildDirectory: string;
  rushStackCompilerPackageName?: string;
}

export abstract class RSCTask<TTaskConfig extends IRSCTaskConfig> extends GulpTask<TTaskConfig> {
  protected _terminalProvider: GCBTerminalProvider = new GCBTerminalProvider(this);

  protected _rushStackCompiler: typeof RushStackCompiler;

  private __rushStackCompilerPackagePath: string | undefined; // tslint:disable-line:variable-name
  private get _rushStackCompilerPackagePath(): string {
    if (!this.__rushStackCompilerPackagePath) {
      try {
        this.__rushStackCompilerPackagePath = resolve.sync(
          this.taskConfig.rushStackCompilerPackageName!,
          {
            basedir: this.buildConfig.rootPath,
            packageFilter: (pkg: IPackageJson) => {
              pkg.main = 'package.json';
              return pkg;
            }
          }
        );

        if (!this.__rushStackCompilerPackagePath) {
          throw new Error();
        }

        this.__rushStackCompilerPackagePath = path.dirname(this.__rushStackCompilerPackagePath);
      } catch (e) {
        throw new Error(`Unable to find "${this.taskConfig.rushStackCompilerPackageName}" package.`);
      }
    }

    return this.__rushStackCompilerPackagePath;
  }

  constructor(name: string, options: Partial<TTaskConfig>) {
    super(name,
      {
        rushStackCompilerPackageName: '@microsoft/rush-stack-compiler',
        ...(options as any) // tslint:disable-line:no-any - TS is complaining about the spread operator here
      }
    );
  }

  protected initializeRushStackCompiler(): void {
    const compilerPackageJson: IPackageJson = JsonFile.load(
      path.join(this._rushStackCompilerPackagePath, 'package.json')
    );
    const main: string | undefined = compilerPackageJson.main;
    if (!main) {
      throw new Error(
        `Compiler package "${this.taskConfig.rushStackCompilerPackageName}" does not have a "main" entry.`
      );
    }

    this._rushStackCompiler = require(path.join(this._rushStackCompilerPackagePath, main));
  }

  protected get buildFolder(): string {
    return this.taskConfig.buildDirectory || this.buildConfig.rootPath;
  }
}
