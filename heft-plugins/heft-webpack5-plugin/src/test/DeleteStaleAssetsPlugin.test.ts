// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import webpack from 'webpack';
import type { Compilation, Compiler, Configuration, Stats, WebpackPluginInstance } from 'webpack';
import { AsyncParallelHook } from 'tapable';

import { FileSystem } from '@rushstack/node-core-library';
import type {
  HeftConfiguration,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions,
  IHeftTaskSession
} from '@rushstack/heft';
import { MockScopedLogger } from '@rushstack/heft/lib/pluginFramework/logging/MockScopedLogger';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { DeleteStaleAssetsPlugin } from '../DeleteStaleAssetsPlugin';
import Webpack5Plugin, { type IWebpackPluginOptions } from '../Webpack5Plugin';
import type { IWebpackConfiguration } from '../shared';

const OUTPUT_PATH: string = path.resolve('/delete-stale-assets-test/dist');
const TEST_FOLDER: string = path.resolve(__dirname, '../../temp/test/DeleteStaleAssetsPlugin');

function outputPathOf(name: string): string {
  return path.join(OUTPUT_PATH, name);
}

class StubWebpackError extends Error {}

interface IStubAsset {
  name: string;
  hotModuleReplacement?: boolean;
}

interface IEmitResult {
  unlinkedPaths: string[];
  errors: Error[];
  warnings: Error[];
}

interface IStubCompilerOptions {
  outputPath?: string;
  join?: (path1: string, path2: string) => string;
  withoutUnlink?: boolean;
  webpackVersion?: string;
}

interface IStubCompiler {
  compiler: Compiler;
  terminalProvider: StringBufferTerminalProvider;
  unlinkErrorCodes: Map<string, string>;
  getEmitTapOptions(): unknown;
  emitAsync(assets: (string | IStubAsset)[], hasErrors?: boolean): Promise<IEmitResult>;
}

function createStubCompiler(options: IStubCompilerOptions = {}): IStubCompiler {
  const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(false);
  const unlinkedPaths: string[] = [];
  const unlinkErrorCodes: Map<string, string> = new Map();
  let emitTap: ((compilation: Compilation) => Promise<void>) | undefined;
  let emitTapOptions: unknown;

  const outputFileSystem: Partial<NonNullable<Compiler['outputFileSystem']>> = {
    join: options.join,
    unlink: options.withoutUnlink
      ? undefined
      : (filePath: unknown, callback: (error: NodeJS.ErrnoException | null) => void): void => {
          unlinkedPaths.push(filePath as string);
          const code: string | undefined = unlinkErrorCodes.get(filePath as string);
          setImmediate(() => {
            if (code) {
              const error: NodeJS.ErrnoException = new Error(`${code}: ${filePath}`);
              error.code = code;
              callback(error);
            } else {
              callback(null);
            }
          });
        }
  };

  const compiler: Compiler = {
    outputPath: options.outputPath ?? OUTPUT_PATH,
    outputFileSystem,
    hooks: {
      emit: {
        tapPromise: (tapOptions: unknown, fn: (compilation: Compilation) => Promise<void>): void => {
          emitTapOptions = tapOptions;
          emitTap = fn;
        }
      }
    },
    webpack: { version: options.webpackVersion ?? webpack.version, WebpackError: StubWebpackError }
  } as unknown as Compiler;

  new DeleteStaleAssetsPlugin(new Terminal(terminalProvider)).apply(compiler);

  return {
    compiler,
    terminalProvider,
    unlinkErrorCodes,
    getEmitTapOptions: () => emitTapOptions,
    emitAsync: async (assets: (string | IStubAsset)[], hasErrors: boolean = false): Promise<IEmitResult> => {
      const errors: Error[] = [];
      const warnings: Error[] = [];
      const compilation: Compilation = {
        getPath: (filename: string) => filename,
        getAssets: () =>
          assets.map((asset: string | IStubAsset) =>
            typeof asset === 'string'
              ? { name: asset, info: {} }
              : { name: asset.name, info: { hotModuleReplacement: asset.hotModuleReplacement } }
          ),
        getStats: () => ({ hasErrors: () => hasErrors }),
        errors,
        warnings
      } as unknown as Compilation;

      const firstIndex: number = unlinkedPaths.length;
      await emitTap!(compilation);
      return { unlinkedPaths: unlinkedPaths.slice(firstIndex).sort(), errors, warnings };
    }
  };
}

