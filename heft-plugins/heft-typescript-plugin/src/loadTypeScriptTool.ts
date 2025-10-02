// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import semver from 'semver';

import type { HeftConfiguration } from '@rushstack/heft';
import type { ITerminal } from '@rushstack/terminal';
import { type IPackageJson, JsonFile, RealNodeModulePathResolver } from '@rushstack/node-core-library';

import type { ExtendedTypeScript } from './internalTypings/TypeScriptInternals';
import type { IBaseTypeScriptTool } from './TypeScriptBuilder';

const OLDEST_SUPPORTED_TS_MAJOR_VERSION: number = 2;
const OLDEST_SUPPORTED_TS_MINOR_VERSION: number = 9;

const NEWEST_SUPPORTED_TS_MAJOR_VERSION: number = 5;
const NEWEST_SUPPORTED_TS_MINOR_VERSION: number = 8;

/**
 * @internal
 */
export interface ILoadedTypeScriptTool {
  tool: IBaseTypeScriptTool;
  typescriptVersion: string;
  typescriptParsedVersion: semver.SemVer;
  capabilities: ICompilerCapabilities;
}

/**
 * @internal
 */
export interface ICompilerCapabilities {
  /**
   * Support for incremental compilation via `ts.createIncrementalProgram()`.
   * Introduced with TypeScript 3.6.
   */
  incrementalProgram: boolean;

  /**
   * Support for composite projects via `ts.createSolutionBuilder()`.
   * Introduced with TypeScript 3.0.
   */
  solutionBuilder: boolean;
}

/**
 * @internal
 */
export interface ILoadTypeScriptToolOptions {
  terminal: ITerminal;
  heftConfiguration: HeftConfiguration;
  onlyResolveSymlinksInNodeModules?: boolean;
  buildProjectReferences?: boolean;
}

/**
 * @internal
 */
export async function loadTypeScriptToolAsync(
  options: ILoadTypeScriptToolOptions
): Promise<ILoadedTypeScriptTool> {
  const { terminal, heftConfiguration, buildProjectReferences, onlyResolveSymlinksInNodeModules } = options;

  const typeScriptToolPath: string = await heftConfiguration.rigPackageResolver.resolvePackageAsync(
    'typescript',
    terminal
  );

  // Determine the compiler version
  const compilerPackageJsonFilename: string = `${typeScriptToolPath}/package.json`;
  const packageJson: IPackageJson = await JsonFile.loadAsync(compilerPackageJsonFilename);
  const typescriptVersion: string = packageJson.version;
  const typescriptParsedVersion: semver.SemVer | null = semver.parse(typescriptVersion);
  if (!typescriptParsedVersion) {
    throw new Error(
      `Unable to parse version "${typescriptVersion}" for TypeScript compiler package in: ` +
        compilerPackageJsonFilename
    );
  }

  // Detect what features this compiler supports.  Note that manually comparing major/minor numbers
  // loosens the matching to accept prereleases such as "3.6.0-dev.20190530"
  const capabilities: ICompilerCapabilities = {
    incrementalProgram: false,
    solutionBuilder: typescriptParsedVersion.major >= 3
  };

  if (
    typescriptParsedVersion.major > 3 ||
    (typescriptParsedVersion.major === 3 && typescriptParsedVersion.minor >= 6)
  ) {
    capabilities.incrementalProgram = true;
  }

  if (buildProjectReferences && !capabilities.solutionBuilder) {
    throw new Error(
      `Building project references requires TypeScript@>=3.0, but the current version is ${typescriptVersion}`
    );
  }

  // Report a warning if the TypeScript version is too old/new.  The current oldest supported version is
  // TypeScript 2.9. Prior to that the "ts.getConfigFileParsingDiagnostics()" API is missing; more fixups
  // would be required to deal with that.  We won't do that work unless someone requests it.
  if (
    typescriptParsedVersion.major < OLDEST_SUPPORTED_TS_MAJOR_VERSION ||
    (typescriptParsedVersion.major === OLDEST_SUPPORTED_TS_MAJOR_VERSION &&
      typescriptParsedVersion.minor < OLDEST_SUPPORTED_TS_MINOR_VERSION)
  ) {
    // We don't use writeWarningLine() here because, if the person wants to take their chances with
    // a seemingly unsupported compiler, their build should be allowed to succeed.
    terminal.writeLine(
      `The TypeScript compiler version ${typescriptVersion} is very old` +
        ` and has not been tested with Heft; it may not work correctly.`
    );
  } else if (
    typescriptParsedVersion.major > NEWEST_SUPPORTED_TS_MAJOR_VERSION ||
    (typescriptParsedVersion.major === NEWEST_SUPPORTED_TS_MAJOR_VERSION &&
      typescriptParsedVersion.minor > NEWEST_SUPPORTED_TS_MINOR_VERSION)
  ) {
    terminal.writeLine(
      `The TypeScript compiler version ${typescriptVersion} is newer` +
        ' than the latest version that was tested with Heft ' +
        `(${NEWEST_SUPPORTED_TS_MAJOR_VERSION}.${NEWEST_SUPPORTED_TS_MINOR_VERSION}); it may not work correctly.`
    );
  }

  const ts: ExtendedTypeScript = require(typeScriptToolPath);

  let realpath: typeof ts.sys.realpath = ts.sys.realpath;
  if (onlyResolveSymlinksInNodeModules) {
    const resolver: RealNodeModulePathResolver = new RealNodeModulePathResolver();
    realpath = resolver.realNodeModulePath;
  }

  return {
    tool: {
      ts,
      system: {
        ...ts.sys,
        realpath
      },
      typeScriptToolPath
    },
    typescriptVersion,
    typescriptParsedVersion,
    capabilities
  };
}
