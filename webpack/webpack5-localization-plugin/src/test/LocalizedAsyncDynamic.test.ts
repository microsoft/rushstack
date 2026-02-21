// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.disableAutomock();
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import webpack, { type Compiler, type Stats } from 'webpack';
import { Volume } from 'memfs/lib/volume';

import { LocalizationPlugin } from '../LocalizationPlugin.ts';
import type { ILocalizationPluginOptions, ILocalizationStats } from '../interfaces.ts';
import { MemFSPlugin } from './MemFSPlugin.ts';

async function testLocalizedAsyncDynamicInner(minimize: boolean): Promise<void> {
  const memoryFileSystem: Volume = new Volume();
  memoryFileSystem.fromJSON(
    {
      '/a/package.json': '{ "name": "a", "sideEffects": ["entry.js", "async.js"] }',
      '/a/async1.js': `import strings1 from './strings1.resjson'; import strings2 from './strings2.resjson'; console.log(strings1.test, strings2.another);`,
      '/a/async2.js': `import strings1 from './strings1.resjson'; import strings2 from './strings2.resjson'; console.log(strings1.test + strings2.another);`,
      '/a/entrySingleChunk.js': `import(/* webpackChunkName: 'async1' */ './async1');`,
      '/a/entryTwoChunks.js': `import(/* webpackChunkName: 'async1' */ './async1');import(/* webpackChunkName: 'async2' */ './async2');`,
      '/a/strings1.resjson': `{"test":"blah","_test.comment":"A string"}`,
      '/a/strings2.resjson': `{"another":"something else","_another.comment":"Another string"}`
    },
    '/'
  );

  let localizationStats: ILocalizationStats | undefined;
  function statsCallback(stats: ILocalizationStats): void {
    localizationStats = stats;
  }

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
          },
          '/a/strings2.resjson': {
            another: 'some random translation'
          }
        }
      }
    },
    runtimeLocaleExpression: 'self.__locale',
    localizationStats: {
      callback: statsCallback
    }
  };

  const localizationPlugin: LocalizationPlugin = new LocalizationPlugin(options);

  const compiler: Compiler = webpack({
    entry: {
      mainSingleChunk: '/a/entrySingleChunk.js',
      mainTwoChunks: '/a/entryTwoChunks.js'
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
    optimization: {
      minimize,
      moduleIds: 'named',
      realContentHash: false
    },
    context: '/',
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

  expect(localizationStats).toMatchSnapshot('Localization Stats');

  expect(errors).toHaveLength(0);
  expect(warnings).toHaveLength(0);
}

describe(LocalizationPlugin.name, () => {
  it('Handles async localized chunks with a runtime locale expression (unminified)', async () => {
    await testLocalizedAsyncDynamicInner(false);
  });

  it('Handles async localized chunks with a runtime locale expression (minified)', async () => {
    await testLocalizedAsyncDynamicInner(true);
  });
});
