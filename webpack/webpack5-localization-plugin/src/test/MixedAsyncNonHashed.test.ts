// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.disableAutomock();
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import webpack, { type Compiler, type Stats } from 'webpack';
import { Volume } from 'memfs/lib/volume';

import { LocalizationPlugin } from '../LocalizationPlugin';
import type { ILocalizationPluginOptions, ILocalizationStats } from '../interfaces';
import { MemFSPlugin } from './MemFSPlugin';

async function testMixedAsyncInner(minimize: boolean): Promise<void> {
  const memoryFileSystem: Volume = new Volume();
  memoryFileSystem.fromJSON(
    {
      '/a/package.json': '{ "name": "a", "sideEffects": ["entry.js", "async.js", "asyncLoc.js"] }',
      '/a/async1.js': `console.log("blah1");`,
      '/a/async2.js': `console.log("blah2");`,
      '/a/asyncLoc1.js': `import strings1 from './strings1.loc.json'; import strings2 from './strings2.loc.json'; console.log(strings1.test, strings2.another);`,
      '/a/asyncLoc2.js': `import strings1 from './strings1.loc.json'; import strings2 from './strings2.loc.json'; console.log(strings1.test + strings2.another);`,
      '/a/entry.js': `import(/* webpackChunkName: 'asyncLoc1' */ './asyncLoc1');import(/* webpackChunkName: 'asyncLoc2' */ './asyncLoc2');import(/* webpackChunkName: 'async1' */ './async1');import(/* webpackChunkName: 'async2' */ './async2');`,
      '/a/strings1.loc.json': `{"test":{"value":"blah","comment":"A string"}}`,
      '/a/strings2.loc.json': `{"another":{"value":"something else","comment":"Another string" }}`
    },
    '/'
  );

  let localizationStats: ILocalizationStats | undefined;
  function statsCallback(stats: ILocalizationStats): void {
    localizationStats = stats;
  }

  const loader: string = resolve(__dirname, '../loaders/locjson-loader.js');
  const options: ILocalizationPluginOptions = {
    localizedData: {
      defaultLocale: {
        localeName: 'LOCALE1'
      },
      translatedStrings: {
        LOCALE2: {
          '/a/strings1.loc.json': {
            test: 'baz'
          },
          '/a/strings2.loc.json': {
            another: 'some random translation'
          }
        }
      }
    },
    localizationStats: {
      callback: statsCallback
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
      filename: '[name]-[locale].js',
      chunkFilename: 'chunks/[name]-[locale].js'
    },
    module: {
      rules: [
        {
          test: /\.loc.json$/,
          use: {
            loader
          },
          type: 'javascript/esm',
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

  expect(errors).toHaveLength(0);
  expect(warnings).toHaveLength(0);
}

describe(LocalizationPlugin.name, () => {
  it('Handles async localized and non-localized chunks with a runtime locale expression and without an asset filename hash (unminified)', async () => {
    await testMixedAsyncInner(false);
  });

  it('Handles async localized and non-localized chunks with a runtime locale expression and without an asset filename hash (minified)', async () => {
    await testMixedAsyncInner(true);
  });
});