describe(DeleteStaleAssetsPlugin.name, () => {
  it('runs in the emit hook at the stage of webpack CleanPlugin', () => {
    const stub: IStubCompiler = createStubCompiler();
    expect(stub.getEmitTapOptions()).toEqual({ name: 'DeleteStaleAssetsPlugin', stage: 100 });
  });

  it('deletes nothing on the first emit', async () => {
    const stub: IStubCompiler = createStubCompiler();
    expect(await stub.emitAsync(['main.js', '1.js'])).toEqual({
      unlinkedPaths: [],
      errors: [],
      warnings: []
    });
  });

  it('deletes the files that the previous emit had and this emit does not, once', async () => {
    const stub: IStubCompiler = createStubCompiler();
    await stub.emitAsync(['main.js', '1.js', 'nested/2.js', 'index.html']);

    expect((await stub.emitAsync(['main.js', 'index.html'])).unlinkedPaths).toEqual(
      [outputPathOf('1.js'), outputPathOf('nested/2.js')].sort()
    );
    expect((await stub.emitAsync(['main.js', 'index.html'])).unlinkedPaths).toEqual([]);
  });

  it('deletes nothing when files are only added', async () => {
    const stub: IStubCompiler = createStubCompiler();
    await stub.emitAsync(['main.js']);
    expect((await stub.emitAsync(['main.js', '1.js'])).unlinkedPaths).toEqual([]);
    expect((await stub.emitAsync(['main.js'])).unlinkedPaths).toEqual([outputPathOf('1.js')]);
  });

  it('deletes nothing on an emit with errors, and deletes what both emits had on the next emit without errors', async () => {
    const stub: IStubCompiler = createStubCompiler();
    await stub.emitAsync(['main.js', '1.js']);

    expect((await stub.emitAsync(['main.js', '2.js'], true)).unlinkedPaths).toEqual([]);
    expect((await stub.emitAsync(['main.js', '3.js'])).unlinkedPaths).toEqual(
      [outputPathOf('1.js'), outputPathOf('2.js')].sort()
    );
  });

  it('writes a file without its query string or fragment', async () => {
    const stub: IStubCompiler = createStubCompiler();
    await stub.emitAsync(['main.js?v=1', 'style.css#fragment']);
    expect((await stub.emitAsync(['main.js?v=2', 'style.css'])).unlinkedPaths).toEqual([]);
    expect((await stub.emitAsync([])).unlinkedPaths).toEqual(
      [outputPathOf('main.js'), outputPathOf('style.css')].sort()
    );
  });

  it('keeps fragments in output paths for earlier webpack versions', async () => {
    const stub: IStubCompiler = createStubCompiler({ webpackVersion: '5.99.9' });
    await stub.emitAsync(['style.css#fragment']);
    expect((await stub.emitAsync([])).unlinkedPaths).toEqual([outputPathOf('style.css#fragment')]);
  });

  it('never deletes a file that webpack writes outside the output folder', async () => {
    // Webpack writes an asset to the output path joined with its name, with the posix or win32 path rules of
    // the output path. So the file of "./../dot.json" is outside the output folder, and "..json" is in it.
    const posix: IStubCompiler = createStubCompiler({ outputPath: '/stub/dist' });
    await posix.emitAsync([
      'main.js',
      '../manifest.json',
      '../../two-up.json',
      './../dot.json',
      'nested/./../../dot-nested.json',
      'nested/..',
      'nested/../..',
      'nested/../1.js',
      '/absolute/2.js',
      '..json',
      '..\\3.js'
    ]);
    expect((await posix.emitAsync(['main.js'])).unlinkedPaths).toEqual(
      ['/stub/dist/1.js', '/stub/dist/absolute/2.js', '/stub/dist/..json', '/stub/dist/..\\3.js'].sort()
    );

    const win32: IStubCompiler = createStubCompiler({ outputPath: 'C:\\stub\\dist' });
    await win32.emitAsync([
      'main.js',
      '..\\manifest.json',
      '.\\..\\dot.json',
      'C:\\absolute\\windows.js',
      'nested\\..\\1.js',
      'nested/2.js',
      '\\\\server\\share\\3.js'
    ]);
    expect((await win32.emitAsync(['main.js'])).unlinkedPaths).toEqual(
      ['C:\\stub\\dist\\1.js', 'C:\\stub\\dist\\nested\\2.js', 'C:\\stub\\dist\\server\\share\\3.js'].sort()
    );

    // An output file system whose join resolves an absolute name
    const resolving: IStubCompiler = createStubCompiler({
      outputPath: '/stub/dist',
      join: path.posix.resolve
    });
    await resolving.emitAsync(['main.js', '/etc/outside.js', '1.js']);
    expect((await resolving.emitAsync(['main.js'])).unlinkedPaths).toEqual(['/stub/dist/1.js']);
  });

  it('never deletes a hot update file, or a file that the current emit has', async () => {
    const stub: IStubCompiler = createStubCompiler();
    await stub.emitAsync(['main.js', { name: 'main.1.hot-update.js', hotModuleReplacement: true }]);
    expect((await stub.emitAsync(['main.js'])).unlinkedPaths).toEqual([]);

    await stub.emitAsync(['main.js', 'both.js']);
    expect(
      (await stub.emitAsync(['main.js', { name: 'both.js', hotModuleReplacement: true }])).unlinkedPaths
    ).toEqual([]);
  });

  it('ignores a file that is already gone', async () => {
    const stub: IStubCompiler = createStubCompiler();
    stub.unlinkErrorCodes.set(outputPathOf('1.js'), 'ENOENT');
    await stub.emitAsync(['main.js', '1.js']);

    expect(await stub.emitAsync(['main.js'])).toEqual({
      unlinkedPaths: [outputPathOf('1.js')],
      errors: [],
      warnings: []
    });
    expect((await stub.emitAsync(['main.js'])).unlinkedPaths).toEqual([]);
  });

  it('reports a file that it could not delete as an error, and tries again on the next emit', async () => {
    const stub: IStubCompiler = createStubCompiler();
    stub.unlinkErrorCodes.set(outputPathOf('1.js'), 'EACCES');
    await stub.emitAsync(['main.js', '1.js', '2.js']);

    const failed: IEmitResult = await stub.emitAsync(['main.js']);
    expect(failed.unlinkedPaths).toEqual([outputPathOf('1.js'), outputPathOf('2.js')].sort());
    expect(failed.errors).toHaveLength(1);
    expect(failed.errors[0]).toBeInstanceOf(StubWebpackError);
    expect(failed.errors[0].message).toContain(`"${outputPathOf('1.js')}"`);
    expect(failed.errors[0].message).toContain('EACCES');

    stub.unlinkErrorCodes.clear();
    expect(await stub.emitAsync(['main.js'])).toEqual({
      unlinkedPaths: [outputPathOf('1.js')],
      errors: [],
      warnings: []
    });
  });

  it('warns on each emit while the output file system cannot delete a file that the emit does not have', async () => {
    const stub: IStubCompiler = createStubCompiler({ withoutUnlink: true });
    await stub.emitAsync(['main.js', '1.js']);

    const result: IEmitResult = await stub.emitAsync(['main.js']);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain("can't delete files");
    expect((await stub.emitAsync(['main.js'])).warnings).toHaveLength(1);
    expect((await stub.emitAsync(['main.js', '1.js'])).warnings).toEqual([]);
  });

  it("uses the output file system's join", async () => {
    const stub: IStubCompiler = createStubCompiler({
      join: (path1: string, path2: string) => path.join(path1, 'joined', path2)
    });
    await stub.emitAsync(['main.js', '1.js']);
    expect((await stub.emitAsync(['main.js'])).unlinkedPaths).toEqual([outputPathOf('joined/1.js')]);
  });

  it('keeps the state of each compiler separate', async () => {
    const first: IStubCompiler = createStubCompiler();
    const second: IStubCompiler = createStubCompiler();
    await first.emitAsync(['first.js']);
    await second.emitAsync(['second.js']);

    expect((await first.emitAsync([])).unlinkedPaths).toEqual([outputPathOf('first.js')]);
    expect((await second.emitAsync(['second.js'])).unlinkedPaths).toEqual([]);
  });

  it('logs the number of deleted files, and each path in verbose output', async () => {
    const stub: IStubCompiler = createStubCompiler();
    await stub.emitAsync(['main.js', '1.js', '2.js']);
    await stub.emitAsync(['main.js']);

    expect(stub.terminalProvider.getOutput()).toContain(
      'Deleted 2 output file(s) that earlier compilations emitted and this compilation does'
    );
    const verboseOutput: string = stub.terminalProvider.getVerboseOutput();
    expect(verboseOutput).toContain(`Deleted "${outputPathOf('1.js')}"`);
    expect(verboseOutput).toContain(`Deleted "${outputPathOf('2.js')}"`);
  });
});

