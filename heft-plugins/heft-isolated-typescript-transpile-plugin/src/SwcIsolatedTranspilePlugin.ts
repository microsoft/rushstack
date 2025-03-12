// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import { type ChildProcess, fork } from 'node:child_process';

import { Path } from '@rushstack/node-core-library';
import type { HeftConfiguration, IHeftTaskPlugin, IHeftTaskSession, IScopedLogger } from '@rushstack/heft';
import { LookupByPath } from '@rushstack/lookup-by-path';
import {
  _loadTypeScriptToolAsync as loadTypeScriptToolAsync,
  _loadTsconfig as loadTsconfig,
  type _TTypeScript as TTypeScript,
  _getTsconfigFilePath as getTsconfigFilePath
} from '@rushstack/heft-typescript-plugin';
import type {
  Config,
  JscTarget,
  ModuleConfig,
  Options as SwcOptions,
  ParserConfig,
  ReactConfig,
  TransformConfig
} from '@swc/core';
import { SyncWaterfallHook } from 'tapable';

import type {
  ISwcIsolatedTranspileOptions,
  IWorkerResult,
  ITransformTask,
  IEmitKind,
  ITransformModulesRequestMessage
} from './types';

/**
 * @public
 */
export type ModuleKind = keyof typeof TTypeScript.ModuleKind;

const TSC_TO_SWC_MODULE_MAP: Record<ModuleKind, ModuleConfig['type'] | undefined> = {
  CommonJS: 'commonjs',
  ES2015: 'es6',
  ES2020: 'es6',
  ES2022: 'es6',
  ESNext: 'es6',
  Node16: 'nodenext',
  Node18: 'nodenext',
  NodeNext: 'nodenext',
  AMD: 'amd',
  None: undefined,
  UMD: 'umd',
  System: undefined,
  Preserve: undefined
};

/**
 * @public
 */
export type ScriptTarget = keyof typeof TTypeScript.ScriptTarget;

const TSC_TO_SWC_TARGET_MAP: Record<ScriptTarget, JscTarget | undefined> = {
  ES2015: 'es2015',
  ES2016: 'es2016',
  ES2017: 'es2017',
  ES2018: 'es2018',
  ES2019: 'es2019',
  ES2020: 'es2020',
  ES2021: 'es2021',
  ES2022: 'es2022',
  ES2023: 'es2023',
  ES2024: 'es2024',
  ESNext: 'esnext',
  Latest: 'esnext',
  ES5: 'es5',
  ES3: 'es3',
  JSON: undefined
};

const PLUGIN_NAME: 'swc-isolated-transpile-plugin' = 'swc-isolated-transpile-plugin';

/**
 * @beta
 */
export interface ISwcIsolatedTranspilePluginAccessor {
  hooks: {
    /**
     * This hook will get called for each module kind and script target that that will be emitted.
     *
     * @internalRemarks
     * In the future, consider replacing this with a HookMap.
     */
    getSwcOptions: SyncWaterfallHook<SwcOptions, ModuleKind, ScriptTarget>;
  };
}

/**
 * @public
 */
export default class SwcIsolatedTranspilePlugin implements IHeftTaskPlugin<ISwcIsolatedTranspileOptions> {
  /**
   * @beta
   */
  public accessor: ISwcIsolatedTranspilePluginAccessor;

  public constructor() {
    this.accessor = {
      hooks: {
        getSwcOptions: new SyncWaterfallHook(['swcOptions', 'format', 'target'])
      }
    };
  }

  public apply(
    heftSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: ISwcIsolatedTranspileOptions = {}
  ): void {
    heftSession.hooks.run.tapPromise(PLUGIN_NAME, async () => {
      const { logger } = heftSession;

      await transpileProjectAsync(heftConfiguration, pluginOptions, logger, this.accessor);
    });
  }
}

