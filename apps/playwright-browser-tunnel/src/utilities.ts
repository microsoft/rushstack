// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@rushstack/node-core-library';

/**
 * Helper to determine if the Playwright on Codespaces extension is installed. This check's for the
 * existence of a well-known file in the OS temp directory.
 * @alpha
 */
export async function extensionIsInstalled(): Promise<boolean> {
  // Read file from os.tempdir() + '/.playwright-codespaces-extension-installed'
  const tempDir: string = (await import('node:os')).tmpdir();

  const extensionInstalledFilePath: string = `${tempDir}/.playwright-codespaces-extension-installed.txt`;
  const doesExist: boolean = FileSystem.exists(extensionInstalledFilePath);

  // check if file exists
  return doesExist;
}
