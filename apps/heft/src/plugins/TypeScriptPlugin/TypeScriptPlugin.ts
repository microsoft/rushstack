// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import glob from 'glob';
import { LegacyAdapters, ITerminalProvider, Terminal } from '@rushstack/node-core-library';

import { TypeScriptBuilder, ITypeScriptBuilderConfiguration } from './TypeScriptBuilder';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';
import {
  CopyFromCacheMode,
  IBuildStageContext,
  ICompileSubstage,
  IBuildStageProperties
} from '../../stages/BuildStage';
import { TaskPackageResolver, ITaskPackageResolution } from '../../utilities/TaskPackageResolver';
import { JestTypeScriptDataFile } from '../JestPlugin/JestTypeScriptDataFile';
import { ScopedLogger } from '../../pluginFramework/logging/ScopedLogger';
import { ICleanStageContext, ICleanStageProperties } from '../../stages/CleanStage';
import { CoreConfigFiles, ISharedCopyConfiguration } from '../../utilities/CoreConfigFiles';

const PLUGIN_NAME: string = 'typescript';

interface IRunTypeScriptOptions {
  heftSession: HeftSession;
  heftConfiguration: HeftConfiguration;
  buildProperties: IBuildStageProperties;
  watchMode: boolean;
  firstEmitCallback: () => void;
}

interface IEmitModuleKind {
  moduleKind: 'commonjs' | 'amd' | 'umd' | 'system' | 'es2015' | 'esnext';
  outFolderName: string;
}

interface IRunBuilderForTsconfigOptions {
  heftSession: HeftSession;
  heftConfiguration: HeftConfiguration;

  tsconfigFilePath: string;
  lintingEnabled: boolean;
  copyFromCacheMode?: CopyFromCacheMode;
  watchMode: boolean;
  maxWriteParallelism: number;
  firstEmitCallback: () => void;

  terminalProvider: ITerminalProvider;
  terminalPrefixLabel: string | undefined;
  additionalModuleKindsToEmit: IEmitModuleKind[] | undefined;
}

export interface ISharedTypeScriptConfiguration {
  /**
   * Can be set to 'copy' or 'hardlink'. If set to 'copy', copy files from cache. If set to 'hardlink', files will be
   * hardlinked to the cache location. This option is useful when producing a tarball of build output as TAR files
   * don't handle these hardlinks correctly. 'hardlink' is the default behavior.
   */
  copyFromCacheMode?: CopyFromCacheMode | undefined;

  /**
   * If provided, emit these module kinds in addition to the modules specified in the tsconfig.
   * Note that this option only applies to the main tsconfig.json configuration.
   */
  additionalModuleKindsToEmit?: IEmitModuleKind[] | undefined;

  /**
   * Specifies the intermediary folder that tests will use.  Because Jest uses the
   * Node.js runtime to execute tests, the module format must be CommonJS.
   *
   * The default value is "lib".
   */
  emitFolderNameForTests?: string;

  /**
   * Configures additional file types that should be copied into the TypeScript compiler's emit folders, for example
   * so that these files can be resolved by import statements.
   */
  staticAssetsToCopy?: ISharedCopyConfiguration;
}

export interface ITypeScriptConfigurationJson extends ISharedTypeScriptConfiguration {
  disableTslint?: boolean;
  maxWriteParallelism: number | undefined;
}

interface ITypeScriptConfiguration extends ISharedTypeScriptConfiguration {
  /**
   * Set this to change the maximum number of file handles that will be opened concurrently for writing.
   * The default is 50.
   */
  maxWriteParallelism: number;

  tsconfigPaths: string[];
  isLintingEnabled: boolean | undefined;
}

interface ITypeScriptConfigurationFileCacheEntry {
  configurationFile: ITypeScriptConfigurationJson | undefined;
}

