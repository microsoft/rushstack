// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { ITerminal, FileSystem, Path } from '@rushstack/node-core-library';

import { TypeScriptBuilder, ITypeScriptBuilderConfiguration } from './TypeScriptBuilder';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';
import { IBuildStageContext, ICompileSubstage, IBuildStageProperties } from '../../stages/BuildStage';
import { ToolPackageResolver, IToolPackageResolution } from '../../utilities/ToolPackageResolver';
import { ScopedLogger } from '../../pluginFramework/logging/ScopedLogger';
import { ICleanStageContext, ICleanStageProperties } from '../../stages/CleanStage';
import { CoreConfigFiles, ISharedCopyConfiguration } from '../../utilities/CoreConfigFiles';

const PLUGIN_NAME: string = 'typescript';

interface IRunTypeScriptOptions {
  heftSession: HeftSession;
  heftConfiguration: HeftConfiguration;
  buildProperties: IBuildStageProperties;
  watchMode: boolean;

  /**
   * Fired whenever the compiler emits an output.  In watch mode, this event occurs after each recompile.
   */
  emitCallback: () => void;
}

interface IEmitModuleKind {
  moduleKind: 'commonjs' | 'amd' | 'umd' | 'system' | 'es2015' | 'esnext';
  outFolderName: string;
  jsExtensionOverride?: string;
}

export interface ISharedTypeScriptConfiguration {
  /**
   * If provided, emit these module kinds in addition to the modules specified in the tsconfig.
   * Note that this option only applies to the main tsconfig.json configuration.
   */
  additionalModuleKindsToEmit?: IEmitModuleKind[] | undefined;

  /**
   * If 'true', emit CommonJS output into the TSConfig outDir with the file extension '.cjs'
   */
  emitCjsExtensionForCommonJS?: boolean | undefined;

  /**
   * If 'true', emit ESModule output into the TSConfig outDir with the file extension '.mjs'
   */
  emitMjsExtensionForESModule?: boolean | undefined;

  /**
   * If true, enable behavior analogous to the "tsc --build" command. Will build projects referenced by the main project in dependency order.
   * Note that this will effectively enable \"noEmitOnError\".
   */
  buildProjectReferences?: boolean;

  /*
   * Specifies the tsconfig.json file that will be used for compilation. Equivalent to the "project" argument for the 'tsc' and 'tslint' command line tools.
   *
   * The default value is "./tsconfig.json"
   */
  project?: string;

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

  isLintingEnabled: boolean | undefined;
}

interface ITypeScriptConfigurationFileCacheEntry {
  configurationFile: ITypeScriptConfigurationJson | undefined;
}

