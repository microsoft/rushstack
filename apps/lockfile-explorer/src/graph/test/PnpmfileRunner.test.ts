// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import inspector from 'node:inspector';
import { Path } from '@rushstack/node-core-library';
import { PnpmfileRunner } from '../PnpmfileRunner';

const isDebuggerAttached: boolean = inspector.url() !== undefined;

// Since we're spawning another thread, increase the timeout to 10s.
// For debugging, use an infinite timeout.
jest.setTimeout(isDebuggerAttached ? 1e9 : 10000);

describe(PnpmfileRunner.name, () => {
  it('transforms a package.json file', async () => {
    const dirname: string = Path.convertToSlashes(__dirname);
    const libIndex: number = dirname.lastIndexOf('/lib-commonjs/');
    if (libIndex < 0) {
      throw new Error('Unexpected file path');
    }
    const srcDirname: string =
      dirname.substring(0, libIndex) + '/src/' + dirname.substring(libIndex + '/lib-commonjs/'.length);

    const pnpmfilePath: string = srcDirname + '/fixtures/PnpmfileRunner/.pnpmfile.cjs';
    const logMessages: string[] = [];

    const pnpmfileRunner: PnpmfileRunner = new PnpmfileRunner(pnpmfilePath);
    try {
      pnpmfileRunner.logger = (message) => {
        logMessages.push(message);
      };
      expect(
        await pnpmfileRunner.transformPackageAsync(
          {
            name: '@types/karma',
            version: '1.0.0',
            dependencies: {
              'example-dependency': '1.0.0'
            }
          },
          pnpmfilePath
        )
      ).toMatchInlineSnapshot(`
Object {
  "dependencies": Object {
    "example-dependency": "1.0.0",
    "log4js": "0.6.38",
  },
  "name": "@types/karma",
  "version": "1.0.0",
}
`);
    } finally {
      await pnpmfileRunner.disposeAsync();
    }

    expect(logMessages).toMatchInlineSnapshot(`
Array [
  "Fixed up dependencies for @types/karma",
]
`);

    await expect(
      pnpmfileRunner.transformPackageAsync({ name: 'name', version: '1.0.0' }, '')
    ).rejects.toThrow('disposed');
  });
});
