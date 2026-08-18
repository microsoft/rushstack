// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import { promisify } from 'node:util';
import Mocha from 'mocha';
import glob from 'fast-glob';

export async function run(): Promise<void> {
  // Create the mocha test
  const mocha: Mocha = new Mocha({
    ui: 'tdd',
    color: true
  });

  const testsRoot: string = path.resolve(__dirname, '..');

  const files: string[] = await glob('**/**.test.js', { cwd: testsRoot });
  // Add files to the test suite
  files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));
  await promisify(mocha.run.bind(mocha));
}
