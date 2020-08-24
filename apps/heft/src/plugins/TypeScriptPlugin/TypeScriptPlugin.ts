// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as glob from 'glob';
import { LegacyAdapters, ITerminalProvider } from '@rushstack/node-core-library';

import { TypeScriptBuilder, ITypeScriptBuilderConfiguration } from './TypeScriptBuilder';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';
import {
  ITypeScriptConfiguration,
  CopyFromCacheMode,
  IEmitModuleKind,
  IBuildStageContext,
  ICompileSubstage
} from '../../stages/BuildStage';
import { TaskPackageResolver, ITaskPackageResolution } from '../../utilities/TaskPackageResolver';
import { JestTypeScriptDataFile } from '../JestPlugin/JestTypeScriptDataFile';
import { ScopedLogger } from '../../pluginFramework/logging/ScopedLogger';

const PLUGIN_NAME: string = 'typescript';

interface IRunTypeScriptOptions {
  heftSession: HeftSession;
  heftConfiguration: HeftConfiguration;
  typeScriptConfiguration: ITypeScriptConfiguration;
  watchMode: boolean;
  firstEmitCallback: () => void;
}

interface IRunBuilderForTsconfigOptions {
  heftSession: HeftSession;
  heftConfiguration: HeftConfiguration;

  tsconfigFilePath: string;
  lintingEnabled: boolean;
  copyFromCacheMode?: CopyFromCacheMode;
  watchMode: boolean;
  maxWriteParallelism: number;
  subprocessNodeArgv?: string[];
  firstEmitCallback: () => void;

  terminalProvider: ITerminalProvider;
  terminalPrefixLabel: string | undefined;
  additionalModuleKindsToEmit: IEmitModuleKind[] | undefined;
}

