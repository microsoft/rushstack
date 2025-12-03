// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.disableAutomock();
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import webpack, { type Compiler, type Stats } from 'webpack';
import { Volume } from 'memfs/lib/volume';

import { LocalizationPlugin } from '../LocalizationPlugin';
import type { ILocalizationPluginOptions } from '../interfaces';
import { MemFSPlugin } from './MemFSPlugin';

async function testLocalizedNoAsyncInner(minimize: boolean): Promise<void> {
  const memoryFileSystem: Volume = new Volume();
  memoryFileSystem.fromJSON(
    {
      '/a/package.json': '{ "name": "a", "sideEffects": ["entry.js"] }',
      '/a/entry.js': `import strings1 from './strings1.resjson'; import strings2 from './strings2.resjson'; console.log(strings1.test, strings2.another);`,
      '/a/strings1.resjson': JSON.stringify({
        test: 'blah\r\n\t\\\'"',
        '_test.comment': 'A string'
      }),
      '/a/strings2.resjson': `{"another":"something else","_another.comment":"Another string"}`
    },
    '/'
  );

  let compilationInStats: webpack.Compilation | undefined;
  const resJsonLoader: string = resolve(__dirname, '../loaders/resjson-loader.js');
  const options: ILocalizationPluginOptions = {
    localizedData: {
      defaultLocale: {
        localeName: 'LOCALE1',
        fillMissingTranslationStrings: true
      },
      translatedStrings: {
        LOCALE2: {
          '/a/strings1.resjson': {
            test: `return:\r,newline:\n,tab:\t,backslash:\\,apos:',quote:"`
          }
        }
      },
      passthroughLocale: {
        passthroughLocaleName: 'default',
        usePassthroughLocale: true
      },
      pseudolocales: {
        'qps-ploc': {
          prepend: '!--',
          append: '-|-'
        }
      }
    },
    localizationStats: {
      dropPath: 'localization-stats.json',
      callback: (stats, compilation) => {
        compilationInStats = compilation;
      }
    },
    realContentHash: true
  };

  const localizationPlugin: LocalizationPlugin = new LocalizationPlugin(options);

  const compiler: Compiler = webpack({
    devtool: 'hidden-source-map',
    entry: {
      main: '/a/entry.js'
    },
    output: {
      path: '/release',
      filename: '[name]-[locale]-[contenthash].js',
      devtoolModuleFilenameTemplate: (info: { resourcePath: string }) => {
        // On Windows the path contains backslashes because webpack doesn't normalize to platform agnostic paths.
        // Also strangely we get `/` instead of `./` at the start of the path.
        return `source:///${info.resourcePath?.replace(/\\/g, '/').replace(/^\//, './')}`;
      }
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

  expect(compilationInStats).toBeDefined();
  expect(compilationInStats).toBeInstanceOf(webpack.Compilation);
}

describe(LocalizationPlugin.name, () => {
  it('Handles localized compilation with no async chunks (unminified)', async () => {
    await testLocalizedNoAsyncInner(false);
  });

  it('Handles localized compilation with no async chunks (minified)', async () => {
    await testLocalizedNoAsyncInner(true);
  });
});
