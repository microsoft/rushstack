// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { tmpdir } from 'node:os';

import { FileSystem } from '@rushstack/node-core-library';

/**
 * The filename used to indicate that the Playwright on Codespaces extension is installed.
 * @beta
 */
export const EXTENSION_INSTALLED_FILENAME: string = '.playwright-codespaces-extension-installed.txt';

/**
 * Helper to determine if the Playwright on Codespaces extension is installed. This check's for the
 * existence of a well-known file in the OS temp directory.
 * @beta
 */
export async function isExtensionInstalledAsync(): Promise<boolean> {
  // Read file from os.tempdir() + '/.playwright-codespaces-extension-installed'
  const tempDir: string = tmpdir();

  const extensionInstalledFilePath: string = `${tempDir}/${EXTENSION_INSTALLED_FILENAME}`;
  const doesExist: boolean = FileSystem.exists(extensionInstalledFilePath);

  // check if file exists
  return doesExist;
}