export class TypeScriptPlugin implements IHeftPlugin {
  public readonly displayName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileSubstage) => {
        compile.hooks.configureTypeScript.tapPromise(PLUGIN_NAME, async () => {
          await this._configureTypeScriptAsync(
            compile.properties.typeScriptConfiguration,
            heftConfiguration.buildFolder
          );
        });

        compile.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await this._runTypeScriptAsync({
            heftSession,
            heftConfiguration,
            typeScriptConfiguration: compile.properties.typeScriptConfiguration,
            watchMode: build.properties.watchMode,
            firstEmitCallback: async () => compile.hooks.afterTypescriptFirstEmit.promise()
          });
        });
      });
    });
  }

  private async _configureTypeScriptAsync(
    typeScriptConfiguration: ITypeScriptConfiguration,
    buildFolder: string
  ): Promise<void> {
    typeScriptConfiguration.tsconfigPaths = await LegacyAdapters.convertCallbackToPromise(
      glob,
      'tsconfig?(-*).json',
      {
        cwd: buildFolder,
        nocase: true
      }
    );
  }

  private async _runTypeScriptAsync(options: IRunTypeScriptOptions): Promise<void> {
    const { heftSession, heftConfiguration, typeScriptConfiguration, watchMode, firstEmitCallback } = options;

    const logger: ScopedLogger = heftSession.requestScopedLogger('TypeScript Plugin');
    const builderOptions: Omit<
      IRunBuilderForTsconfigOptions,
      | 'terminalProvider'
      | 'tsconfigFilePath'
      | 'additionalModuleKindsToEmit'
      | 'terminalPrefixLabel'
      | 'firstEmitCallback'
    > = {
      heftSession: heftSession,
      heftConfiguration,
      lintingEnabled: !!typeScriptConfiguration.isLintingEnabled,
      copyFromCacheMode: typeScriptConfiguration.copyFromCacheMode,
      watchMode: watchMode,
      maxWriteParallelism: typeScriptConfiguration.maxWriteParallelism,
      subprocessNodeArgv: typeScriptConfiguration.subprocessNodeArgv
    };

    JestTypeScriptDataFile.saveForProject(heftConfiguration.buildFolder, typeScriptConfiguration);

    const callbacksForTsconfigs: Set<() => void> = new Set<() => void>();
    function getFirstEmitCallbackForTsconfig(): () => void {
      const callback: () => void = () => {
        callbacksForTsconfigs.delete(callback);
        if (callbacksForTsconfigs.size === 0) {
          firstEmitCallback();
        }
      };

      callbacksForTsconfigs.add(callback);

      return callback;
    }

    const tsconfigFilePaths: string[] = typeScriptConfiguration.tsconfigPaths;
    if (tsconfigFilePaths.length === 1) {
      await this._runBuilderForTsconfig(logger, {
        ...builderOptions,
        tsconfigFilePath: tsconfigFilePaths[0],
        terminalProvider: heftConfiguration.terminalProvider,
        additionalModuleKindsToEmit: typeScriptConfiguration.additionalModuleKindsToEmit,
        terminalPrefixLabel: undefined,
        firstEmitCallback: getFirstEmitCallbackForTsconfig()
      });
    } else {
      const builderProcesses: Promise<void>[] = [];
      for (const tsconfigFilePath of tsconfigFilePaths) {
        const tsconfigFilename: string = path.basename(tsconfigFilePath, path.extname(tsconfigFilePath));

        // Only provide additionalModuleKindsToEmit to the default tsconfig.json
        const additionalModuleKindsToEmit: IEmitModuleKind[] | undefined =
          tsconfigFilename === 'tsconfig' ? typeScriptConfiguration.additionalModuleKindsToEmit : undefined;

        builderProcesses.push(
          this._runBuilderForTsconfig(logger, {
            ...builderOptions,
            tsconfigFilePath,
            terminalProvider: heftConfiguration.terminalProvider,
            additionalModuleKindsToEmit,
            terminalPrefixLabel: tsconfigFilename,
            firstEmitCallback: getFirstEmitCallbackForTsconfig()
          })
        );
      }

      await Promise.all(builderProcesses);
    }
  }

  private async _runBuilderForTsconfig(
    logger: ScopedLogger,
    options: IRunBuilderForTsconfigOptions
  ): Promise<void> {
    const {
      heftSession,
      heftConfiguration,
      lintingEnabled,
      tsconfigFilePath,
      terminalProvider,
      terminalPrefixLabel,
      copyFromCacheMode,
      additionalModuleKindsToEmit,
      watchMode,
      maxWriteParallelism,
      subprocessNodeArgv,
      firstEmitCallback
    } = options;

    const fullTsconfigFilePath: string = path.resolve(heftConfiguration.buildFolder, tsconfigFilePath);
    const resolution: ITaskPackageResolution | undefined = TaskPackageResolver.resolveTaskPackages(
      fullTsconfigFilePath,
      logger.terminal
    );
    if (!resolution) {
      throw new Error(`Unable to resolve a compiler package for ${path.basename(tsconfigFilePath)}`);
    }

    const typeScriptBuilderConfiguration: ITypeScriptBuilderConfiguration = {
      buildFolder: heftConfiguration.buildFolder,
      typeScriptToolPath: resolution.typeScriptPackagePath,
      tslintToolPath: resolution.tslintPackagePath,
      eslintToolPath: resolution.eslintPackagePath,

      tsconfigPath: fullTsconfigFilePath,
      lintingEnabled,
      buildCacheFolder: options.heftConfiguration.buildCacheFolder,
      additionalModuleKindsToEmit,
      copyFromCacheMode,
      watchMode,
      loggerPrefixLabel: terminalPrefixLabel,
      maxWriteParallelism,
      subprocessNodeArgv
    };
    const typeScriptBuilder: TypeScriptBuilder = new TypeScriptBuilder(
      terminalProvider,
      typeScriptBuilderConfiguration,
      heftSession,
      firstEmitCallback
    );

    if (heftSession.debugMode) {
      await typeScriptBuilder.invokeAsync();
    } else {
      await typeScriptBuilder.invokeAsSubprocessAsync();
    }
  }
}