describe(`${DeleteStaleAssetsPlugin.name} with webpack`, () => {
  // Each test runs several webpack compilations, which can take longer than the default timeout of Jest on a
  // busy machine.
  const TIMEOUT_MS: number = 60_000;
  const ENTRY: string = 'export const value = 1;\n';
  const LAZY_IMPORT: string = "void import(/* webpackChunkName: 'lazy' */ './lazy');\n";
  const MISSING_IMPORT: string = "void import('./missing');\n";

  let modifiedTime: number = Math.floor(Date.now() / 1000) - 100000;

  async function writeSourceAsync(filePath: string, contents: string): Promise<void> {
    await FileSystem.writeFileAsync(filePath, contents, { ensureFolderExists: true });
    // Give each version its own modified time, so that webpack's cache sees every edit.
    modifiedTime += 10;
    FileSystem.updateTimes(filePath, { accessedTime: modifiedTime, modifiedTime });
  }

  async function prepareFolderAsync(name: string): Promise<string> {
    const folder: string = `${TEST_FOLDER}/${name}`;
    await FileSystem.ensureEmptyFolderAsync(folder);
    await writeSourceAsync(`${folder}/src/entry.js`, ENTRY);
    await writeSourceAsync(`${folder}/src/second.js`, "console.log('second');\n");
    await writeSourceAsync(`${folder}/src/lazy.js`, 'export const lazy = 1;\n');
    // Files that were in the output folder before the first compilation, such as another task's output
    await FileSystem.writeFileAsync(`${folder}/dist/other-task.txt`, 'other task\n', {
      ensureFolderExists: true
    });
    await FileSystem.writeFileAsync(`${folder}/dist/lazy.chunk.js`, '// before the first compilation\n');
    return folder;
  }

  function createCompiler(
    folder: string,
    emitOnErrors: boolean,
    otherPlugins: WebpackPluginInstance[] = []
  ): Compiler {
    const configuration: Configuration = {
      mode: 'development',
      devtool: false,
      cache: { type: 'memory' },
      context: folder,
      entry: {
        main: './src/entry.js',
        second: './src/second.js'
      },
      output: {
        path: `${folder}/dist`,
        filename: '[name].js',
        chunkFilename: '[name].chunk.js'
      },
      optimization: { emitOnErrors },
      infrastructureLogging: { level: 'none' },
      plugins: [
        ...otherPlugins,
        new DeleteStaleAssetsPlugin(new Terminal(new StringBufferTerminalProvider(false)))
      ]
    };
    return webpack(configuration);
  }

  async function runAsync(compiler: Compiler): Promise<Stats> {
    return await new Promise((resolve: (stats: Stats) => void, reject: (error: Error) => void) => {
      compiler.run((error: Error | null, stats: Stats | undefined) => {
        if (error) {
          reject(error);
        } else {
          resolve(stats!);
        }
      });
    });
  }

  async function closeAsync(compiler: Compiler): Promise<void> {
    await new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
      compiler.close((error: Error | null | undefined) => (error ? reject(error) : resolve()));
    });
  }

  async function readOutputAsync(folder: string): Promise<string[]> {
    return (await FileSystem.readFolderItemNamesAsync(`${folder}/dist`)).sort();
  }

  it(
    'deletes the chunk of a removed dynamic import and keeps unchanged files and files that it did not emit',
    async () => {
      const folder: string = await prepareFolderAsync('remove-chunk');
      const compiler: Compiler = createCompiler(folder, true);
      try {
        await writeSourceAsync(`${folder}/src/entry.js`, ENTRY + LAZY_IMPORT);
        await runAsync(compiler);
        expect(await readOutputAsync(folder)).toEqual([
          'lazy.chunk.js',
          'main.js',
          'other-task.txt',
          'second.js'
        ]);

        await writeSourceAsync(`${folder}/src/entry.js`, ENTRY);
        const stats: Stats = await runAsync(compiler);
        expect(stats.hasErrors()).toBe(false);
        // Webpack doesn't write an unchanged file again, but it's still one of the compilation's files.
        expect(stats.compilation.emittedAssets.has('second.js')).toBe(false);
        expect(stats.compilation.emittedAssets.has('main.js')).toBe(true);
        expect(await readOutputAsync(folder)).toEqual(['main.js', 'other-task.txt', 'second.js']);
      } finally {
        await closeAsync(compiler);
      }
    },
    TIMEOUT_MS
  );

  it(
    'keeps a file that was in the output folder before the first compilation',
    async () => {
      const folder: string = await prepareFolderAsync('first-compilation');
      const compiler: Compiler = createCompiler(folder, true);
      try {
        await runAsync(compiler);
        expect(await readOutputAsync(folder)).toEqual([
          'lazy.chunk.js',
          'main.js',
          'other-task.txt',
          'second.js'
        ]);

        await writeSourceAsync(`${folder}/src/entry.js`, ENTRY + '// edit\n');
        await runAsync(compiler);
        expect(await readOutputAsync(folder)).toEqual([
          'lazy.chunk.js',
          'main.js',
          'other-task.txt',
          'second.js'
        ]);
        expect(await FileSystem.readFileAsync(`${folder}/dist/lazy.chunk.js`)).toEqual(
          '// before the first compilation\n'
        );
      } finally {
        await closeAsync(compiler);
      }
    },
    TIMEOUT_MS
  );

  it(
    'keeps the files outside the output folder that a plugin emits in the first compilation only',
    async () => {
      const folder: string = await prepareFolderAsync('outside-output-folder');
      // Another task's file, at the path that "./../manifest.json" would have if "." were a folder name
      await FileSystem.writeFileAsync(`${folder}/dist/manifest.json`, 'other task\n');
      let hasEmitted: boolean = false;
      // Like a plugin that writes manifests next to the output folder once per session
      const emitOncePlugin: WebpackPluginInstance = {
        apply: (compiler: Compiler): void => {
          compiler.hooks.thisCompilation.tap('EmitOncePlugin', (compilation: Compilation) => {
            compilation.hooks.processAssets.tap('EmitOncePlugin', () => {
              if (!hasEmitted) {
                hasEmitted = true;
                const { RawSource } = compiler.webpack.sources;
                compilation.emitAsset('../manifests/once.json', new RawSource('{}\n'));
                compilation.emitAsset('./../manifest.json', new RawSource('{}\n'));
                compilation.emitAsset('once.json', new RawSource('{}\n'));
              }
            });
          });
        }
      };
      const compiler: Compiler = createCompiler(folder, true, [emitOncePlugin]);
      try {
        await runAsync(compiler);
        expect(await FileSystem.readFileAsync(`${folder}/manifests/once.json`)).toEqual('{}\n');
        expect(await FileSystem.readFileAsync(`${folder}/manifest.json`)).toEqual('{}\n');
        expect(await readOutputAsync(folder)).toContain('once.json');

        await writeSourceAsync(`${folder}/src/entry.js`, ENTRY + '// edit\n');
        expect((await runAsync(compiler)).hasErrors()).toBe(false);
        expect(await FileSystem.readFileAsync(`${folder}/manifests/once.json`)).toEqual('{}\n');
        expect(await FileSystem.readFileAsync(`${folder}/manifest.json`)).toEqual('{}\n');
        expect(await FileSystem.readFileAsync(`${folder}/dist/manifest.json`)).toEqual('other task\n');
        // As with webpack's output.clean, a file in the output folder that the compilation doesn't emit is
        // deleted.
        expect(await readOutputAsync(folder)).not.toContain('once.json');
      } finally {
        await closeAsync(compiler);
      }
    },
    TIMEOUT_MS
  );

  it(
    'deletes nothing when a compilation with errors emits, and cleans up on the next compilation',
    async () => {
      const folder: string = await prepareFolderAsync('emit-on-errors');
      const compiler: Compiler = createCompiler(folder, true);
      try {
        await writeSourceAsync(`${folder}/src/entry.js`, ENTRY + LAZY_IMPORT);
        await runAsync(compiler);

        await writeSourceAsync(`${folder}/src/entry.js`, ENTRY + MISSING_IMPORT);
        const failed: Stats = await runAsync(compiler);
        expect(failed.hasErrors()).toBe(true);
        expect(failed.compilation.emittedAssets.has('main.js')).toBe(true);
        expect(await readOutputAsync(folder)).toEqual([
          'lazy.chunk.js',
          'main.js',
          'other-task.txt',
          'second.js'
        ]);

        await writeSourceAsync(`${folder}/src/entry.js`, ENTRY);
        expect((await runAsync(compiler)).hasErrors()).toBe(false);
        expect(await readOutputAsync(folder)).toEqual(['main.js', 'other-task.txt', 'second.js']);
      } finally {
        await closeAsync(compiler);
      }
    },
    TIMEOUT_MS
  );

  it(
    'deletes nothing when a compilation with errors does not emit, and cleans up on the next compilation',
    async () => {
      const folder: string = await prepareFolderAsync('no-emit-on-errors');
      const compiler: Compiler = createCompiler(folder, false);
      try {
        await writeSourceAsync(`${folder}/src/entry.js`, ENTRY + LAZY_IMPORT);
        await runAsync(compiler);

        await writeSourceAsync(`${folder}/src/entry.js`, ENTRY + MISSING_IMPORT);
        const failed: Stats = await runAsync(compiler);
        expect(failed.hasErrors()).toBe(true);
        expect(failed.compilation.emittedAssets.size).toBe(0);
        expect(await readOutputAsync(folder)).toEqual([
          'lazy.chunk.js',
          'main.js',
          'other-task.txt',
          'second.js'
        ]);

        await writeSourceAsync(`${folder}/src/entry.js`, ENTRY);
        expect((await runAsync(compiler)).hasErrors()).toBe(false);
        expect(await readOutputAsync(folder)).toEqual(['main.js', 'other-task.txt', 'second.js']);
      } finally {
        await closeAsync(compiler);
      }
    },
    TIMEOUT_MS
  );
});

