// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.disableAutomock();
import { promisify } from 'node:util';
import * as vm from 'node:vm';

import webpack, {
  type Chunk,
  type Compilation,
  type InputFileSystem,
  type OutputFileSystem,
  type Stats
} from 'webpack';
import { Volume } from 'memfs/lib/volume';

import {
  LocalMinifier,
  type IModuleMinificationRequest,
  type IModuleMinifier
} from '@rushstack/module-minifier';

import { ModuleMinifierPlugin } from '../ModuleMinifierPlugin';
import { MockMinifier } from './MockMinifier';

jest.setTimeout(30_000);

interface IBuildResult {
  files: Record<string, string>;
  compilation: Compilation;
  runtimeChunk: Chunk;
  runtimeFilename: string;
}

interface ISourceMap {
  file: string;
  sources: string[];
  mappings: string;
}

async function buildAsync(minifier: IModuleMinifier, sourceMap: boolean = false): Promise<IBuildResult> {
  const fileSystem: Volume = new Volume();
  fileSystem.fromJSON({
    '/package.json': '{}',
    '/entry.js': "import(/* webpackChunkName: 'lazy' */ './lazy.js').then(mod => console.log(mod.value));",
    '/lazy.js': 'export const value = 42;'
  });
  const compiler: webpack.Compiler = webpack({
    mode: 'production',
    context: '/',
    entry: { entry: '/entry.js' },
    output: {
      path: '/release',
      publicPath: '/',
      globalObject: 'self',
      filename: '[name].[contenthash:8].js',
      chunkFilename: '[name].[contenthash:8].js'
    },
    devtool: sourceMap ? 'source-map' : false,
    optimization: {
      minimizer: [],
      runtimeChunk: { name: 'runtime' }
    },
    plugins: [new ModuleMinifierPlugin({ minifier, sourceMap })]
  });
  compiler.inputFileSystem = fileSystem as unknown as InputFileSystem;
  compiler.outputFileSystem = fileSystem as unknown as OutputFileSystem;
  try {
    const stats: Stats | undefined = await promisify(compiler.run.bind(compiler))();
    if (!stats || stats.hasErrors() || stats.hasWarnings()) {
      throw new Error(stats?.toString('errors-warnings') ?? 'Expected webpack stats.');
    }

    const files: Record<string, string> = {};
    for (const filename of Object.keys(fileSystem.toJSON('/release'))) {
      files[filename.slice('/release/'.length)] = fileSystem.readFileSync(filename, 'utf8').toString();
    }

    const { compilation } = stats;
    const runtimeChunk: Chunk = compilation.namedChunks.get('runtime')!;
    const runtimeFilename: string = Object.keys(files).find(
      (filename: string): boolean => filename.startsWith('runtime.') && filename.endsWith('.js')
    )!;
    return { files, compilation, runtimeChunk, runtimeFilename };
  } finally {
    await promisify(compiler.close.bind(compiler))();
  }
}

describe(ModuleMinifierPlugin.name, () => {
  it('submits a separate runtime with no JavaScript modules to the minifier', async (): Promise<void> => {
    const minifier: MockMinifier = new MockMinifier();
    const { files, compilation, runtimeChunk, runtimeFilename } = await buildAsync(minifier);

    expect(
      compilation.chunkGraph.getChunkModulesIterableBySourceType(runtimeChunk, 'javascript')
    ).toBeUndefined();
    expect(compilation.chunkGraph.getNumberOfRuntimeModules(runtimeChunk)).toBeGreaterThan(0);
    expect(runtimeChunk.hasRuntime()).toBe(true);
    expect(
      [...minifier.requests.values()].some((code: string): boolean => code.includes('webpackBootstrap'))
    ).toBe(true);
    expect(files[runtimeFilename]).toContain('// Begin Asset Hash=');
  });

  it.each([false, true])(
    'minifies and executes the runtime and async chunk (sourceMap=%s)',
    async (sourceMap: boolean): Promise<void> => {
      const minifier: LocalMinifier = new LocalMinifier({
        terserOptions: { ecma: 2020, compress: { passes: 2 } }
      });
      const spy: jest.SpyInstance<
        ReturnType<LocalMinifier['minify']>,
        Parameters<LocalMinifier['minify']>
      > = jest.spyOn(minifier, 'minify');
      const { files, runtimeFilename } = await buildAsync(minifier, sourceMap);
      const runtimeRequest: IModuleMinificationRequest | undefined = spy.mock.calls
        .map((call: Parameters<LocalMinifier['minify']>): IModuleMinificationRequest => call[0])
        .find((request: IModuleMinificationRequest): boolean => request.code.includes('webpackBootstrap'));

      expect(runtimeRequest).toBeDefined();
      expect(files[runtimeFilename]).not.toContain('webpackBootstrap');
      expect(Buffer.byteLength(files[runtimeFilename]!)).toBeLessThan(
        Buffer.byteLength(runtimeRequest!.code) * 0.75
      );

      if (sourceMap) {
        const map: ISourceMap = JSON.parse(files[`${runtimeFilename}.map`]!);
        const { file, sources, mappings } = map;
        expect(file).toBe(runtimeFilename);
        expect(sources.length).toBeGreaterThan(0);
        expect(mappings).not.toBe('');
      } else {
        expect(files[`${runtimeFilename}.map`]).toBeUndefined();
      }

      const messages: unknown[] = [];
      function record(value: unknown): void {
        messages.push(value);
      }

      const context: vm.Context = vm.createContext({ self: {}, console: { log: record } });
      for (const prefix of ['runtime', 'lazy', 'entry']) {
        const filename: string = Object.keys(files).find(
          (name: string): boolean => name.startsWith(`${prefix}.`) && name.endsWith('.js')
        )!;
        new vm.Script(files[filename]!, { filename }).runInContext(context);
      }

      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(messages).toEqual([42]);
    }
  );
});
