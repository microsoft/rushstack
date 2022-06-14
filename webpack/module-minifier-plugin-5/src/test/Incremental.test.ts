jest.disableAutomock();
import { promisify } from 'util';

import webpack, { Stats } from 'webpack';
import { Volume } from 'memfs/lib/volume';

import { IModuleMinifier, LocalMinifier } from '@rushstack/module-minifier';

import { ModuleMinifierPlugin } from '../ModuleMinifierPlugin';
import { MockMinifier } from './MockMinifier';
import { RecordMetadataPlugin } from './RecordMetadataPlugin';

jest.setTimeout(1e9);

async function incrementalCompileTest(minifier: IModuleMinifier): Promise<void> {
  const memoryFileSystem: Volume = new Volume();
  memoryFileSystem.fromJSON(
    {
      '/foo/package.json': '{}',
      '/foo/lib/entry.js': `// A comment\nconsole.log("Do stuff");import(/* webpackChunkName: 'async' */ './async.js').then(mod => mod.foo());`,
      '/foo/lib/async.js': `// @license MIT\nimport bar from 'bar';\nimport baz from 'baz';\nexport function foo() { bar.a(); baz.b(); }`
    },
    '/'
  );

  await incrementalCompilerTestInternal(memoryFileSystem, minifier);
  // Alter file system
  memoryFileSystem.writeFileSync(
    '/foo/lib/async.js',
    `// @lic OtherLicense\nimport { something } from 'bar';\nexport function foo() { something(); }`
  );
  await incrementalCompilerTestInternal(memoryFileSystem, minifier);
}

async function incrementalCompilerTestInternal(fs: Volume, minifier: IModuleMinifier): Promise<void> {
  const minifierPlugin: ModuleMinifierPlugin = new ModuleMinifierPlugin({
    minifier
  });
  const metadataPlugin: RecordMetadataPlugin = new RecordMetadataPlugin();

  const compiler: webpack.Compiler = webpack({
    entry: {
      main: '/foo/lib/entry.js'
    },
    cache: {
      cacheDirectory: '/cache',
      type: 'filesystem'
    },
    output: {
      path: '/release',
      filename: '[name].js',
      libraryTarget: 'amd'
    },
    externals: {
      bar: {
        amd: 'bar'
      },
      baz: {
        amd: 'baz'
      }
    },
    optimization: {
      minimizer: []
    },
    context: '/',
    mode: 'production',
    plugins: [minifierPlugin, metadataPlugin]
  });

  compiler.inputFileSystem = fs;
  compiler.outputFileSystem = fs;

  const stats: Stats | undefined = await promisify(compiler.run.bind(compiler))();
  await promisify(compiler.close.bind(compiler));
  if (!stats) {
    throw new Error(`Expected stats`);
  }
  const { errors, warnings } = stats.toJson('errors-warnings');
  expect(errors).toMatchSnapshot('Errors');
  expect(warnings).toMatchSnapshot('Warnings');

  const results: {} = fs.toJSON('/release');
  expect(results).toMatchSnapshot('Content');
  expect(metadataPlugin.metadata).toMatchSnapshot('Metadata');
}

describe(ModuleMinifierPlugin.name, () => {
  it('Handles Incremental Compilation (mock)', async () => {
    await incrementalCompileTest(new MockMinifier());
  });

  it('Handles Incremental Compilation (terser)', async () => {
    await incrementalCompileTest(
      new LocalMinifier({
        terserOptions: {
          mangle: true,
          ecma: 2020
        }
      })
    );
  });
});
