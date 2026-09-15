// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';
import * as path from 'node:path';

import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath: string = path.resolve(__dirname, '../../dist/vsix/unpacked');
    const extensionTestsPath: string = path.resolve(__dirname, './suite/index');
    const testDataPath: string = path.join(os.tmpdir(), 'playwright-local-browser-server-vscode-test');

    await runTests({
      vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        path.join(testDataPath, 'workspace'),
        '--user-data-dir',
        path.join(testDataPath, 'user-data'),
        '--extensions-dir',
        path.join(testDataPath, 'extensions'),
        '--disable-workspace-trust',
        '--skip-welcome',
        '--skip-release-notes'
      ]
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to run VS Code extension tests', error);
    process.exit(1);
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
