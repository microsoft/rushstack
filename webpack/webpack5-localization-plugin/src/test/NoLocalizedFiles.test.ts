// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.disableAutomock();
import { promisify } from 'util';

import webpack, { Stats } from 'webpack';
import { Volume } from 'memfs/lib/volume';

import { LocalizationPlugin } from '../LocalizationPlugin';

async function testNonLocalizedInner(minimize: boolean): Promise<void> {
  const memoryFileSystem: Volume = new Volume();
  memoryFileSystem.fromJSON(
    {
      '/package.json': '{}',
      '/entry.js': `console.log("Do stuff");import(/* webpackChunkName: 'async' */ './async.js').then(mod => mod.foo());`,
      '/async.js': `export function foo() { console.log('foo'); }`
    },
    '/src'
  );

  const localizationPlugin: LocalizationPlugin = new LocalizationPlugin({
    localizedData: {
      defaultLocale: {
        localeName: 'en-us'
      },
      translatedStrings: {}
    }
  });

  const compiler: webpack.Compiler = webpack({
    entry: {
      main: '/entry.js'
    },
    output: {
      path: '/release',
      filename: '[name]-[locale].js'
    },
    context: '/',
    optimization: {
      minimize,
      moduleIds: 'named'
    },
    mode: 'production',
    plugins: [localizationPlugin]
  });

  compiler.inputFileSystem = memoryFileSystem;
  compiler.outputFileSystem = memoryFileSystem;

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
}

describe(LocalizationPlugin.name, () => {
  it('Handles non-localized compilations (unminified)', async () => {
    await testNonLocalizedInner(false);
  });

  it('Handles non-localized compilations (minified)', async () => {
    await testNonLocalizedInner(true);
  });
});
