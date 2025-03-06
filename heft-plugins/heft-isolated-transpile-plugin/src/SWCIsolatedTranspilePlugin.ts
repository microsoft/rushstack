// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { availableParallelism } from 'node:os';
import path from 'node:path';
import { type ChildProcess, fork } from 'node:child_process';
import type * as ts from 'typescript';
import { Path } from '@rushstack/node-core-library';
import type { HeftConfiguration, IHeftTaskPlugin, IHeftTaskSession, IScopedLogger } from '@rushstack/heft';
import { LookupByPath } from '@rushstack/lookup-by-path';

import type {
  ISwcIsolatedTranspileOptions as ISwcIsolatedTranspileOptions,
  IWorkerResult,
  ITransformTask,
  IEmitKind,
  ITransformModulesRequestMessage
} from './types';
import { loadTsconfig, type TExtendedTypeScript } from './readTsConfig';

import type { Config, JscTarget, ModuleConfig, Options, ParserConfig } from '@swc/core';

const TSC_TO_SWC_MODULE_MAP: Record<keyof typeof ts.ModuleKind, ModuleConfig['type'] | undefined> = {
  CommonJS: 'commonjs',
  ES2015: 'es6',
  ES2020: 'es6',
  ES2022: 'es6',
  ESNext: 'es6',
  Node16: 'nodenext',
  NodeNext: 'nodenext',
  AMD: 'amd',
  None: undefined,
  UMD: 'umd',
  System: undefined,
  Preserve: undefined
};

const TSC_TO_SWC_TARGET_MAP: Record<keyof typeof ts.ScriptTarget, JscTarget | undefined> = {
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

export default class SWCIsolatedTranspilePlugin implements IHeftTaskPlugin<ISwcIsolatedTranspileOptions> {
  public apply(
    heftSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: ISwcIsolatedTranspileOptions = {}
  ): void {
    heftSession.hooks.run.tapPromise(PLUGIN_NAME, async () => {
      const { logger } = heftSession;

      await transpileProjectAsync(heftConfiguration, pluginOptions, logger);
    });
  }
}

async function transpileProjectAsync(
  heftConfiguration: HeftConfiguration,
  pluginOptions: ISwcIsolatedTranspileOptions,
  logger: IScopedLogger
): Promise<void> {
  const { buildFolderPath } = heftConfiguration;
  const { emitKinds = [] } = pluginOptions;

  const tsconfig: ts.ParsedCommandLine | undefined = loadTsconfig(
    ts as TExtendedTypeScript,
    { buildFolder: buildFolderPath },
    pluginOptions,
    logger
  );

  if (!tsconfig) {
    logger.terminal.writeLine('tsconfig.json not found. Skipping parse and transpile for this project.');
    return;
  }

  if (emitKinds.length < 1) {
    throw new Error(
      'One or more emit kinds must be specified in the plugin options. To disable SWC transpilation' +
        ', point "tsConfigPath" at a nonexistent file.'
    );
  }

  const parsedTsConfig: ts.ParsedCommandLine = tsconfig;

  logger.terminal.writeDebugLine('Loaded tsconfig', JSON.stringify(parsedTsConfig, undefined, 2));

  const {
    fileNames: filesFromTsConfig,
    options: { sourceMap, sourceRoot, experimentalDecorators, inlineSourceMap, useDefineForClassFields }
  } = parsedTsConfig;

  const rootDirsPaths: LookupByPath<number> = new LookupByPath(
    (parsedTsConfig.options.rootDirs ?? []).map((rd) => [rd, rd.length])
  );

  const sourceFilePaths: string[] = [];
  for (const filePath of filesFromTsConfig) {
    if (!filePath.endsWith('.d.ts')) {
      sourceFilePaths.push(filePath);
    }
  }

  logger.terminal.writeVerboseLine('Reading Config');

  const srcDir: string = Path.convertToSlashes(
    path.resolve(buildFolderPath, parsedTsConfig.options.rootDir ?? 'src')
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
      noInterop: parsedTsConfig.options.esModuleInterop === false
    };

    const parser: ParserConfig = {
      syntax: 'typescript',
      decorators: experimentalDecorators,
      dynamicImport: true,
      tsx: false
    };

    const options: Options = {
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
        externalHelpers: parsedTsConfig.options.importHelpers,
        parser,
        transform: {
          legacyDecorator: experimentalDecorators,
          react: {},
          useDefineForClassFields
        }
      }
    };

    logger.terminal.writeVerboseLine(`Transpile options: ${JSON.stringify(options, undefined, 2)}}`);
    logger.terminal.writeDebugLine(`Tranpile options: ${options}`);

    const tsOptions: string = JSON.stringify(options);
    parser.tsx = true;
    const tsxOptions: string = JSON.stringify(options);

    return {
      ts: tsOptions,
      tsx: tsxOptions
    };
  }

  const outputOptions: Map<string, IOptionsByExtension> = new Map(
    emitKinds.map((emitKind) => {
      return [emitKind.outDir, getOptionsByExtension(emitKind)];
    })
  );

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
    const concurrency: number = Math.min(4, tasks.length, availableParallelism());

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
