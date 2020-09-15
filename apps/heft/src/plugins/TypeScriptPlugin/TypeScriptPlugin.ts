// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as glob from 'glob';
import { LegacyAdapters, ITerminalProvider, FileSystem } from '@rushstack/node-core-library';

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
import { HeftConfigFiles } from '../../utilities/HeftConfigFiles';

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
   * Specifies the intermediary folder that Jest will use for its input.  Because Jest uses the
   * Node.js runtime to execute tests, the module format must be CommonJS.
   *
   * The default value is "lib".
   */
  emitFolderNameForJest?: string;

  /**
   * Set this to change the maximum number of file handles that will be opened concurrently for writing.
   * The default is 50.
   */
  maxWriteParallelism: number;
}

export interface ITypeScriptConfigurationJson extends ISharedTypeScriptConfiguration {
  disableTslint?: boolean;
}

interface ITypeScriptConfiguration extends ISharedTypeScriptConfiguration {
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
    heftSession.hooks.clean.tap(PLUGIN_NAME, (clean: ICleanStageContext) => {
      clean.hooks.loadStageConfiguration.tapPromise(PLUGIN_NAME, async () => {
        await this._updateCleanOptions(heftConfiguration.buildFolder, clean.properties);
      });
    });

    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileSubstage) => {
        compile.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await this._runTypeScriptAsync({
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
    buildFolder: string
  ): Promise<ITypeScriptConfigurationJson | undefined> {
    let typescriptConfigurationFileCacheEntry:
      | ITypeScriptConfigurationFileCacheEntry
      | undefined = this._typeScriptConfigurationFileCache.get(buildFolder);

    if (!typescriptConfigurationFileCacheEntry) {
      try {
        typescriptConfigurationFileCacheEntry = {
          configurationFile: await HeftConfigFiles.typeScriptConfigurationFileLoader.loadConfigurationFileAsync(
            path.resolve(buildFolder, '.heft', 'typescript.json')
          )
        };
      } catch (e) {
        if (FileSystem.isNotExistError(e)) {
          typescriptConfigurationFileCacheEntry = { configurationFile: undefined };
        } else {
          throw e;
        }
      }

      this._typeScriptConfigurationFileCache.set(buildFolder, typescriptConfigurationFileCacheEntry);
    }

    return typescriptConfigurationFileCacheEntry.configurationFile;
  }

  private async _updateCleanOptions(
    buildFolder: string,
    cleanProperties: ICleanStageProperties
  ): Promise<void> {
    const configurationFile:
      | ITypeScriptConfigurationJson
      | undefined = await this._ensureConfigFileLoadedAsync(buildFolder);

    if (configurationFile?.additionalModuleKindsToEmit) {
      for (const additionalModuleKindToEmit of configurationFile.additionalModuleKindsToEmit) {
        cleanProperties.pathsToDelete.add(
          path.resolve(buildFolder, additionalModuleKindToEmit.outFolderName)
        );
      }
    }
  }

  private async _runTypeScriptAsync(options: IRunTypeScriptOptions): Promise<void> {
    const { heftSession, heftConfiguration, buildProperties, watchMode, firstEmitCallback } = options;

    const typescriptConfigurationJson:
      | ITypeScriptConfigurationJson
      | undefined = await this._ensureConfigFileLoadedAsync(heftConfiguration.buildFolder);
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
      emitFolderNameForJest: typescriptConfigurationJson?.emitFolderNameForJest,
      maxWriteParallelism: typescriptConfigurationJson?.maxWriteParallelism || 50,
      tsconfigPaths: tsconfigPaths,
      isLintingEnabled: !(buildProperties.lite || typescriptConfigurationJson?.disableTslint)
    };

    const logger: ScopedLogger = heftSession.requestScopedLogger('TypeScript Plugin');

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
      emitFolderNameForJest: typescriptConfigurationJson?.emitFolderNameForJest || 'lib',
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
