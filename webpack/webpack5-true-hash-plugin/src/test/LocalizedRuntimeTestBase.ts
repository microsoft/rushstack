// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { promisify } from 'util';

import webpack, { type Compiler, type Stats } from 'webpack';
import { Volume } from 'memfs/lib/volume';
import { LocalizationPlugin } from '@rushstack/webpack5-localization-plugin';
import { Import } from '@rushstack/node-core-library';

import { type ITrueHashPluginOptions, TrueHashPlugin } from '../TrueHashPlugin';
import { MemFSPlugin } from './MemFSPlugin';

export function runTests(trueHashPluginOptions: ITrueHashPluginOptions = {}): void {
  async function testLocalizedRuntimeInner(minimize: boolean): Promise<void> {
    const memoryFileSystem: Volume = new Volume();
    memoryFileSystem.fromJSON(
      {
        '/a/package.json': '{ "name": "a", "sideEffects": ["entry.js", "async.js"] }',
        '/a/async1.js': `import strings1 from './strings1.resjson'; import strings2 from './strings2.resjson'; console.log(strings1.test, strings2.another);`,
        '/a/async2.js': `import strings1 from './strings1.resjson'; import strings2 from './strings2.resjson'; console.log(strings1.test + strings2.another);`,
        '/a/entry.js': `import(/* webpackChunkName: 'async1' */ './async1');import(/* webpackChunkName: 'async2' */ './async2');`,
        '/a/strings1.resjson': `{"test":"blah","_test.comment":"A string"}`,
        '/a/strings2.resjson': `{"another":"something else","_another.comment":"Another string"}`
      },
      '/'
    );

    const trueHashPlugin: TrueHashPlugin = new TrueHashPlugin(trueHashPluginOptions);

    const resJsonLoader: string = Import.resolveModule({
      modulePath: '@rushstack/webpack5-localization-plugin/lib/loaders/resjson-loader.js',
      baseFolderPath: __dirname
    });
    const localizationPlugin: LocalizationPlugin = new LocalizationPlugin({
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
      }
    });

    const compiler: Compiler = webpack({
      entry: {
        main: '/a/entry.js'
      },
      output: {
        path: '/release',
        filename: '[name]_[locale]_[contenthash].js',
        chunkFilename: 'chunks/[name]_[locale]_[contenthash].js'
      },
      module: {
        rules: [
          {
            test: /\.resjson$/,
            use: {
              loader: resJsonLoader
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
      plugins: [localizationPlugin, trueHashPlugin, new MemFSPlugin(memoryFileSystem)]
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
  }

  describe(TrueHashPlugin.name, () => {
    it('Handles async localized chunks (unminified)', async () => {
      await testLocalizedRuntimeInner(false);
    });

    it('Handles async localized chunks (minified)', async () => {
      await testLocalizedRuntimeInner(true);
    });
  });
}
