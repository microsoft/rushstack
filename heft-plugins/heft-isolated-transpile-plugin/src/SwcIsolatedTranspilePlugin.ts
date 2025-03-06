// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { availableParallelism } from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

import * as ts from 'typescript';
import { Path } from '@rushstack/node-core-library';
import type { HeftConfiguration, IHeftTaskPlugin, IHeftTaskSession, IScopedLogger } from '@rushstack/heft';
import { LookupByPath } from '@rushstack/lookup-by-path';

import type {
  ISwcIsolatedTranspileOptions,
  IWorkerData,
  IWorkerResult,
  ITransformTask,
  IEmitKind
} from './types';
import { loadTsconfig, type TExtendedTypeScript } from './readTsConfig';

import type { Config, JscTarget, ModuleConfig, Options, ParserConfig, ReactConfig } from '@swc/core';

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
      'One or more emit kinds must be specified in the plugin options. To disable SWC transpilation, ' +
        'point "tsConfigPath" at a nonexistent file.'
    );
  }

  const parsedTsConfig: ts.ParsedCommandLine = tsconfig;

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

  interface IOptionsBufferByExtension {
    ts: Buffer;
    tsx: Buffer;
  }

  function getOptionsBufferByExtension({
    formatOverride,
    targetOverride
  }: IEmitKind): IOptionsBufferByExtension {
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
        externalHelpers: tsConfigOptions.importHelpers,
        parser,
        transform: {
          legacyDecorator: experimentalDecorators,
          react,
          useDefineForClassFields,
          // This property is not included in the types, but is what makes swc-jest work
          // @ts-ignore
          hidden: {
            jest: format === 'commonjs'
          }
        }
      }
    };

    logger.terminal.writeVerboseLine(`Transpile options: ${JSON.stringify(options, undefined, 2)}}`);
    logger.terminal.writeDebugLine(`Transpile options: ${options}`);

    const tsOptions: string = JSON.stringify(options);
    const tsOptionsBuffer: Buffer = Buffer.from(new SharedArrayBuffer(Buffer.byteLength(tsOptions, 'utf8')));
    tsOptionsBuffer.write(tsOptions);
    parser.tsx = true;
    const tsxOptions: string = JSON.stringify(options);
    const tsxOptionsBuffer: Buffer = Buffer.from(
      new SharedArrayBuffer(Buffer.byteLength(tsxOptions, 'utf8'))
    );
    tsxOptionsBuffer.write(tsxOptions);

    return {
      ts: tsOptionsBuffer,
      tsx: tsxOptionsBuffer
    };
  }

  const outputOptions: Map<string, IOptionsBufferByExtension> = new Map(
    emitKinds.map((emitKind) => {
      return [emitKind.outDir, getOptionsBufferByExtension(emitKind)];
    })
  );

  const tasks: ITransformTask[] = [];

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

      const item: ITransformTask = {
        srcFilePath,
        relativeSrcFilePath,
        options: tsx ? optionsByExtension.tsx : optionsByExtension.ts,
        jsFilePath,
        mapFilePath
      };

      tasks.push(item);
    }
  }

  logger.terminal.writeLine(`Transpiling ${tasks.length} files...`);

  const result: IWorkerResult = await new Promise((resolve, reject) => {
    const workerData: IWorkerData = {
      buildFolderPath,
      concurrency: Math.min(4, tasks.length, availableParallelism())
    };

    const workerPath: string = require.resolve('./TranspileWorker.js');
    const worker: Worker = new Worker(workerPath, {
      workerData
    });

    worker.once('message', (message) => {
      // shut down the worker.
      worker.postMessage(false);
      resolve(message);
    });

    worker.once('error', reject);

    worker.once('exit', (code: number) => {
      if (code !== 0) {
        reject(new Error(`Transpiler worker exited with code ${code}`));
      }
    });

    worker.postMessage(tasks);
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
