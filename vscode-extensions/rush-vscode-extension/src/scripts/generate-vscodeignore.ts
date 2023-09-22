// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRunScriptOptions } from '@rushstack/heft';
import { FileSystem } from '@rushstack/node-core-library';
import { PackageExtractor } from '@rushstack/package-extractor';

export async function runAsync({
  heftConfiguration: { buildFolderPath },
  heftTaskSession: { logger }
}: IRunScriptOptions): Promise<void> {
  const includedFilePaths: string[] = await PackageExtractor.getPackageIncludedFilesAsync(buildFolderPath);
  includedFilePaths.sort();
  const vscodeIgnoreLines: string[] = ['**'];
  for (const folderItemPath of includedFilePaths) {
    vscodeIgnoreLines.push(`!${folderItemPath}`);
  }

  const vscodeignorePath: string = `${buildFolderPath}/.vscodeignore`;
  await FileSystem.writeFileAsync(vscodeignorePath, vscodeIgnoreLines.join('\n') + '\n');
}
