// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.disableAutomock();
import { promisify } from 'node:util';

import webpack, { type Stats, type InputFileSystem, type OutputFileSystem } from 'webpack';
import { Volume } from 'memfs/lib/volume';

import { type IModuleMinifier, LocalMinifier } from '@rushstack/module-minifier';

import { ModuleMinifierPlugin } from '../ModuleMinifierPlugin';
import { MockMinifier } from './MockMinifier';
import { RecordMetadataPlugin } from './RecordMetadataPlugin';

jest.setTimeout(1e9);

async function amdExternalsTest(minifier: IModuleMinifier): Promise<void> {
  const memoryFileSystem: Volume = new Volume();
  memoryFileSystem.fromJSON(
    {
      '/package.json': '{}',
      '/entry.js': `// A comment\nconsole.log("Do stuff");import(/* webpackChunkName: 'async' */ './async.js').then(mod => mod.foo());`,
      '/async.js': `// @license MIT\nimport bar from 'bar';\nimport baz from 'baz';\nexport function foo() { bar.a(); baz.b(); }console.log("Test character lengths: \ufeff\uffef")`
    },
    '/src'
  );

  const minifierPlugin: ModuleMinifierPlugin = new ModuleMinifierPlugin({
    minifier
  });
  const metadataPlugin: RecordMetadataPlugin = new RecordMetadataPlugin();

  const compiler: webpack.Compiler = webpack({
    entry: {
      main: '/entry.js'
    },
    output: {
      path: '/release',
      filename: '[name].js',
      libraryTarget: 'amd'
    },
    externals: {
      bar: {
        amd: 'bar'
      },
      baz: {
        amd: 'baz'
      }
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
  it('Handles AMD externals (mock)', async () => {
    await amdExternalsTest(new MockMinifier());
  });

  it('Handles AMD externals (terser)', async () => {
    await amdExternalsTest(
      new LocalMinifier({
        terserOptions: {
          mangle: true,
          ecma: 2020
        }
      })
    );
  });
});