export class TypeScriptPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;
  private _typeScriptConfigurationFileCache: Map<string, ITypeScriptConfigurationFileCacheEntry> = new Map<
    string,
    ITypeScriptConfigurationFileCacheEntry
  >();

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    const logger: ScopedLogger = heftSession.requestScopedLogger('TypeScript Plugin');

    heftSession.hooks.clean.tap(PLUGIN_NAME, (clean: ICleanStageContext) => {
      clean.hooks.loadStageConfiguration.tapPromise(PLUGIN_NAME, async () => {
        await this._updateCleanOptions(logger, heftConfiguration, clean.properties);
      });
    });

    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileSubstage) => {
        compile.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await this._runTypeScriptAsync(logger, {
            heftSession,
            heftConfiguration,
            buildProperties: build.properties,
            watchMode: build.properties.watchMode,
            firstEmitCallback: async () => compile.hooks.afterTypescriptFirstEmit.promise()
          });
        });
      });
    });
  }

  private async _ensureConfigFileLoadedAsync(
    terminal: Terminal,
    heftConfiguration: HeftConfiguration
  ): Promise<ITypeScriptConfigurationJson | undefined> {
    const buildFolder: string = heftConfiguration.buildFolder;
    let typescriptConfigurationFileCacheEntry:
      | ITypeScriptConfigurationFileCacheEntry
      | undefined = this._typeScriptConfigurationFileCache.get(buildFolder);

    if (!typescriptConfigurationFileCacheEntry) {
      typescriptConfigurationFileCacheEntry = {
        configurationFile: await CoreConfigFiles.typeScriptConfigurationFileLoader.tryLoadConfigurationFileForProjectAsync(
          terminal,
          buildFolder,
          heftConfiguration.rigConfig
        )
      };

      this._typeScriptConfigurationFileCache.set(buildFolder, typescriptConfigurationFileCacheEntry);
    }

    return typescriptConfigurationFileCacheEntry.configurationFile;
  }

  private async _updateCleanOptions(
    logger: ScopedLogger,
    heftConfiguration: HeftConfiguration,
    cleanProperties: ICleanStageProperties
  ): Promise<void> {
    const configurationFile:
      | ITypeScriptConfigurationJson
      | undefined = await this._ensureConfigFileLoadedAsync(logger.terminal, heftConfiguration);

    if (configurationFile?.additionalModuleKindsToEmit) {
      for (const additionalModuleKindToEmit of configurationFile.additionalModuleKindsToEmit) {
        cleanProperties.pathsToDelete.add(
          path.resolve(heftConfiguration.buildFolder, additionalModuleKindToEmit.outFolderName)
        );
      }
    }
  }

  private async _runTypeScriptAsync(logger: ScopedLogger, options: IRunTypeScriptOptions): Promise<void> {
    const { heftSession, heftConfiguration, buildProperties, watchMode, firstEmitCallback } = options;

    const typescriptConfigurationJson:
      | ITypeScriptConfigurationJson
      | undefined = await this._ensureConfigFileLoadedAsync(logger.terminal, heftConfiguration);
    const tsconfigPaths: string[] = await LegacyAdapters.convertCallbackToPromise(
      glob,
      'tsconfig?(-*).json',
      {
        cwd: heftConfiguration.buildFolder,
        nocase: true
      }
    );
    const typeScriptConfiguration: ITypeScriptConfiguration = {
      copyFromCacheMode: typescriptConfigurationJson?.copyFromCacheMode,
      additionalModuleKindsToEmit: typescriptConfigurationJson?.additionalModuleKindsToEmit,
      emitFolderNameForTests: typescriptConfigurationJson?.emitFolderNameForTests,
      maxWriteParallelism: typescriptConfigurationJson?.maxWriteParallelism || 50,
      tsconfigPaths: tsconfigPaths,
      isLintingEnabled: !(buildProperties.lite || typescriptConfigurationJson?.disableTslint)
    };

    if (heftConfiguration.projectPackageJson.private !== true) {
      if (typeScriptConfiguration.copyFromCacheMode === undefined) {
        logger.terminal.writeVerboseLine(
          'Setting TypeScript copyFromCacheMode to "copy" because the "private" field ' +
            'in package.json is not set to true. Linked files are not handled correctly ' +
            'when package are packed for publishing.'
        );
        // Copy if the package is intended to be published
        typeScriptConfiguration.copyFromCacheMode = 'copy';
      } else if (typeScriptConfiguration.copyFromCacheMode !== 'copy') {
        logger.emitWarning(
          new Error(
            `The TypeScript copyFromCacheMode is set to "${typeScriptConfiguration.copyFromCacheMode}", ` +
              'but the the "private" field in package.json is not set to true. ' +
              'Linked files are not handled correctly when package are packed for publishing.'
          )
        );
      }
    }

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
      maxWriteParallelism: typeScriptConfiguration.maxWriteParallelism
    };

    JestTypeScriptDataFile.saveForProject(heftConfiguration.buildFolder, {
      emitFolderNameForTests: typescriptConfigurationJson?.emitFolderNameForTests || 'lib',
      skipTimestampCheck: !options.watchMode
    });

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
      maxWriteParallelism
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
