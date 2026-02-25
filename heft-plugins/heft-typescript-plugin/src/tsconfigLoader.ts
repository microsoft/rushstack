// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import type * as TTypescript from 'typescript';

import { Path } from '@rushstack/node-core-library';
import type { HeftConfiguration } from '@rushstack/heft';

import type { IBaseTypeScriptTool } from './TypeScriptBuilder.ts';

/**
 * @internal
 */
export interface ILoadTsconfigOptions {
  tool: IBaseTypeScriptTool;
  tsconfigPath: string;
  tsCacheFilePath?: string;
}

/**
 * @internal
 */
export function getTsconfigFilePath(
  heftConfiguration: HeftConfiguration,
  tsconfigRelativePath: string | undefined
): string {
  return Path.convertToSlashes(
    // Use path.resolve because the path can start with `./` or `../`
    path.resolve(heftConfiguration.buildFolderPath, tsconfigRelativePath ?? './tsconfig.json')
  );
}

/**
 * @internal
 */
export function loadTsconfig(options: ILoadTsconfigOptions): TTypescript.ParsedCommandLine {
  const {
    tool: { ts, system },
    tsconfigPath,
    tsCacheFilePath
  } = options;
  const parsedConfigFile: ReturnType<typeof ts.readConfigFile> = ts.readConfigFile(
    tsconfigPath,
    system.readFile
  );

  const currentFolder: string = path.dirname(tsconfigPath);
  const tsconfig: TTypescript.ParsedCommandLine = ts.parseJsonConfigFileContent(
    parsedConfigFile.config,
    {
      fileExists: system.fileExists,
      readFile: system.readFile,
      readDirectory: system.readDirectory,
      realpath: system.realpath,
      useCaseSensitiveFileNames: true
    },
    currentFolder,
    /*existingOptions:*/ undefined,
    tsconfigPath
  );

  if (tsconfig.options.incremental) {
    tsconfig.options.tsBuildInfoFile = tsCacheFilePath;
  }

  // Force-inject rewriteRelativeImportExtensions and allowImportingTsExtensions.
  // TypeScript's config parser strips rewriteRelativeImportExtensions when moduleResolution
  // is not "node16"/"nodenext"/"bundler", and rejects allowImportingTsExtensions without
  // noEmit or emitDeclarationOnly. Since Heft manages emit and module resolution itself,
  // we bypass both restrictions by injecting directly after parsing.
  tsconfig.options.rewriteRelativeImportExtensions = true;
  tsconfig.options.allowImportingTsExtensions = true;

  return tsconfig;
}
