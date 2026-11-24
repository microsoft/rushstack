// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.disableAutomock();
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import webpack, { type Compiler, type Stats, type StatsError } from 'webpack';
import { Volume } from 'memfs/lib/volume';

import { LocalizationPlugin } from '../LocalizationPlugin';
import type { ILocalizationPluginOptions } from '../interfaces';
import { MemFSPlugin } from './MemFSPlugin';

interface ICompileResult {
  errors: StatsError[] | undefined;
  warnings: StatsError[] | undefined;
  assetNames: string[];
}

async function testRebuildWithMemoryCacheInner(minimize: boolean): Promise<void> {
  const memoryFileSystem: Volume = new Volume();
  memoryFileSystem.fromJSON(
    {
      '/a/package.json': '{ "name": "a", "sideEffects": ["entry.js", "other.js", "async.js"] }',
      '/a/async.js': `import strings1 from './strings1.resjson'; console.log(strings1.test);`,
      '/a/other.js': `console.log("other");`,
      '/a/entry.js': `import './other'; import(/* webpackChunkName: 'async' */ './async');`,
      '/a/strings1.resjson': `{"test":"blah","_test.comment":"A string"}`
    },
    '/'
  );

  const resJsonLoader: string = resolve(__dirname, '../loaders/resjson-loader.js');
  const options: ILocalizationPluginOptions = {
    localizedData: {
      defaultLocale: {
        localeName: 'LOCALE1'
      },
      translatedStrings: {
        LOCALE2: {
          '/a/strings1.resjson': {
            test: 'baz'
          }
        }
      }
    },
    realContentHash: true
  };

  const localizationPlugin: LocalizationPlugin = new LocalizationPlugin(options);

  const compiler: Compiler = webpack({
    entry: {
      main: '/a/entry.js'
    },
    output: {
      path: '/release',
      filename: '[name]-[locale]-[contenthash].js',
      chunkFilename: 'chunks/[name]-[locale]-[contenthash].js'
    },
    module: {
      rules: [
        {
          test: /\.resjson$/,
          use: {
            loader: resJsonLoader
          },
          type: 'json',
          sideEffects: false
        }
      ]
    },
    cache: {
      type: 'memory'
    },
    optimization: {
      minimize,
      moduleIds: 'named'
    },
    context: '/',
    mode: 'production',
    plugins: [localizationPlugin, new MemFSPlugin(memoryFileSystem)]
  });

  const run: () => Promise<Stats | undefined> = promisify(compiler.run.bind(compiler));
  async function compileAsync(): Promise<ICompileResult> {
    const stats: Stats | undefined = await run();
    if (!stats) {
      throw new Error(`Expected stats`);
    }

    const { errors, warnings } = stats.toJson('errors-warnings');
    const assetNames: string[] = Array.from(stats.compilation.getAssets(), ({ name }) => name).sort();
    return { errors, warnings, assetNames };
  }

  // The second compilation reuses the localized assets from the memory cache
  const firstResult: ICompileResult = await compileAsync();
  const secondResult: ICompileResult = await compileAsync();
  await promisify(compiler.close.bind(compiler))();

  expect(firstResult.errors).toHaveLength(0);
  expect(firstResult.warnings).toHaveLength(0);
  expect(secondResult.errors).toEqual([]);
  expect(secondResult.warnings).toEqual([]);
  expect(secondResult.assetNames).toEqual(firstResult.assetNames);
}

describe(LocalizationPlugin.name, () => {
  it('Handles a rebuild with the memory cache and realContentHash (unminified)', async () => {
    await testRebuildWithMemoryCacheInner(false);
  });

  it('Handles a rebuild with the memory cache and realContentHash (minified)', async () => {
    await testRebuildWithMemoryCacheInner(true);
  });
});
