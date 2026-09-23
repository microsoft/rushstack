// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';

import { Path } from '@rushstack/node-core-library';

/**
 * Confines a request using physical paths, then expresses it in the loaded configuration's namespace
 * so native project selectors can use the same project paths as RushConfiguration.
 */
export async function resolvePhasedCommandCwdAsync(cwd: string, rushJsonFolder: string): Promise<string> {
  const [physicalCwd, physicalRoot]: [string, string] = await Promise.all([
    realpath(cwd),
    realpath(rushJsonFolder)
  ]);
  if (!Path.isUnderOrEqual(physicalCwd, physicalRoot)) {
    throw new Error('The command working directory must be inside the daemon workspace.');
  }
  if (!(await stat(physicalCwd)).isDirectory()) {
    throw new Error('The command working directory must resolve to an existing directory.');
  }
  return path.resolve(rushJsonFolder, path.relative(physicalRoot, physicalCwd));
}
