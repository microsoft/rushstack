// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.disableAutomock();
import { resolve } from 'path';
import { promisify } from 'util';

import webpack, { Compiler, Stats } from 'webpack';
import { Volume } from 'memfs/lib/volume';

import { LocalizationPlugin } from '../LocalizationPlugin';
import type { ILocalizationPluginOptions, ILocalizationStats } from '../interfaces';
import { MemFSPlugin } from './MemFSPlugin';

async function testLocalizedAsyncDynamicInner(minimize: boolean): Promise<void> {
  const memoryFileSystem: Volume = new Volume();
  memoryFileSystem.fromJSON(
    {
      '/a/package.json': '{ "name": "a", "sideEffects": ["entry.js", "async.js"] }',
      '/a/async.js': `import strings1 from './strings1.resjson'; import strings2 from './strings2.resjson'; console.log(strings1.test, strings2.another);`,
      '/a/entry.js': `import(/* webpackChunkName: 'async' */ './async');`,
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
        localeName: 'en-us'
      },
      translatedStrings: {
        foo: {
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
      main: '/a/entry.js'
    },
    output: {
      path: '/release',
      filename: '[name]-[locale].js',
      chunkFilename: 'chunks/[name]-[locale].js'
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
      moduleIds: 'named'
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
}

describe(LocalizationPlugin.name, () => {
  it('Handles async localized chunks with a runtime locale expression (unminified)', async () => {
    await testLocalizedAsyncDynamicInner(false);
  });

  it('Handles async localized chunks with a runtime locale expression (minified)', async () => {
    await testLocalizedAsyncDynamicInner(true);
  });
});
