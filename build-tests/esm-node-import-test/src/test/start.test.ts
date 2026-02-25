// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ChildProcess } from 'node:child_process';

import { Executable, PackageJsonLookup } from '@rushstack/node-core-library';

describe('ESM Node Import Test', () => {
  it('should resolve @rushstack/node-core-library correctly under Node.js ESM', async () => {
    const buildFolderPath: string | undefined = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname);
    if (!buildFolderPath) {
      throw new Error('Unable to determine build folder path for test script.');
    }

    // Use --no-warnings to suppress MODULE_TYPELESS_PACKAGE_JSON warnings that Node.js 22+
    // emits when loading .js files via the "import" exports condition from a package without
    // "type": "module". This warning is expected and doesn't indicate a failure.
    const result: ChildProcess = Executable.spawn(
      process.execPath,
      ['--no-warnings', `${buildFolderPath}/lib-esm/start.js`],
      {
        currentWorkingDirectory: buildFolderPath
      }
    );

    const { stderr, stdout, exitCode, signal } = await Executable.waitForExitAsync(result, {
      encoding: 'utf8'
    });

    expect(stderr).toBe('');
    expect(stdout).toMatchSnapshot();
    expect(exitCode).toBe(0);
    expect(signal).toBeNull();
  });
});