export class TypeScriptPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  private readonly _taskPackageResolver: ToolPackageResolver;
  private _typeScriptConfigurationFileCache: Map<string, ITypeScriptConfigurationFileCacheEntry> = new Map<
    string,
    ITypeScriptConfigurationFileCacheEntry
  >();

  public constructor(taskPackageResolver: ToolPackageResolver) {
    this._taskPackageResolver = taskPackageResolver;
  }

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
          await new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
            let isFirstEmit: boolean = true;
            this._runTypeScriptAsync(logger, {
              heftSession,
              heftConfiguration,
              buildProperties: build.properties,
              watchMode: build.properties.watchMode,
              emitCallback: () => {
                if (isFirstEmit) {
                  isFirstEmit = false;

                  // In watch mode, `_runTypeScriptAsync` will never resolve so we need to resolve the promise here
                  // to allow the build to move on to the `afterCompile` substage.
                  if (build.properties.watchMode) {
                    resolve();
                  }
                } else {
                  compile.hooks.afterRecompile.promise().catch((error) => {
                    heftConfiguration.globalTerminal.writeErrorLine(
                      `An error occurred in an afterRecompile hook: ${error}`
                    );
                  });
                }
              }
            })
              .then(resolve)
              .catch(reject);
          });
        });
      });
    });
  }

  private async _ensureConfigFileLoadedAsync(
    terminal: ITerminal,
    heftConfiguration: HeftConfiguration
  ): Promise<ITypeScriptConfigurationJson | undefined> {
    const buildFolder: string = heftConfiguration.buildFolder;
    let typescriptConfigurationFileCacheEntry: ITypeScriptConfigurationFileCacheEntry | undefined =
      this._typeScriptConfigurationFileCache.get(buildFolder);

    if (!typescriptConfigurationFileCacheEntry) {
      typescriptConfigurationFileCacheEntry = {
        configurationFile:
          await CoreConfigFiles.typeScriptConfigurationFileLoader.tryLoadConfigurationFileForProjectAsync(
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
    const configurationFile: ITypeScriptConfigurationJson | undefined =
      await this._ensureConfigFileLoadedAsync(logger.terminal, heftConfiguration);

    if (configurationFile?.additionalModuleKindsToEmit) {
      for (const additionalModuleKindToEmit of configurationFile.additionalModuleKindsToEmit) {
        cleanProperties.pathsToDelete.add(
          path.resolve(heftConfiguration.buildFolder, additionalModuleKindToEmit.outFolderName)
        );
      }
    }
  }

  private async _runTypeScriptAsync(logger: ScopedLogger, options: IRunTypeScriptOptions): Promise<void> {
    const { heftSession, heftConfiguration, buildProperties, watchMode } = options;

    const typescriptConfigurationJson: ITypeScriptConfigurationJson | undefined =
      await this._ensureConfigFileLoadedAsync(logger.terminal, heftConfiguration);

    const { project = './tsconfig.json' } = typescriptConfigurationJson || {};

    const tsconfigFilePath: string = Path.convertToSlashes(
      path.resolve(heftConfiguration.buildFolder, project)
    );
    logger.terminal.writeVerboseLine(`Looking for tsconfig at ${tsconfigFilePath}`);
    buildProperties.isTypeScriptProject = await FileSystem.existsAsync(tsconfigFilePath);
    if (!buildProperties.isTypeScriptProject) {
      // If there are no TSConfig, we have nothing to do
      return;
    }

    const typeScriptConfiguration: ITypeScriptConfiguration = {
      additionalModuleKindsToEmit: typescriptConfigurationJson?.additionalModuleKindsToEmit,
      buildProjectReferences: typescriptConfigurationJson?.buildProjectReferences,
      emitCjsExtensionForCommonJS: typescriptConfigurationJson?.emitCjsExtensionForCommonJS,
      emitMjsExtensionForESModule: typescriptConfigurationJson?.emitMjsExtensionForESModule,
      emitFolderNameForTests: typescriptConfigurationJson?.emitFolderNameForTests,
      maxWriteParallelism: typescriptConfigurationJson?.maxWriteParallelism || 50,
      isLintingEnabled: !(buildProperties.lite || typescriptConfigurationJson?.disableTslint)
    };

    const toolPackageResolution: IToolPackageResolution =
      await this._taskPackageResolver.resolveToolPackagesAsync(heftConfiguration, logger.terminal);
    if (!toolPackageResolution.typeScriptPackagePath) {
      throw new Error('Unable to resolve a TypeScript compiler package');
    }

    // Set some properties used by the Jest plugin
    buildProperties.emitFolderNameForTests = typeScriptConfiguration.emitFolderNameForTests || 'lib';
    buildProperties.emitExtensionForTests = typeScriptConfiguration.emitCjsExtensionForCommonJS
      ? '.cjs'
      : '.js';

    const typeScriptBuilderConfiguration: ITypeScriptBuilderConfiguration = {
      buildFolder: heftConfiguration.buildFolder,
      buildMetadataFolder: Path.convertToSlashes(`${heftConfiguration.buildFolder}/temp`),
      typeScriptToolPath: toolPackageResolution.typeScriptPackagePath!,
      tslintToolPath: toolPackageResolution.tslintPackagePath,
      eslintToolPath: toolPackageResolution.eslintPackagePath,

      buildProjectReferences: typescriptConfigurationJson?.buildProjectReferences,

      tsconfigPath: tsconfigFilePath,
      lintingEnabled: !!typeScriptConfiguration.isLintingEnabled,
      additionalModuleKindsToEmit: typeScriptConfiguration.additionalModuleKindsToEmit,
      emitCjsExtensionForCommonJS: !!typeScriptConfiguration.emitCjsExtensionForCommonJS,
      emitMjsExtensionForESModule: !!typeScriptConfiguration.emitMjsExtensionForESModule,
      watchMode: watchMode,
      maxWriteParallelism: typeScriptConfiguration.maxWriteParallelism
    };
    const typeScriptBuilder: TypeScriptBuilder = new TypeScriptBuilder(
      heftConfiguration.terminalProvider,
      typeScriptBuilderConfiguration,
      heftSession,
      options.emitCallback
    );

    if (heftSession.debugMode) {
      await typeScriptBuilder.invokeAsync();
    } else {
      await typeScriptBuilder.invokeAsSubprocessAsync();
    }
  }
}
