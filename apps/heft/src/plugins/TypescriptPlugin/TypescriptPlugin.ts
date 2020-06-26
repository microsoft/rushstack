// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as glob from 'glob';
import { LegacyAdapters, Terminal, ITerminalProvider } from '@rushstack/node-core-library';
import * as TRushStackCompiler from '@microsoft/rush-stack-compiler-3.7';

import { RushStackCompilerUtilities } from '../../utilities/RushStackCompilerUtilities';
import { PrefixProxyTerminalProvider } from '../../utilities/PrefixProxyTerminalProvider';
import { TypescriptBuilder, ITypescriptBuilderConfiguration } from './TypescriptBuilder';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import {
  CopyFromCacheMode,
  IEmitModuleKind,
  ITypescriptConfiguration,
  IBuildActionContext,
  ICompileStage
} from '../../cli/actions/BuildAction';
import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';

const PLUGIN_NAME: string = 'typescript';

interface IRunTypescriptOptions {
  heftSession: HeftSession;
  heftConfiguration: HeftConfiguration;
  typescriptConfiguration: ITypescriptConfiguration;
  watchMode: boolean;
}

interface IRunBuilderForTsconfigOptions {
  heftSession: HeftSession;
  heftConfiguration: HeftConfiguration;

  tsconfigFilePath: string;
  lintingEnabled: boolean;
  tslintFilePath: string | undefined;
  copyFromCacheMode?: CopyFromCacheMode;
  watchMode: boolean;

  terminalProvider: ITerminalProvider;
  additionalModuleKindsToEmit: IEmitModuleKind[] | undefined;
}

export class TypescriptPlugin implements IHeftPlugin {
  public readonly displayName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildActionContext) => {
      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileStage) => {
        compile.hooks.configureTypescript.tapPromise(PLUGIN_NAME, async () => {
          await this._configureTypescriptAsync(
            compile.properties.typescriptConfiguration,
            heftConfiguration.buildFolder
          );
        });

        compile.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await this._runTypescriptAsync({
            heftSession,
            heftConfiguration,
            typescriptConfiguration: compile.properties.typescriptConfiguration,
            watchMode: build.properties.watchMode
          });
        });
      });
    });
  }

  private async _configureTypescriptAsync(
    typescriptConfiguration: ITypescriptConfiguration,
    buildFolder: string
  ): Promise<void> {
    typescriptConfiguration.tslintConfigPath = 'tslint.json';
    typescriptConfiguration.tsconfigPaths = await LegacyAdapters.convertCallbackToPromise(
      glob,
      'tsconfig?(-*).json',
      {
        cwd: buildFolder,
        nocase: true
      }
    );
  }

  private async _runTypescriptAsync(options: IRunTypescriptOptions): Promise<void> {
    const { heftSession, heftConfiguration, typescriptConfiguration, watchMode } = options;

    const builderOptions: Omit<
      IRunBuilderForTsconfigOptions,
      'terminalProvider' | 'tsconfigFilePath' | 'additionalModuleKindsToEmit'
    > = {
      heftSession: heftSession,
      heftConfiguration,
      lintingEnabled: !!typescriptConfiguration.isLintingEnabled,
      tslintFilePath: typescriptConfiguration.tslintConfigPath,
      copyFromCacheMode: typescriptConfiguration.copyFromCacheMode,
      watchMode: watchMode
    };

    const tsconfigFilePaths: string[] = typescriptConfiguration.tsconfigPaths;
    if (tsconfigFilePaths.length === 1) {
      const builderTerminalProvider: PrefixProxyTerminalProvider = new PrefixProxyTerminalProvider(
        heftConfiguration.terminalProvider,
        `[${PLUGIN_NAME}] `
      );

      await this._runBuilderForTsconfig({
        ...builderOptions,
        tsconfigFilePath: tsconfigFilePaths[0],
        terminalProvider: builderTerminalProvider,
        additionalModuleKindsToEmit: typescriptConfiguration.additionalModuleKindsToEmit
      });
    } else {
      const builderProcesses: Promise<void>[] = [];
      for (const tsconfigFilePath of tsconfigFilePaths) {
        const tsconfigFilename: string = path.basename(tsconfigFilePath, path.extname(tsconfigFilePath));
        const builderTerminalProvider: PrefixProxyTerminalProvider = new PrefixProxyTerminalProvider(
          heftConfiguration.terminalProvider,
          `[${PLUGIN_NAME} (${tsconfigFilename})] `
        );

        // Only provide additionalModuleKindsToEmit to the default tsconfig.json
        const additionalModuleKindsToEmit: IEmitModuleKind[] | undefined =
          tsconfigFilename === 'tsconfig' ? typescriptConfiguration.additionalModuleKindsToEmit : undefined;

        builderProcesses.push(
          this._runBuilderForTsconfig({
            ...builderOptions,
            tsconfigFilePath,
            terminalProvider: builderTerminalProvider,
            additionalModuleKindsToEmit
          })
        );
      }

      await Promise.all(builderProcesses);
    }
  }

  private async _runBuilderForTsconfig(options: IRunBuilderForTsconfigOptions): Promise<void> {
    const {
      heftSession,
      heftConfiguration,
      lintingEnabled,
      tsconfigFilePath,
      tslintFilePath,
      terminalProvider,
      copyFromCacheMode,
      additionalModuleKindsToEmit,
      watchMode
    } = options;

    const fullTsconfigFilePath: string = path.resolve(heftConfiguration.buildFolder, tsconfigFilePath);
    const builderTerminal: Terminal = new Terminal(terminalProvider);
    const rscPackage:
      | typeof TRushStackCompiler
      | undefined = RushStackCompilerUtilities.tryLoadRushStackCompilerPackageForTsconfig(
      builderTerminal,
      fullTsconfigFilePath
    );
    if (!rscPackage) {
      throw new Error(`Unable to resolve a compiler package for ${path.basename(tsconfigFilePath)}`);
    }

    const typescriptBuilderConfiguration: ITypescriptBuilderConfiguration = {
      buildFolder: heftConfiguration.buildFolder,
      typescriptToolPath: rscPackage.ToolPaths.typescriptPackagePath,
      tslintToolPath: rscPackage.ToolPaths.tslintPackagePath,
      eslintToolPath: rscPackage.ToolPaths.eslintPackagePath,

      tsconfigPath: fullTsconfigFilePath,
      tslintPath: tslintFilePath ? path.resolve(heftConfiguration.buildFolder, tslintFilePath) : undefined,
      lintingEnabled,
      buildCacheFolder: options.heftConfiguration.buildCacheFolder,
      additionalModuleKindsToEmit,
      copyFromCacheMode,
      watchMode
    };
    const typescriptBuilder: TypescriptBuilder = new TypescriptBuilder(
      terminalProvider,
      typescriptBuilderConfiguration
    );

    if (heftSession.debugMode) {
      await typescriptBuilder.invokeAsync();
    } else {
      await typescriptBuilder.invokeAsSubprocessAsync();
    }
  }
}
