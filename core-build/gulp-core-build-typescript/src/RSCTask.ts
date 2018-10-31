// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import {
  JsonFile,
  IPackageJson,
  FileSystem,
  PackageJsonLookup
} from '@microsoft/node-core-library';
import { GulpTask } from '@microsoft/gulp-core-build';
import * as RushStackCompiler from '@microsoft/rush-stack-compiler';
import { GCBTerminalProvider } from './GCBTerminalProvider';

export interface IRSCTaskConfig extends Object {
  buildDirectory: string;
}

interface ITsconfig {
  extends?: string;
}

export abstract class RSCTask<TTaskConfig extends IRSCTaskConfig> extends GulpTask<TTaskConfig> {
  private static _rushStackCompilerPackagePathCache: Map<string, string> = new Map<string, string>();
  private static __packageJsonLookup: PackageJsonLookup | undefined; // tslint:disable-line:variable-name
  private static get _packageJsonLookup(): PackageJsonLookup {
    if (!RSCTask.__packageJsonLookup) {
      RSCTask.__packageJsonLookup = new PackageJsonLookup();
    }

    return RSCTask.__packageJsonLookup;
  }

  protected _terminalProvider: GCBTerminalProvider = new GCBTerminalProvider(this);

  protected _rushStackCompiler: typeof RushStackCompiler;

  private get _rushStackCompilerPackagePath(): string {
    if (!RSCTask._rushStackCompilerPackagePathCache.has(this.buildFolder)) {
      const projectTsconfigPath: string = path.join(this.buildFolder, 'tsconfig.json');
      RSCTask._rushStackCompilerPackagePathCache.set(
        this.buildFolder,
        this._resolveRushStackCompilerFromTsconfig(projectTsconfigPath)
      );
    }

    return RSCTask._rushStackCompilerPackagePathCache.get(this.buildFolder)!;
  }

  protected initializeRushStackCompiler(): void {
    const compilerPackageJson: IPackageJson = JsonFile.load(
      path.join(this._rushStackCompilerPackagePath, 'package.json')
    );
    const main: string | undefined = compilerPackageJson.main;
    if (!main) {
      throw new Error('Compiler package does not have a "main" entry.');
    }

    this._rushStackCompiler = require(path.join(this._rushStackCompilerPackagePath, main));
  }

  protected get buildFolder(): string {
    return this.taskConfig.buildDirectory || this.buildConfig.rootPath;
  }

  private _resolveRushStackCompilerFromTsconfig(tsconfigPath: string): string {
    // First, see if the package we're in is rush-stack-compiler
    const packageJsonPath: string | undefined = RSCTask._packageJsonLookup.tryGetPackageJsonFilePathFor(tsconfigPath);
    if (packageJsonPath) {
      const packageJson: IPackageJson = JsonFile.load(packageJsonPath);
      if (packageJson.name === '@microsoft/rush-stack-compiler') {
        return path.dirname(packageJsonPath);
      }
    }

    if (!FileSystem.exists(tsconfigPath)) {
      throw new Error(`tsconfig.json file (${tsconfigPath}) does not exist.`);
    }

    let tsconfig: ITsconfig;
    try {
      tsconfig = JsonFile.load(tsconfigPath);
    } catch (e) {
      throw new Error(`Error parsing tsconfig.json ${tsconfigPath}: ${e}`);
    }

    if (!tsconfig.extends) {
      throw new Error(
        'Rush Stack determines your TypeScript compiler by following the "extends" field in your tsconfig.json ' +
        'file, until it reaches a package folder that depends on @microsoft/rush-stack-compiler. This lookup ' +
        `failed when it reached this file: ${tsconfigPath}`
      );
    }

    const resolvedTsconfig: string = path.resolve(path.dirname(tsconfigPath), tsconfig.extends);
    return this._resolveRushStackCompilerFromTsconfig(resolvedTsconfig);
  }
}
