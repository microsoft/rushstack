// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.disableAutomock();
import { promisify } from 'node:util';

import webpack, { type Stats, type InputFileSystem, type OutputFileSystem } from 'webpack';
import { Volume } from 'memfs/lib/volume';

import { ModuleMinifierPlugin } from '../ModuleMinifierPlugin.ts';
import { MockMinifier } from './MockMinifier.ts';
import { RecordMetadataPlugin } from './RecordMetadataPlugin.ts';
import { type IModuleMinifier, LocalMinifier } from '@rushstack/module-minifier';

jest.setTimeout(1e9);

async function multipleRuntimesTest(minifier: IModuleMinifier): Promise<void> {
  const memoryFileSystem: Volume = new Volume();
  memoryFileSystem.fromJSON(
    {
      '/package.json': '{}',
      // Removed unnecessary webpackExports magic comments from dynamic imports
      '/entry-1.js': `// A comment\nconsole.log("Do stuff");\nimport(/* webpackChunkName: 'async-1' */ './async.js').then(mod => mod.async1());\nimport(/* webpackChunkName: 'async-1' */ './async-1.js').then(mod => mod.async1());`,
      '/entry-2.js': `// A comment\nconsole.log("Do stuff");\nimport(/* webpackChunkName: 'async-2' */ './async.js').then(mod => mod.a2());\nimport(/* webpackChunkName: 'async-2' */ './async-2.js').then(mod => mod.a2());`,
      '/async.js': `// @license MIT\nexport { async1 } from './async-1';\nexport { a2 } from './async-2';`,
      '/async-1.js': `// @license BAR\nexport function async1() { console.log('async-1'); }`,
      '/async-2.js': `// @license BAZ\nexport function a2() { console.log('async-2'); }`
    },
    '/src'
  );

  const minifierPlugin: ModuleMinifierPlugin = new ModuleMinifierPlugin({
    minifier
  });
  const metadataPlugin: RecordMetadataPlugin = new RecordMetadataPlugin();

  const compiler: webpack.Compiler = webpack({
    entry: {
      entry1: '/entry-1.js',
      entry2: '/entry-2.js'
    },
    output: {
      path: '/release',
      filename: '[name].js'
    },
    optimization: {
      minimizer: []
    },
    context: '/',
    mode: 'production',
    plugins: [minifierPlugin, metadataPlugin]
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
  expect(metadataPlugin.metadata).toMatchSnapshot('Metadata');
}

describe(ModuleMinifierPlugin.name, () => {
  it('Handles multiple runtimes (mock)', async () => {
    await multipleRuntimesTest(new MockMinifier());
  });

  it('Handles multiple runtimes (terser)', async () => {
    await multipleRuntimesTest(
      new LocalMinifier({
        terserOptions: {
          mangle: true,
          ecma: 2020
        }
      })
    );
  });
});
