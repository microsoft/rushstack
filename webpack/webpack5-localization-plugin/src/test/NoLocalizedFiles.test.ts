// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.disableAutomock();
import { promisify } from 'node:util';

import webpack, { type Stats } from 'webpack';
import { Volume } from 'memfs/lib/volume';

import { LocalizationPlugin } from '../LocalizationPlugin.ts';
import { MemFSPlugin } from './MemFSPlugin.ts';

async function testNonLocalizedInner(minimize: boolean): Promise<void> {
  const memoryFileSystem: Volume = new Volume();
  memoryFileSystem.fromJSON(
    {
      '/package.json': '{}',
      '/entrySingleChunk.js': `console.log("Do stuff");import(/* webpackChunkName: 'async1' */ './async1.js').then(mod => mod.foo());`,
      '/entryTwoChunks.js': `console.log("Do stuff");import(/* webpackChunkName: 'async1' */ './async1.js').then(mod => mod.foo());import(/* webpackChunkName: 'async2' */ './async2.js').then(mod => mod.foo());`,
      '/async1.js': `export function foo() { console.log('foo1'); }`,
      '/async2.js': `export function foo() { console.log('foo2'); }`
    },
    '/src'
  );

  const localizationPlugin: LocalizationPlugin = new LocalizationPlugin({
    localizedData: {
      defaultLocale: {
        localeName: 'LOCALE1'
      },
      translatedStrings: {}
    },
    realContentHash: true
  });

  const compiler: webpack.Compiler = webpack({
    entry: {
      mainSingleChunk: '/entrySingleChunk.js',
      mainTwoChunks: '/entryTwoChunks.js'
    },
    output: {
      path: '/release',
      filename: '[name]-[locale]-[contenthash].js'
    },
    context: '/',
    optimization: {
      minimize,
      moduleIds: 'named'
    },
    mode: 'production',
    plugins: [localizationPlugin, new MemFSPlugin(memoryFileSystem)]
  });

  const stats: Stats | undefined = await promisify(compiler.run.bind(compiler))();
  await promisify(compiler.close.bind(compiler))();
  if (!stats) {
    throw new Error(`Expected stats`);
  }
  const { errors, warnings } = stats.toJson('errors-warnings');
  expect(errors).toMatchSnapshot('Errors');
  expect(warnings).toMatchSnapshot('Warnings');

  const results: {} = memoryFileSystem.toJSON('/release');
  expect(results).toMatchSnapshot('Content');

  expect(errors).toHaveLength(0);
  expect(warnings).toHaveLength(0);
}

describe(LocalizationPlugin.name, () => {
  it('Handles non-localized compilations (unminified)', async () => {
    await testNonLocalizedInner(false);
  });

  it('Handles non-localized compilations (minified)', async () => {
    await testNonLocalizedInner(true);
  });
});
