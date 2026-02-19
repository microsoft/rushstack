// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
import * as path from 'path';
import type { IRunScript, IRunScriptOptions } from '@rushstack/heft';

/**
 * This test script validates that importing @rushstack/node-core-library from an ESM context
 * works correctly with the package.json "exports" field under Node.js.
 *
 * Issue: https://github.com/microsoft/rushstack/issues/5644
 *
 * The problem was that "exports" maps with an "import" condition pointed to lib-esm/ files
 * containing extensionless imports (e.g., `from './api/Foo'`). Node.js ESM requires explicit
 * .js extensions, so this broke with ERR_MODULE_NOT_FOUND.
 *
 * The fix adds a "node" condition before "import" so Node.js uses CJS (which handles
 * extensionless requires), while bundlers still use "import" for ESM.
 */

// This ESM code will be piped to `node --input-type=module` to test actual ESM resolution.
const ESM_TEST_CODE: string = `
import { Path } from '@rushstack/node-core-library';

// If this line runs without ERR_MODULE_NOT_FOUND, the exports map is working correctly.
const result = Path.convertToSlashes('foo/bar');
if (result !== 'foo/bar') {
  throw new Error('Unexpected result from Path.convertToSlashes: ' + result);
}
console.log('ESM import test PASSED: @rushstack/node-core-library resolved correctly under Node.js ESM.');
`;

export async function runAsync(options: IRunScriptOptions): Promise<void> {
  const { heftTaskSession } = options;
  const { logger } = heftTaskSession;

  logger.terminal.writeLine('Testing ESM import resolution of @rushstack/node-core-library...');

  const result: child_process.SpawnSyncReturns<string> = child_process.spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', ESM_TEST_CODE],
    {
      encoding: 'utf-8',
      cwd: path.resolve(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe']
    }
  );

  if (result.stdout) {
    logger.terminal.writeLine(result.stdout.trim());
  }

  if (result.status !== 0) {
    const stderr: string = result.stderr || '';
    logger.emitError(
      new Error(
        `ESM import test FAILED (exit code ${result.status}).\n` +
          `This likely means the "exports" map in @rushstack/node-core-library/package.json\n` +
          `is directing Node.js to lib-esm/ files with extensionless imports.\n` +
          `See https://github.com/microsoft/rushstack/issues/5644\n\n` +
          `stderr:\n${stderr}`
      )
    );
  } else {
    logger.terminal.writeLine('ESM import resolution test passed successfully.');
  }
}
