// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as resolve from 'resolve';

import {
  JsonFile,
  IPackageJson,
  FileSystem,
  PackageJsonLookup,
  Terminal
} from '@microsoft/node-core-library';
import { GulpTask } from '@microsoft/gulp-core-build';
import * as TRushStackCompiler from '@microsoft/rush-stack-compiler-2.7';
import { GCBTerminalProvider } from './GCBTerminalProvider';

export interface IRSCTaskConfig extends Object {
  buildDirectory: string;

  allowBuiltinCompiler: boolean;
}

interface ITsconfig {
  extends?: string;
}

export abstract class RSCTask<TTaskConfig extends IRSCTaskConfig> extends GulpTask<TTaskConfig> {

  // For a given folder that contains a tsconfig.json file, return the absolute path of the folder
  // containing "@microsoft/rush-stack-compiler-*"
  private static _rushStackCompilerPackagePathCache: Map<string, string> = new Map<string, string>();

  private static __packageJsonLookup: PackageJsonLookup | undefined; // tslint:disable-line:variable-name

  private static get _packageJsonLookup(): PackageJsonLookup {
    if (!RSCTask.__packageJsonLookup) {
      RSCTask.__packageJsonLookup = new PackageJsonLookup();
    }

    return RSCTask.__packageJsonLookup;
  }

  protected _terminalProvider: GCBTerminalProvider = new GCBTerminalProvider(this);
  protected _terminal: Terminal = new Terminal(this._terminalProvider);

  /**
   * @internal
   */
  protected _rushStackCompiler: typeof TRushStackCompiler;

  private get _rushStackCompilerPackagePath(): string {
    if (!RSCTask._rushStackCompilerPackagePathCache.has(this.buildFolder)) {
      const projectTsconfigPath: string = path.join(this.buildFolder, 'tsconfig.json');

      const visitedTsconfigPaths: Set<string> = new Set<string>();
      let compilerPath: string;
      try {
        compilerPath = this._resolveRushStackCompilerFromTsconfig(projectTsconfigPath, visitedTsconfigPaths);
      } catch (e) {
        if (this.taskConfig.allowBuiltinCompiler) {
          this._terminal.writeVerboseLine(
            'Unable to resolve rush-stack-compiler from tsconfig.json. Using built-in compiler'
          );
          const builtInCompilerPath: string | undefined = RSCTask._packageJsonLookup.tryGetPackageFolderFor(
            require.resolve('@microsoft/rush-stack-compiler-2.7')
          );
          if (!builtInCompilerPath) {
            throw new Error(
              'Unable to resolve built-in compiler. Ensure @microsoft/gulp-core-build-typescript is correctly installed'
            );
          }

          compilerPath = builtInCompilerPath;
        } else {
          throw e;
        }
      }

      RSCTask._rushStackCompilerPackagePathCache.set(
        this.buildFolder,
        compilerPath
      );
    }

    return RSCTask._rushStackCompilerPackagePathCache.get(this.buildFolder)!;
  }

  protected get buildFolder(): string {
    return this.taskConfig.buildDirectory || this.buildConfig.rootPath;
  }

  public constructor(taskName: string, defaultConfig: Partial<TTaskConfig>) {
    super(
      taskName,
      {
        allowBuiltinCompiler: false,
        ...(defaultConfig as any) // tslint:disable-line:no-any (the spread operator isn't working here for some reason)
      } as TTaskConfig
    );
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

  /**
   * Determine which compiler should be used to compile a given project.
   *
   * @remarks
   * We load the tsconfig.json file, and follow its "extends" field until we reach the end of the chain.
   * We expect the last extended file to be under an installed @microsoft/rush-stack-compiler-* package,
   * which determines which typescript/tslint/api-extractor versions should be invoked.
   *
   * @param tsconfigPath - The path of a tsconfig.json file to analyze
   * @returns The absolute path of the folder containing "@microsoft/rush-stack-compiler-*" which should be used
   * to compile this tsconfig.json project
   */
  private _resolveRushStackCompilerFromTsconfig(tsconfigPath: string, visitedTsconfigPaths: Set<string>): string {
    this._terminal.writeVerboseLine(`Examining ${tsconfigPath}`);
    visitedTsconfigPaths.add(tsconfigPath);

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
      // Does the chain end with a file in the rush-stack-compiler package?
      const packageJsonPath: string | undefined = RSCTask._packageJsonLookup.tryGetPackageJsonFilePathFor(tsconfigPath);
      if (packageJsonPath) {
        const packageJson: IPackageJson = JsonFile.load(packageJsonPath);
        if (packageJson.name.match(/^@microsoft\/rush-stack-compiler-[0-9\.]+$/)) {
          const packagePath: string = path.dirname(packageJsonPath);
          this._terminal.writeVerboseLine(`Found rush-stack compiler at ${packagePath}/`);
          return packagePath;
        }
      }

      throw new Error(
        'Rush Stack determines your TypeScript compiler by following the "extends" field in your tsconfig.json ' +
        'file, until it reaches a package folder that depends on a variant of @microsoft/rush-stack-compiler-*. ' +
        `This lookup failed when it reached this file: ${tsconfigPath}`
      );
    }

    // Follow the tsconfig.extends field:
    let baseTsconfigPath: string;
    let extendsPathKind: string;
    if (path.isAbsolute(tsconfig.extends)) {
      // Absolute path
      baseTsconfigPath = tsconfig.extends;
      extendsPathKind = 'an absolute path';
    } else if (tsconfig.extends.match(/^\./)) {
      // Relative path
      baseTsconfigPath = path.resolve(path.dirname(tsconfigPath), tsconfig.extends);
      extendsPathKind = 'a relative path';
    } else {
      // Package path
      baseTsconfigPath = resolve.sync(
        tsconfig.extends,
        {
          basedir: this.buildConfig.rootPath,
          packageFilter: (pkg: IPackageJson) => {
            return {
              ...pkg,
              main: 'package.json'
            };
          }
        }
      );
      extendsPathKind = 'a package path';
    }

    this._terminal.writeVerboseLine(
      `Found tsconfig.extends property ${tsconfig.extends}. It appears ` +
      `to be ${extendsPathKind}. Resolved to ${baseTsconfigPath}`
    );

    if (visitedTsconfigPaths.has(baseTsconfigPath)) {
      throw new Error(`The file "${baseTsconfigPath}" has an "extends" field that creates a circular reference`);
    }

    return this._resolveRushStackCompilerFromTsconfig(baseTsconfigPath, visitedTsconfigPaths);
  }
}