describe(`${Webpack5Plugin.name} with the deleteStaleAssetsInWatchMode option`, () => {
  const FAKE_WEBPACK_MODULE: string = 'fake-webpack-for-DeleteStaleAssetsPlugin-test';
  const createdConfigurations: IWebpackConfiguration[] = [];

  jest.doMock(
    FAKE_WEBPACK_MODULE,
    () => ({
      __esModule: true,
      version: '5.0.0-fake',
      default: (configuration: IWebpackConfiguration) => {
        createdConfigurations.push(configuration);
        let onDone: ((stats?: Stats) => void) | undefined;
        return {
          hooks: {
            done: {
              tap: (name: string, fn: (stats?: Stats) => void) => {
                onDone = fn;
              }
            }
          },
          watch: () => {
            setImmediate(() => onDone!());
          },
          run: (callback: (error: Error | null, stats?: Stats) => void) => callback(null, undefined),
          close: (callback: (error?: Error | null) => void) => callback()
        };
      }
    }),
    { virtual: true }
  );

  beforeEach(() => {
    createdConfigurations.length = 0;
  });

  async function runPluginAsync(
    watch: boolean,
    options: IWebpackPluginOptions,
    configuration: IWebpackConfiguration
  ): Promise<IWebpackConfiguration> {
    const terminal: Terminal = new Terminal(new StringBufferTerminalProvider(false));
    const logger: MockScopedLogger = new MockScopedLogger(terminal);
    const run: AsyncParallelHook<IHeftTaskRunHookOptions> = new AsyncParallelHook(['runOptions']);
    const runIncremental: AsyncParallelHook<IHeftTaskRunIncrementalHookOptions> = new AsyncParallelHook([
      'runIncrementalOptions'
    ]);
    const taskSession: IHeftTaskSession = {
      logger,
      hooks: { run, runIncremental },
      parameters: {
        watch,
        production: false,
        getFlagParameter: () => ({ value: false })
      },
      parsedCommandLine: { commandName: 'build', unaliasedCommandName: 'build' },
      taskName: 'webpack',
      tempFolderPath: `${TEST_FOLDER}/temp`
    } as unknown as IHeftTaskSession;
    const heftConfiguration: HeftConfiguration = {
      buildFolderPath: TEST_FOLDER,
      rigPackageResolver: { resolvePackageAsync: async () => FAKE_WEBPACK_MODULE },
      terminalProvider: { supportsColor: false }
    } as unknown as HeftConfiguration;

    const plugin: Webpack5Plugin = new Webpack5Plugin();
    plugin.apply(taskSession, heftConfiguration, options);
    plugin.accessor.hooks.onLoadConfiguration.tapPromise('test', async () => configuration);

    if (watch) {
      await runIncremental.promise({ requestRun: () => {} } as unknown as IHeftTaskRunIncrementalHookOptions);
    } else {
      await run.promise({} as unknown as IHeftTaskRunHookOptions);
    }

    expect(logger.errors).toEqual([]);
    expect(createdConfigurations).toHaveLength(1);
    return createdConfigurations[0];
  }

  function countPlugins(configuration: Configuration): number {
    return (configuration.plugins ?? []).filter(
      (plugin: unknown) => plugin instanceof DeleteStaleAssetsPlugin
    ).length;
  }

  it('adds the plugin in watch mode', async () => {
    const configuration: IWebpackConfiguration = await runPluginAsync(
      true,
      { deleteStaleAssetsInWatchMode: true },
      { plugins: [] }
    );
    expect(countPlugins(configuration as Configuration)).toBe(1);
  });

  it('adds its own instance to each configuration', async () => {
    const configurations: IWebpackConfiguration = await runPluginAsync(
      true,
      { deleteStaleAssetsInWatchMode: true },
      [{}, { plugins: [] }]
    );
    const [first, second] = configurations as Configuration[];
    expect(countPlugins(first)).toBe(1);
    expect(countPlugins(second)).toBe(1);
    expect(first.plugins!.find((plugin: unknown) => plugin instanceof DeleteStaleAssetsPlugin)).not.toBe(
      second.plugins!.find((plugin: unknown) => plugin instanceof DeleteStaleAssetsPlugin)
    );
  });

  it('does not add the plugin when the option is not set', async () => {
    const configuration: IWebpackConfiguration = await runPluginAsync(true, {}, { plugins: [] });
    expect(countPlugins(configuration as Configuration)).toBe(0);
  });

  it('does not add the plugin outside watch mode', async () => {
    const configuration: IWebpackConfiguration = await runPluginAsync(
      false,
      { deleteStaleAssetsInWatchMode: true },
      { plugins: [] }
    );
    expect(countPlugins(configuration as Configuration)).toBe(0);
  });
});
