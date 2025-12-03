// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { resolve } from 'node:path';
import { promisify } from 'node:util';

import webpack, { type Compiler, type Stats } from 'webpack';
import { Volume } from 'memfs/lib/volume';

import { MemFSPlugin } from './MemFSPlugin';
import type { ILocalizationPluginOptions } from '../interfaces';
import { LocalizationPlugin } from '../LocalizationPlugin';
import { type ITrueHashPluginOptions, TrueHashPlugin } from '../TrueHashPlugin';
import { markEntity } from '../utilities/EntityMarker';

class InjectCustomPlaceholderPlugin implements webpack.WebpackPluginInstance {
  private readonly _localizationPlugin: LocalizationPlugin;
  private readonly _localizedChunkNameByLocaleName: Map<string, Record<string, string>>;

  public constructor(
    localizationPlugin: LocalizationPlugin,
    localizedChunkNameByLocaleName: Map<string, Record<string, string>>
  ) {
    this._localizationPlugin = localizationPlugin;
    this._localizedChunkNameByLocaleName = localizedChunkNameByLocaleName;
  }

  public apply(compiler: Compiler): void {
    const PLUGIN_NAME: 'inject-custom-placeholder' = 'inject-custom-placeholder';
    const printLocalizedChunkName: 'printLocalizedChunkName' = 'printLocalizedChunkName';

    const { runtime, RuntimeModule, Template, RuntimeGlobals } = compiler.webpack;
    const localizationPlugin: LocalizationPlugin = this._localizationPlugin;
    const localizedChunkNameByLocaleName: Map<string, Record<string, string>> = this
      ._localizedChunkNameByLocaleName;

    function getLocalizedChunkNamesString(locale: string): string {
      return `/* ${locale} */ ${JSON.stringify(localizedChunkNameByLocaleName.get(locale))}`;
    }

    class GetIntegrityHashRuntimeModule extends RuntimeModule {
      public constructor() {
        super('custom data module', -10);
        this.fullHash = true;
      }

      public override generate(): string {
        const placeholder: string = localizationPlugin.getCustomDataPlaceholderForValueFunction(
          getLocalizedChunkNamesString,
          printLocalizedChunkName
        );

        return Template.asString([
          `var localizedChunkNames = ${placeholder};`,
          `function ${printLocalizedChunkName}(chunkId) {`,
          Template.indent([`console.log(localizedChunkNames[chunkId]);`]),
          `}`
        ]);
      }

      public override shouldIsolate(): boolean {
        return false;
      }
    }

    compiler.hooks.thisCompilation.tap({ name: PLUGIN_NAME, stage: 10 }, (compilation, data) => {
      runtime.LoadScriptRuntimeModule.getCompilationHooks(compilation).createScript.tap(
        PLUGIN_NAME,
        (originalSource): string => {
          return Template.asString([originalSource, '', `${printLocalizedChunkName}(chunkId);`]);
        }
      );

      function integrityHandler(chunk: webpack.Chunk, set: Set<string>): void {
        markEntity(chunk, true);
        set.add(printLocalizedChunkName);
      }

      compilation.hooks.runtimeRequirementInTree
        .for(printLocalizedChunkName)
        .tap(PLUGIN_NAME, (chunk: webpack.Chunk, set: Set<string>) => {
          compilation.addRuntimeModule(chunk, new GetIntegrityHashRuntimeModule());
          return true;
        });
      compilation.hooks.runtimeRequirementInTree
        .for(RuntimeGlobals.loadScript)
        .tap(PLUGIN_NAME, integrityHandler);
      compilation.hooks.runtimeRequirementInTree
        .for(RuntimeGlobals.preloadChunkHandlers)
        .tap(PLUGIN_NAME, integrityHandler);
    });
  }
}

export function runTests(trueHashPluginOptions: ITrueHashPluginOptions = {}): void {
  async function testLocalizedRuntimeInner(minimize: boolean): Promise<void> {
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

    const trueHashPlugin: TrueHashPlugin = new TrueHashPlugin(trueHashPluginOptions);

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
      }
    };

    const localizationPlugin: LocalizationPlugin = new LocalizationPlugin(options);

    const localizedChunkNameByLocaleName: Map<string, Record<string, string>> = new Map([
      ['LOCALE1', { async1: 'async1-LOCALE1-123456', async2: 'async2-LOCALE1-123456' }],
      ['LOCALE2', { async1: 'async1-LOCALE2-abcdef', async2: 'async2-LOCALE2-abcdef' }]
    ]);

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
            type: 'javascript/esm',
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
      plugins: [
        localizationPlugin,
        new InjectCustomPlaceholderPlugin(localizationPlugin, localizedChunkNameByLocaleName),
        trueHashPlugin,
        new MemFSPlugin(memoryFileSystem)
      ]
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
    it('Handles async localized chunks (unminified)', async () => {
      await testLocalizedRuntimeInner(false);
    });

    it('Handles async localized chunks (minified)', async () => {
      await testLocalizedRuntimeInner(true);
    });
  });
}
