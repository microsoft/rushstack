// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import pnpmLinkBins from '@pnpm/link-bins';

import { Async, FileSystem, Path, Text } from '@rushstack/node-core-library';
import { Colorize, type ITerminal } from '@rushstack/terminal';

import { MAX_CONCURRENCY } from './scripts/createLinks/utilities/constants.ts';

export function matchesWithStar(patternWithStar: string, input: string): boolean {
  // Map "@types/*" --> "^\@types\/.*$"
  const pattern: string =
    '^' +
    patternWithStar
      .split('*')
      .map((x) => Text.escapeRegExp(x))
      .join('.*') +
    '$';
  // eslint-disable-next-line @rushstack/security/no-unsafe-regexp
  const regExp: RegExp = new RegExp(pattern);
  return regExp.test(input);
}

export interface IRemapPathForTargetFolder {
  sourcePath: string;
  sourceRootFolder: string;
  targetRootFolder: string;
}

/**
 * Maps a file path under the provided {@link IRemapPathForTargetFolder.sourceRootFolder} to the provided
 * {@link IExtractorOptions.targetRootFolder}.
 *
 * Example input: "C:\\MyRepo\\libraries\\my-lib"
 * Example output: "C:\\MyRepo\\common\\deploy\\libraries\\my-lib"
 */
export function remapSourcePathForTargetFolder(options: IRemapPathForTargetFolder): string {
  const { sourcePath, sourceRootFolder, targetRootFolder } = options;
  const relativePath: string = path.relative(sourceRootFolder, sourcePath);
  if (relativePath.startsWith('..')) {
    throw new Error(`Source path "${sourcePath}" is not under "${sourceRootFolder}"`);
  }
  const absolutePathInTargetFolder: string = path.join(targetRootFolder, relativePath);
  return absolutePathInTargetFolder;
}

/**
 * Maps a file path under the provided folder path to the expected path format for the extractor metadata.
 *
 * Example input: "C:\\MyRepo\\libraries\\my-lib"
 * Example output: "common/deploy/libraries/my-lib"
 */
export function remapPathForExtractorMetadata(folderPath: string, filePath: string): string {
  const relativePath: string = path.relative(folderPath, filePath);
  if (relativePath.startsWith('..')) {
    throw new Error(`Path "${filePath}" is not under "${folderPath}"`);
  }
  return Path.convertToSlashes(relativePath);
}

/**
 * Creates the .bin files for the extracted projects and returns the paths to the created .bin files.
 *
 * @param terminal - The terminal to write to
 * @param extractedProjectFolderPaths - The paths to the extracted projects
 */
export async function makeBinLinksAsync(
  terminal: ITerminal,
  extractedProjectFolderPaths: string[]
): Promise<string[]> {
  const binFilePaths: string[] = [];
  await Async.forEachAsync(
    extractedProjectFolderPaths,
    async (extractedProjectFolderPath: string) => {
      const extractedProjectNodeModulesFolderPath: string = `${extractedProjectFolderPath}/node_modules`;
      const extractedProjectBinFolderPath: string = `${extractedProjectNodeModulesFolderPath}/.bin`;

      const linkedBinPackageNames: string[] = await pnpmLinkBins(
        extractedProjectNodeModulesFolderPath,
        extractedProjectBinFolderPath,
        {
          warn: (msg: string) => terminal.writeLine(Colorize.yellow(msg))
        }
      );

      if (linkedBinPackageNames.length) {
        const binFolderItems: string[] = await FileSystem.readFolderItemNamesAsync(
          extractedProjectBinFolderPath
        );
        for (const binFolderItem of binFolderItems) {
          const binFilePath: string = `${extractedProjectBinFolderPath}/${binFolderItem}`;
          terminal.writeVerboseLine(`Created .bin file: ${binFilePath}`);
          binFilePaths.push(binFilePath);
        }
      }
    },
    {
      concurrency: MAX_CONCURRENCY
    }
  );

  return binFilePaths;
}
