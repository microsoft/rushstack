// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath: string = path.resolve(__dirname, '../../');

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath: string = path.resolve(__dirname, './suite/index');

    // Download VS Code, unzip it and run the integration test
    await runTests({ extensionDevelopmentPath, extensionTestsPath });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to run tests');
    process.exit(1);
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