async function transpileProjectAsync(
  heftConfiguration: HeftConfiguration,
  pluginOptions: ISwcIsolatedTranspileOptions,
  logger: IScopedLogger,
  { hooks: { getSwcOptions: getSwcOptionsHook } }: ISwcIsolatedTranspilePluginAccessor
): Promise<void> {
  const { buildFolderPath } = heftConfiguration;
  const { emitKinds = [] } = pluginOptions;

  const { tool } = await loadTypeScriptToolAsync({
    terminal: logger.terminal,
    heftConfiguration
  });
  const { ts } = tool;

  const tsconfigPath: string = getTsconfigFilePath(heftConfiguration, pluginOptions.tsConfigPath);
  const parsedTsConfig: TTypeScript.ParsedCommandLine | undefined = loadTsconfig({ tool, tsconfigPath });

  if (!parsedTsConfig) {
    logger.terminal.writeLine('tsconfig.json not found. Skipping parse and transpile for this project.');
    return;
  }

  if (emitKinds.length < 1) {
    throw new Error(
      'One or more emit kinds must be specified in the plugin options. To disable SWC transpilation, ' +
        'point "tsConfigPath" at a nonexistent file.'
    );
  }

  logger.terminal.writeDebugLine('Loaded tsconfig', JSON.stringify(parsedTsConfig, undefined, 2));

  const { fileNames: filesFromTsConfig, options: tsConfigOptions } = parsedTsConfig;
  const { sourceMap, sourceRoot, experimentalDecorators, inlineSourceMap, useDefineForClassFields } =
    tsConfigOptions;

  const rootDirsPaths: LookupByPath<number> = new LookupByPath(
    (tsConfigOptions.rootDirs ?? []).map((rd) => [rd, rd.length])
  );

  const sourceFilePaths: string[] = filesFromTsConfig.filter((filePath) => !filePath.endsWith('.d.ts'));

  logger.terminal.writeVerboseLine('Reading Config');

  const srcDir: string = Path.convertToSlashes(
    path.resolve(buildFolderPath, tsConfigOptions.rootDir ?? 'src')
  );

  const sourceMaps: Config['sourceMaps'] = inlineSourceMap ? 'inline' : sourceMap;
  const externalSourceMaps: boolean = sourceMaps === true;

  interface IOptionsByExtension {
    ts: string;
    tsx: string;
  }

  function getOptionsByExtension({ formatOverride, targetOverride }: IEmitKind): IOptionsByExtension {
    const format: ModuleConfig['type'] | undefined =
      formatOverride !== undefined ? TSC_TO_SWC_MODULE_MAP[formatOverride] : undefined;
    if (format === undefined) {
      throw new Error(`Unsupported Module Kind: ${formatOverride && ts.ModuleKind[formatOverride]} for swc`);
    }

    logger.terminal.writeVerboseLine(`Transpiling to format: ${format}`);

    const target: JscTarget | undefined =
      targetOverride !== undefined ? TSC_TO_SWC_TARGET_MAP[targetOverride] : undefined;
    if (target === undefined) {
      throw new Error(`Unsupported Target: ${target && ts.ScriptTarget[target]} for swc`);
    }

    logger.terminal.writeVerboseLine(`Transpiling to target: ${target}`);

    const moduleConfig: ModuleConfig = {
      type: format,
      noInterop: tsConfigOptions.esModuleInterop === false
    };

    const parser: ParserConfig = {
      syntax: 'typescript',
      decorators: experimentalDecorators,
      dynamicImport: true,
      tsx: false
    };

    // https://github.com/swc-project/swc-node/blob/e6cd8b83d1ce76a0abf770f52425704e5d2872c6/packages/register/read-default-tsconfig.ts#L131C7-L139C20
    const react: Partial<ReactConfig> | undefined =
      tsConfigOptions.jsxFactory ??
      tsConfigOptions.jsxFragmentFactory ??
      tsConfigOptions.jsx ??
      tsConfigOptions.jsxImportSource
        ? {
            pragma: tsConfigOptions.jsxFactory,
            pragmaFrag: tsConfigOptions.jsxFragmentFactory,
            importSource: tsConfigOptions.jsxImportSource ?? 'react',
            runtime: (tsConfigOptions.jsx ?? 0) >= ts.JsxEmit.ReactJSX ? 'automatic' : 'classic',
            useBuiltins: true
          }
        : undefined;

    let options: SwcOptions = {
      cwd: buildFolderPath,
      root: srcDir,
      rootMode: 'root',
      configFile: false,
      swcrc: false,
      minify: false,

      inputSourceMap: false,
      sourceRoot,
      isModule: true,

      module: moduleConfig,
      jsc: {
        target,
        externalHelpers: tsConfigOptions.importHelpers,
        parser,
        transform: {
          legacyDecorator: experimentalDecorators,
          react,
          useDefineForClassFields,
          // This property is not included in the types, but is what makes swc-jest work
          hidden: {
            jest: format === 'commonjs'
          }
        } as TransformConfig
      }
    };

    if (getSwcOptionsHook.isUsed()) {
      options = getSwcOptionsHook.call(options, formatOverride, targetOverride);
    }

    logger.terminal.writeVerboseLine(`Transpile options: ${JSON.stringify(options, undefined, 2)}}`);
    logger.terminal.writeDebugLine(`Transpile options: ${options}`);

    const tsOptions: string = JSON.stringify(options);
    parser.tsx = true;
    const tsxOptions: string = JSON.stringify(options);

    return {
      ts: tsOptions,
      tsx: tsxOptions
    };
  }

  const outputOptions: Map<string, IOptionsByExtension> = new Map();
  for (const emitKind of emitKinds) {
    outputOptions.set(emitKind.outDir, getOptionsByExtension(emitKind));
  }

  const tasks: ITransformTask[] = [];
  const requestMessage: ITransformModulesRequestMessage = {
    tasks,
    options: []
  };

  const indexForOptions: Map<string, number> = new Map();
  for (const srcFilePath of sourceFilePaths) {
    const rootPrefixLength: number | undefined = rootDirsPaths.findChildPath(srcFilePath);

    if (rootPrefixLength === undefined) {
      throw new Error(`Could not determine root prefix for ${srcFilePath}}`);
    }

    const relativeSrcFilePath: string = srcFilePath.slice(rootPrefixLength);
    const extensionIndex: number = relativeSrcFilePath.lastIndexOf('.');
    const tsx: boolean = endsWithCharacterX(relativeSrcFilePath);

    const relativeJsFilePath: string = `${relativeSrcFilePath.slice(0, extensionIndex)}.js`;
    for (const [outputPrefix, optionsByExtension] of outputOptions) {
      const jsFilePath: string = `${outputPrefix}${relativeJsFilePath}`;
      const mapFilePath: string | undefined = externalSourceMaps ? `${jsFilePath}.map` : undefined;

      const options: string = tsx ? optionsByExtension.tsx : optionsByExtension.ts;
      let optionsIndex: number | undefined = indexForOptions.get(options);
      if (optionsIndex === undefined) {
        optionsIndex = requestMessage.options.push(options) - 1;
        indexForOptions.set(options, optionsIndex);
      }
      const item: ITransformTask = {
        srcFilePath,
        relativeSrcFilePath,
        optionsIndex,
        jsFilePath,
        mapFilePath
      };

      tasks.push(item);
    }
  }

  logger.terminal.writeLine(`Transpiling ${tasks.length} files...`);

  const result: IWorkerResult = await new Promise((resolve, reject) => {
    const workerPath: string = require.resolve('./TranspileWorker.js');
    const concurrency: number = Math.min(4, tasks.length, heftConfiguration.numberOfCores);

    // Due to https://github.com/rust-lang/rust/issues/91979 using worker_threads is not recommended for swc & napi-rs,
    // so we use child_process.fork instead.
    const childProcess: ChildProcess = fork(workerPath, [buildFolderPath, `${concurrency}`]);

    childProcess.once('message', (message) => {
      // Shut down the worker.
      childProcess.send(false);
      // Node IPC messages are deserialized automatically.
      resolve(message as IWorkerResult);
    });

    childProcess.once('error', (error: Error) => {
      reject(error);
    });

    childProcess.once('close', (closeExitCode: number, closeSignal: NodeJS.Signals | null) => {
      if (closeSignal) {
        reject(new Error(`Child process exited with signal: ${closeSignal}`));
      } else if (closeExitCode !== 0) {
        reject(new Error(`Child process exited with code: ${closeExitCode}`));
      }
    });

    childProcess.send(requestMessage);
  });

  const { errors, timings: transformTimes, durationMs } = result;

  printTiming(logger, transformTimes, 'Transformed');

  logger.terminal.writeLine(`Finished transpiling files in ${durationMs.toFixed(2)}ms`);

  const sortedErrors: [string, string][] = errors.sort((x, y): number => {
    const xPath: string = x[0];
    const yPath: string = y[0];
    return xPath > yPath ? 1 : xPath < yPath ? -1 : 0;
  });

  for (const [, error] of sortedErrors) {
    logger.emitError(new Error(error));
  }
}

function printTiming(logger: IScopedLogger, times: [string, number][], descriptor: string): void {
  times.sort((x, y): number => {
    return y[1] - x[1];
  });

  logger.terminal.writeVerboseLine(`${descriptor} ${times.length} files at `, `${process.uptime()}`);
  logger.terminal.writeVerboseLine(`Slowest files:`);
  for (let i: number = 0, len: number = Math.min(times.length, 10); i < len; i++) {
    const [fileName, time] = times[i];

    logger.terminal.writeVerboseLine(`- ${fileName}: ${time.toFixed(2)}ms`);
  }
  const medianIndex: number = times.length >> 1;
  const [medianFileName, medianTime] = times[medianIndex];

  logger.terminal.writeVerboseLine(`Median: (${medianFileName}): ${medianTime.toFixed(2)}ms`);
}

function endsWithCharacterX(filePath: string): boolean {
  return filePath.charCodeAt(filePath.length - 1) === 120;
}
