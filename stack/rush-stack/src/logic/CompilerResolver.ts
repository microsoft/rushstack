// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as resolve from 'resolve';

import {
  PackageJsonLookup,
  Terminal,
  FileSystem,
  JsonFile,
  IPackageJson,
  ITerminalProvider
} from '@microsoft/node-core-library';

import * as RushStackCompiler from '../../typings/Compiler';
import { TerminalProvider } from './TerminalProvider';

export interface ICompilerResolverOptions {
  terminalProvider: ITerminalProvider;
  projectPath: string;
}

interface ITsconfig {
  extends?: string;
}

export class CompilerResolver {
  private static _rushStackCompilerPackagePathCache: Map<string, string> = new Map<string, string>();

  private static __packageJsonLookup: PackageJsonLookup | undefined; // tslint:disable-line:variable-name

  private static get _packageJsonLookup(): PackageJsonLookup {
    if (!CompilerResolver.__packageJsonLookup) {
      CompilerResolver.__packageJsonLookup = new PackageJsonLookup();
    }

    return CompilerResolver.__packageJsonLookup;
  }

  private _rushStackCompiler: typeof RushStackCompiler;
  private _terminal: Terminal;
  private _projectPath: string;

  public constructor(options: ICompilerResolverOptions) {
    this._terminal = TerminalProvider.getTerminal(options.terminalProvider);
    this._projectPath = options.projectPath;
  }

  public initializeRushStackCompiler(): typeof RushStackCompiler {
    if (!this._rushStackCompiler) {
      const compilerPackageJson: IPackageJson = JsonFile.load(
        path.join(this._rushStackCompilerPackagePath, 'package.json')
      );
      const main: string | undefined = compilerPackageJson.main;
      if (!main) {
        throw new Error('Compiler package does not have a "main" entry.');
      }

      this._rushStackCompiler = require(path.join(this._rushStackCompilerPackagePath, main));

      if (!this._rushStackCompiler.ToolPaths) {
        // Early versions of RSC didn't export the ToolPaths object. This is still
        // in a prototyping phase, so we'll just fill the object if it's missing
        const toolPaths: typeof RushStackCompiler = require(
          path.join(this._rushStackCompilerPackagePath, 'lib', 'ToolPaths.js')
        );
        this._rushStackCompiler.ToolPaths = toolPaths.ToolPaths;
      }
    }

    return this._rushStackCompiler;
  }

  private get _rushStackCompilerPackagePath(): string {
    if (!CompilerResolver._rushStackCompilerPackagePathCache.has(this._projectPath)) {
      const projectTsconfigPath: string = path.join(this._projectPath, 'tsconfig.json');

      const visitedTsconfigPaths: Set<string> = new Set<string>();
      const compilerPath: string = this._resolveRushStackCompilerFromTsconfig(
        projectTsconfigPath,
        visitedTsconfigPaths
      );

      CompilerResolver._rushStackCompilerPackagePathCache.set(
        this._projectPath,
        compilerPath
      );
    }

    return CompilerResolver._rushStackCompilerPackagePathCache.get(this._projectPath)!;
  }

  /**
   * Determine which compiler should be used to compile a given project.
   *
   * @remarks
   * We load the tsconfig.json file, and follow its "extends" field until we reach the end of the chain.
   * We expect the last extended file to be under an installed @microsoft/rush-stack-compiler package,
   * which determines which typescript/tslint/api-extractor versions should be invoked.
   *
   * @param tsconfigPath - The path of a tsconfig.json file to analyze
   * @returns The absolute path of the folder containing "@microsoft/rush-stack-compiler" which should be used
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
      const packageJsonPath: string | undefined = CompilerResolver._packageJsonLookup.tryGetPackageJsonFilePathFor(
        tsconfigPath
      );
      if (packageJsonPath) {
        const packageJson: IPackageJson = JsonFile.load(packageJsonPath);
        if (packageJson.name === '@microsoft/rush-stack-compiler') {
          const packagePath: string = path.dirname(packageJsonPath);
          this._terminal.writeVerboseLine(`Found rush-stack compiler at ${packagePath}/`);
          return packagePath;
        }
      }

      throw new Error(
        'Rush Stack determines your TypeScript compiler by following the "extends" field in your tsconfig.json ' +
        'file, until it reaches a package folder that depends on @microsoft/rush-stack-compiler. This lookup ' +
        `failed when it reached this file: ${tsconfigPath}`
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
          basedir: path.dirname(tsconfigPath),
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
