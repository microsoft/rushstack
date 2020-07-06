// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as glob from 'glob';
import { LegacyAdapters, ITerminalProvider } from '@rushstack/node-core-library';
import * as TRushStackCompiler from '@microsoft/rush-stack-compiler-3.7';

import { RushStackCompilerUtilities } from '../../utilities/RushStackCompilerUtilities';
import { TypeScriptBuilder, ITypeScriptBuilderConfiguration } from './TypeScriptBuilder';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import {
  CopyFromCacheMode,
  IEmitModuleKind,
  ITypeScriptConfiguration,
  IBuildActionContext,
  ICompileStage
} from '../../cli/actions/BuildAction';
import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';

const PLUGIN_NAME: string = 'typescript';

interface IRunTypeScriptOptions {
  heftSession: HeftSession;
  heftConfiguration: HeftConfiguration;
  typeScriptConfiguration: ITypeScriptConfiguration;
  watchMode: boolean;
}

interface IRunBuilderForTsconfigOptions {
  heftSession: HeftSession;
  heftConfiguration: HeftConfiguration;

  tsconfigFilePath: string;
  lintingEnabled: boolean;
  copyFromCacheMode?: CopyFromCacheMode;
  watchMode: boolean;

  terminalProvider: ITerminalProvider;
  terminalPrefixLabel: string | undefined;
  additionalModuleKindsToEmit: IEmitModuleKind[] | undefined;
}

export class TypeScriptPlugin implements IHeftPlugin {
  public readonly displayName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildActionContext) => {
      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileStage) => {
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
            watchMode: build.properties.watchMode
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
    const { heftSession, heftConfiguration, typeScriptConfiguration, watchMode } = options;

    const builderOptions: Omit<
      IRunBuilderForTsconfigOptions,
      'terminalProvider' | 'tsconfigFilePath' | 'additionalModuleKindsToEmit' | 'terminalPrefixLabel'
    > = {
      heftSession: heftSession,
      heftConfiguration,
      lintingEnabled: !!typeScriptConfiguration.isLintingEnabled,
      copyFromCacheMode: typeScriptConfiguration.copyFromCacheMode,
      watchMode: watchMode
    };

    const tsconfigFilePaths: string[] = typeScriptConfiguration.tsconfigPaths;
    if (tsconfigFilePaths.length === 1) {
      await this._runBuilderForTsconfig({
        ...builderOptions,
        tsconfigFilePath: tsconfigFilePaths[0],
        terminalProvider: heftConfiguration.terminalProvider,
        additionalModuleKindsToEmit: typeScriptConfiguration.additionalModuleKindsToEmit,
        terminalPrefixLabel: undefined
      });
    } else {
      const builderProcesses: Promise<void>[] = [];
      for (const tsconfigFilePath of tsconfigFilePaths) {
        const tsconfigFilename: string = path.basename(tsconfigFilePath, path.extname(tsconfigFilePath));

        // Only provide additionalModuleKindsToEmit to the default tsconfig.json
        const additionalModuleKindsToEmit: IEmitModuleKind[] | undefined =
          tsconfigFilename === 'tsconfig' ? typeScriptConfiguration.additionalModuleKindsToEmit : undefined;

        builderProcesses.push(
          this._runBuilderForTsconfig({
            ...builderOptions,
            tsconfigFilePath,
            terminalProvider: heftConfiguration.terminalProvider,
            additionalModuleKindsToEmit,
            terminalPrefixLabel: tsconfigFilename
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
      terminalProvider,
      terminalPrefixLabel,
      copyFromCacheMode,
      additionalModuleKindsToEmit,
      watchMode
    } = options;

    const fullTsconfigFilePath: string = path.resolve(heftConfiguration.buildFolder, tsconfigFilePath);
    const rscPackage:
      | typeof TRushStackCompiler
      | undefined = RushStackCompilerUtilities.tryLoadRushStackCompilerPackageForTsconfig(
      TypeScriptBuilder.getTypeScriptTerminal(terminalProvider, terminalPrefixLabel),
      fullTsconfigFilePath
    );
    if (!rscPackage) {
      throw new Error(`Unable to resolve a compiler package for ${path.basename(tsconfigFilePath)}`);
    }

    const typeScriptBuilderConfiguration: ITypeScriptBuilderConfiguration = {
      buildFolder: heftConfiguration.buildFolder,
      typeScriptToolPath: rscPackage.ToolPaths.typescriptPackagePath,
      tslintToolPath: rscPackage.ToolPaths.tslintPackagePath,
      eslintToolPath: rscPackage.ToolPaths.eslintPackagePath,

      tsconfigPath: fullTsconfigFilePath,
      lintingEnabled,
      buildCacheFolder: options.heftConfiguration.buildCacheFolder,
      additionalModuleKindsToEmit,
      copyFromCacheMode,
      watchMode,
      terminalPrefixLabel
    };
    const typeScriptBuilder: TypeScriptBuilder = new TypeScriptBuilder(
      terminalProvider,
      typeScriptBuilderConfiguration
    );

    if (heftSession.debugMode) {
      await typeScriptBuilder.invokeAsync();
    } else {
      await typeScriptBuilder.invokeAsSubprocessAsync();
    }
  }
}
