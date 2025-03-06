// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as TTypeScript from 'typescript';
import type { ISwcIsolatedTranspileOptions, IProjectOptions } from './types';
import type { IScopedLogger } from '@rushstack/heft';

interface ITypeScriptExtensions {
  resolvePath(base: string, segment: string): string;
}

export type TExtendedTypeScript = typeof TTypeScript & ITypeScriptExtensions;

export function loadTsconfig(
  ts: TExtendedTypeScript,
  projectOptions: IProjectOptions,
  pluginOptions: ISwcIsolatedTranspileOptions,
  logger: IScopedLogger
): TTypeScript.ParsedCommandLine | undefined {
  const { tsConfigPath = 'tsconfig.json' } = pluginOptions;

  const { buildFolder } = projectOptions;

  const resolvedTsConfigPath: string = ts.resolvePath(buildFolder, tsConfigPath);

  const parsedConfigFile: ReturnType<typeof ts.readConfigFile> = ts.readConfigFile(
    resolvedTsConfigPath,
    ts.sys.readFile
  );

  if (parsedConfigFile.error) {
    // Error code 5083 is "Cannot read file" for the tsconfig.json file being missing
    if (parsedConfigFile.error.code === 5083) {
      logger.terminal.writeLine(`${parsedConfigFile.error.messageText}`);
      return undefined;
    } else {
      throw new Error(
        `ts.readConfigFile Error Code ${parsedConfigFile.error.code}:  ${parsedConfigFile.error.messageText}`
      );
    }
  }

  const currentFolder: string = buildFolder;

  const tsconfig: TTypeScript.ParsedCommandLine = ts.parseJsonConfigFileContent(
    parsedConfigFile.config,
    {
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      useCaseSensitiveFileNames: true
    },
    currentFolder,
    /*existingOptions:*/ undefined,
    resolvedTsConfigPath
  );

  return tsconfig;
}
