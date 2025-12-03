// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.disableAutomock();
import { promisify } from 'node:util';

import webpack, { type Stats } from 'webpack';
import { Volume } from 'memfs/lib/volume';

import { TrueHashPlugin } from '../TrueHashPlugin';
import { MemFSPlugin } from './MemFSPlugin';

async function testNonLocalizedInner(minimize: boolean): Promise<void> {
  async function getResultsAsync(useTrueHashPlugin: boolean): Promise<{
    errors: webpack.StatsError[] | undefined;
    warnings: webpack.StatsError[] | undefined;
    results: {};
  }> {
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

    const webpackConfig: webpack.Configuration = {
      entry: {
        mainSingleChunk: '/entrySingleChunk.js',
        mainTwoChunks: '/entryTwoChunks.js'
      },
      output: {
        path: '/release',
        filename: '[name].js'
      },
      context: '/',
      optimization: {
        minimize,
        moduleIds: 'named',
        realContentHash: !useTrueHashPlugin
      },
      mode: 'production',
      plugins: [new MemFSPlugin(memoryFileSystem)]
    };

    if (useTrueHashPlugin) {
      webpackConfig.plugins!.push(new TrueHashPlugin());
    }

    const trueHashPluginCompiler: webpack.Compiler = webpack(webpackConfig);
    const trueHashPluginStats: Stats | undefined = await promisify(
      trueHashPluginCompiler.run.bind(trueHashPluginCompiler)
    )();
    await promisify(trueHashPluginCompiler.close.bind(trueHashPluginCompiler))();
    if (!trueHashPluginStats) {
      throw new Error(`Expected stats`);
    }
    const { errors, warnings } = trueHashPluginStats.toJson('errors-warnings');

    const results: {} = memoryFileSystem.toJSON('/release');
    return { errors, warnings, results };
  }

  const [
    { errors: realContentHashErrors, warnings: realContentHashWarnings, results: realContentHashResults },
    { errors: trueHashPluginErrors, warnings: trueHashPluginWarnings, results: trueHashPluginResults }
  ] = await Promise.all([getResultsAsync(false), getResultsAsync(true)]);

  expect(trueHashPluginErrors).toMatchSnapshot('Errors');
  expect(trueHashPluginWarnings).toMatchSnapshot('Warnings');

  expect(trueHashPluginResults).toMatchSnapshot('Content');

  expect(trueHashPluginErrors).toEqual(realContentHashErrors);
  expect(trueHashPluginWarnings).toEqual(realContentHashWarnings);
  expect(realContentHashResults).toEqual(realContentHashResults);

  expect(trueHashPluginErrors).toHaveLength(0);
  expect(trueHashPluginWarnings).toHaveLength(0);
}

describe(TrueHashPlugin.name, () => {
  it('Handles non-localized non-hashed compilations (unminified)', async () => {
    await testNonLocalizedInner(false);
  });

  it('Handles non-localized non-hashed compilations (minified)', async () => {
    await testNonLocalizedInner(true);
  });
});
