// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs/promises';

import type { IRunScriptOptions } from '@rushstack/heft';

export async function runAsync({ heftConfiguration: { buildFolderPath } }: IRunScriptOptions): Promise<void> {
  const metadataFolder: string = `${buildFolderPath}/.rush/temp/operation/_phase_build`;

  await fs.mkdir(metadataFolder, { recursive: true });

  await fs.writeFile(`${metadataFolder}/test.txt`, new Date().toString(), 'utf-8');
}
