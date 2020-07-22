// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as resolve from 'resolve';
import { Terminal, JsonFile, IPackageJson, FileSystem } from '@rushstack/node-core-library';

import * as TRushStackCompiler from '@microsoft/rush-stack-compiler-3.7';
import { Utilities } from './Utilities';

interface ITsconfig {
  extends?: string;
}

export class RushStackCompilerUtilities {
  /**
   * For a given tsconfig.json file path, return the absolute path of the folder
   * containing "@microsoft/rush-stack-compiler-*"
   */
  private static _rscPackagePathCache: Map<string, string | undefined> = new Map<
    string,
    string | undefined
  >();

  /**
   * For a given tsconfig.json file path, return the RSC package.
   */
  private static _rscPackageCache: Map<string, typeof TRushStackCompiler | undefined> = new Map<
    string,
    typeof TRushStackCompiler | undefined
  >();

  public static tryLoadRushStackCompilerPackageForFolder(
    terminal: Terminal,
    folderPath: string
  ): typeof TRushStackCompiler | undefined {
    const tsconfigPath: string = path.join(folderPath, 'tsconfig.json');
    return RushStackCompilerUtilities.tryLoadRushStackCompilerPackageForTsconfig(terminal, tsconfigPath);
  }

  public static tryLoadRushStackCompilerPackageForTsconfig(
    terminal: Terminal,
    tsconfigPath: string
  ): typeof TRushStackCompiler | undefined {
    if (!RushStackCompilerUtilities._rscPackageCache.has(tsconfigPath)) {
      const rscPackagePath: string | undefined = RushStackCompilerUtilities._tryGetRscPackagePathForTsconfig(
        terminal,
        tsconfigPath
      );
      let rscPackage: typeof TRushStackCompiler | undefined = undefined;
      if (rscPackagePath) {
        const rscPackageJson: IPackageJson = JsonFile.load(path.join(rscPackagePath, 'package.json'));
        const main: string | undefined = rscPackageJson.main;
        if (!main) {
          throw new Error('Compiler package does not have a "main" entry.');
        }

        rscPackage = require(path.resolve(rscPackagePath, main));
      }

      RushStackCompilerUtilities._rscPackageCache.set(tsconfigPath, rscPackage);
    }

    return RushStackCompilerUtilities._rscPackageCache.get(tsconfigPath);
  }

  private static _tryGetRscPackagePathForTsconfig(
    terminal: Terminal,
    tsconfigPath: string
  ): string | undefined {
    try {
      return RushStackCompilerUtilities._resolveRscFromTsconfig(terminal, tsconfigPath, new Set<string>());
    } catch (e) {
      terminal.writeVerboseLine(`Unable to resolve rush-stack-compiler from ${tsconfigPath}: ${e}`);
    }
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
  private static _resolveRscFromTsconfig(
    terminal: Terminal,
    tsconfigPath: string,
    visitedTsconfigPaths: Set<string>
  ): string {
    if (!RushStackCompilerUtilities._rscPackagePathCache.has(tsconfigPath)) {
      let rscPackagePath: string | undefined = undefined;
      terminal.writeVerboseLine(`Examining ${tsconfigPath}`);
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
        const packageJsonPath: string | undefined = Utilities.packageJsonLookup.tryGetPackageJsonFilePathFor(
          tsconfigPath
        );
        if (packageJsonPath) {
          const packageJson: IPackageJson = JsonFile.load(packageJsonPath);
          if (packageJson.name.match(/^@microsoft\/rush-stack-compiler-[0-9\.]+$/)) {
            const packagePath: string = path.dirname(packageJsonPath);
            terminal.writeVerboseLine(`Found rush-stack compiler at ${packagePath}/`);
            rscPackagePath = packagePath;
          }
        }

        if (!rscPackagePath) {
          throw new Error(
            'Rush Stack determines your TypeScript compiler by following the "extends" field in your tsconfig.json ' +
              'file, until it reaches a package folder that depends on a variant of @microsoft/rush-stack-compiler-*. ' +
              `This lookup failed when it reached this file: ${tsconfigPath}`
          );
        }
      } else {
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
          baseTsconfigPath = resolve.sync(tsconfig.extends, {
            basedir: path.dirname(tsconfigPath),
            packageFilter: (pkg: IPackageJson) => {
              return {
                ...pkg,
                main: 'package.json'
              };
            }
          });
          extendsPathKind = 'a package path';
        }

        terminal.writeVerboseLine(
          `Found tsconfig.extends property ${tsconfig.extends}. It appears ` +
            `to be ${extendsPathKind}. Resolved to ${baseTsconfigPath}`
        );

        if (visitedTsconfigPaths.has(baseTsconfigPath)) {
          throw new Error(
            `The file "${baseTsconfigPath}" has an "extends" field that creates a circular reference`
          );
        }

        rscPackagePath = RushStackCompilerUtilities._resolveRscFromTsconfig(
          terminal,
          baseTsconfigPath,
          visitedTsconfigPaths
        );
      }

      RushStackCompilerUtilities._rscPackagePathCache.set(tsconfigPath, rscPackagePath);
    }

    return RushStackCompilerUtilities._rscPackagePathCache.get(tsconfigPath)!;
  }
}
