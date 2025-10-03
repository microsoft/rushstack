// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.disableAutomock();
import { promisify } from 'node:util';

import webpack, { type InputFileSystem, type OutputFileSystem, type Stats } from 'webpack';
import { Volume } from 'memfs/lib/volume';

jest.setTimeout(1e9);

export function testForPlugin(pluginName: string, getPlugin: () => webpack.WebpackPluginInstance): void {
  async function testForLibraryType(
    libraryType: string,
    mode: 'development' | 'production',
    withHash: boolean,
    includePublicPath: boolean
  ): Promise<void> {
    const memoryFileSystem: Volume = new Volume();
    memoryFileSystem.fromJSON(
      {
        '/package.json': '{}',
        '/entry.js': includePublicPath
          ? 'console.log(__webpack_public_path__);'
          : 'console.log("Hello world!");'
      },
      '/src'
    );

    const compiler: webpack.Compiler = webpack({
      mode,
      entry: {
        main: '/entry.js'
      },
      output: {
        path: '/release',
        filename: withHash ? '[name]_[contenthash].js' : '[name].js',
        library: {
          type: libraryType,
          name: 'MyLibrary'
        }
      },
      plugins: [getPlugin()]
    });

    compiler.inputFileSystem = memoryFileSystem as unknown as InputFileSystem;
    compiler.outputFileSystem = memoryFileSystem as unknown as OutputFileSystem;

    const stats: Stats | undefined = await promisify(compiler.run.bind(compiler))();
    await promisify(compiler.close.bind(compiler));
    if (!stats) {
      throw new Error(`Expected stats`);
    }
    const { errors, warnings } = stats.toJson('errors-warnings');
    expect(errors).toMatchSnapshot('Errors');
    expect(warnings).toMatchSnapshot('Warnings');

    const results: {} = memoryFileSystem.toJSON('/release');
    expect(results).toMatchSnapshot('Content');
  }

  describe(pluginName, () => {
    for (const libraryType of [
      'var',
      // 'module',
      'assign',
      'assign-properties',
      'this',
      'window',
      'self',
      'global',
      'commonjs',
      'commonjs2',
      'commonjs-module',
      'commonjs-static',
      'amd',
      // 'amd-require',
      'umd',
      'umd2',
      'jsonp',
      'system'
    ]) {
      it(`Handles ${libraryType} library output (production) (uses public path)`, async () => {
        await testForLibraryType(libraryType, 'production', false, true);
      });

      it(`Handles ${libraryType} library output (production+hash) (uses public path)`, async () => {
        await testForLibraryType(libraryType, 'production', true, true);
      });

      it(`Handles ${libraryType} library output (development) (uses public path)`, async () => {
        await testForLibraryType(libraryType, 'development', false, true);
      });

      it(`Handles ${libraryType} library output (development+hash) (uses public path)`, async () => {
        await testForLibraryType(libraryType, 'development', false, true);
      });

      it(`Handles ${libraryType} library output (production) (doesn't use public path)`, async () => {
        await testForLibraryType(libraryType, 'production', false, false);
      });

      it(`Handles ${libraryType} library output (production+hash) (doesn't use public path)`, async () => {
        await testForLibraryType(libraryType, 'production', true, false);
      });

      it(`Handles ${libraryType} library output (development) (doesn't use public path)`, async () => {
        await testForLibraryType(libraryType, 'development', false, false);
      });

      it(`Handles ${libraryType} library output (development+hash) (doesn't use public path)`, async () => {
        await testForLibraryType(libraryType, 'development', false, false);
      });
    }
  });
}
