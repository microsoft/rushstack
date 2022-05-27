// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { SyncHook } from 'tapable';
import { FileSystem, Path, type ITerminal } from '@rushstack/node-core-library';
import {
  ConfigurationFile,
  InheritanceType,
  PathResolutionMethod,
  type IConfigurationFileOptions
} from '@rushstack/heft-config-file';
import type {
  HeftConfiguration,
  HeftTaskSession,
  IHeftTaskPlugin,
  IHeftTaskRunHookOptions,
  IIHeftTaskCleanHookOptions
} from '@rushstack/heft';

import { TypeScriptBuilder, ITypeScriptBuilderConfiguration } from './TypeScriptBuilder';
import type { IExtendedProgram, IExtendedSourceFile } from './internalTypings/TypeScriptInternals';

const PLUGIN_NAME: string = 'typescript';

/**
 * @beta
 */
export interface IEmitModuleKind {
  moduleKind: 'commonjs' | 'amd' | 'umd' | 'system' | 'es2015' | 'esnext';
  outFolderName: string;
  jsExtensionOverride?: string;
}

/**
 * @beta
 */
export interface IStaticAssetsCopyConfiguration {
  fileExtensions: string[];
  excludeGlobs: string[];
  includeGlobs: string[];
}

/**
 * @beta
 */
export interface ITypeScriptConfigurationJson {
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
  staticAssetsToCopy?: IStaticAssetsCopyConfiguration;

  /**
   * Set this to change the maximum number of file handles that will be opened concurrently for writing.
   * The default is 50.
   */
  maxWriteParallelism?: number;
}

/**
 * @beta
 */
export interface IChangedFilesHookOptions {
  program: IExtendedProgram;
  changedFiles?: Set<IExtendedSourceFile>;
}

/**
 * @beta
 */
export interface ITypeScriptPluginAccessor {
  readonly onChangedFilesHook?: SyncHook<IChangedFilesHookOptions>;
  readonly onTypeScriptConfigurationLoadedHook?: SyncHook<ITypeScriptConfigurationJson>;
}

interface ITypeScriptConfigurationFileCacheEntry {
  configurationFile: ITypeScriptConfigurationJson | undefined;
}

interface IPartialTsconfigCompilerOptions {
  outDir?: string;
}

interface IPartialTsconfig {
  compilerOptions?: IPartialTsconfigCompilerOptions;
}

let _typeScriptConfigurationFileLoader: ConfigurationFile<ITypeScriptConfigurationJson> | undefined;
const _typeScriptConfigurationFileCache: Map<string, ITypeScriptConfigurationFileCacheEntry> = new Map();

let _partialTsconfigFileLoader: ConfigurationFile<IPartialTsconfig> | undefined;
const _partialTsconfigFileCache: Map<string, IPartialTsconfig> = new Map();

export class TypeScriptPlugin implements IHeftTaskPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public accessor: ITypeScriptPluginAccessor = {
    onChangedFilesHook: new SyncHook<IChangedFilesHookOptions>(['changedFilesHookOptions']),
    onTypeScriptConfigurationLoadedHook: new SyncHook<ITypeScriptConfigurationJson>(['configurationJson'])
  };

  public apply(taskSession: HeftTaskSession, heftConfiguration: HeftConfiguration): void {
    taskSession.hooks.clean.tapPromise(PLUGIN_NAME, async (cleanOptions: IIHeftTaskCleanHookOptions) => {
      await this._updateClean(taskSession, heftConfiguration, cleanOptions);
    });

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      await this._runTypeScriptAsync(taskSession, heftConfiguration);
      await this._updateStaticAssetsToCopy(taskSession, heftConfiguration, runOptions);
    });
  }

  private async _updateClean(
    taskSession: HeftTaskSession,
    heftConfiguration: HeftConfiguration,
    cleanOptions: IIHeftTaskCleanHookOptions
  ): Promise<void> {
    const configurationFile: ITypeScriptConfigurationJson | undefined =
      await this._loadTypescriptConfigurationFileAsync(heftConfiguration, taskSession.logger.terminal);

    // For now, delete the entire output folder and additional module kind output folders. In the future,
    // we may want to clean specific files that we know are produced by the TypeScript compiler.
    const tsconfigOutDir: string | undefined = await this._getTsconfigOutDirAsync(
      taskSession,
      heftConfiguration,
      configurationFile
    );
    if (tsconfigOutDir) {
      cleanOptions.addDeleteOperations({ sourceFolder: tsconfigOutDir });
    }

    if (configurationFile?.additionalModuleKindsToEmit) {
      for (const additionalModuleKindToEmit of configurationFile.additionalModuleKindsToEmit) {
        cleanOptions.addDeleteOperations({
          sourceFolder: path.resolve(heftConfiguration.buildFolder, additionalModuleKindToEmit.outFolderName)
        });
      }
    }
  }

  private async _updateStaticAssetsToCopy(
    taskSession: HeftTaskSession,
    heftConfiguration: HeftConfiguration,
    runOptions: IHeftTaskRunHookOptions
  ): Promise<void> {
    const typeScriptConfiguration: ITypeScriptConfigurationJson | undefined =
      await this._loadTypescriptConfigurationFileAsync(heftConfiguration, taskSession.logger.terminal);

    // We only care about the copy if static assets were specified.
    if (
      typeScriptConfiguration?.staticAssetsToCopy &&
      (typeScriptConfiguration.staticAssetsToCopy.fileExtensions?.length ||
        typeScriptConfiguration.staticAssetsToCopy.includeGlobs?.length ||
        typeScriptConfiguration.staticAssetsToCopy.excludeGlobs?.length)
    ) {
      const destinationFolderPaths: Set<string> = new Set<string>();

      // Add the output folder and all additional module kind output folders as destinations
      const tsconfigOutDir: string | undefined = await this._getTsconfigOutDirAsync(
        taskSession,
        heftConfiguration,
        typeScriptConfiguration
      );
      if (tsconfigOutDir) {
        destinationFolderPaths.add(tsconfigOutDir);
      }
      for (const emitModule of typeScriptConfiguration?.additionalModuleKindsToEmit || []) {
        destinationFolderPaths.add(path.resolve(heftConfiguration.buildFolder, emitModule.outFolderName));
      }

      runOptions.addCopyOperations({
        ...typeScriptConfiguration?.staticAssetsToCopy,

        // For now - these may need to be revised later
        sourceFolder: 'src',
        destinationFolders: Array.from(destinationFolderPaths),
        flatten: false,
        hardlink: false
      });
    }
  }

  private async _runTypeScriptAsync(
    taskSession: HeftTaskSession,
    heftConfiguration: HeftConfiguration
  ): Promise<void> {
    const terminal: ITerminal = taskSession.logger.terminal;

    const typeScriptToolPath: string = await heftConfiguration.rigToolResolver.resolvePackageAsync(
      'typescript',
      terminal
    );

    const typeScriptConfigurationJson: ITypeScriptConfigurationJson | undefined =
      await this._loadTypescriptConfigurationFileAsync(heftConfiguration, terminal);

    const tsconfigFilePath: string = this._getTsconfigFilePath(
      heftConfiguration,
      typeScriptConfigurationJson
    );

    const partialTsconfigFile: IPartialTsconfig | undefined = await this._loadPartialTsconfigFile(
      heftConfiguration,
      terminal,
      tsconfigFilePath
    );

    if (!partialTsconfigFile) {
      // There is no tsconfig file, we can exit early
      return;
    }

    // Provide the loaded typescript configuration to dependent plugins
    if (this.accessor.onTypeScriptConfigurationLoadedHook!.isUsed()) {
      this.accessor.onTypeScriptConfigurationLoadedHook!.call(typeScriptConfigurationJson);
    }

    // Build out the configuration
    const typeScriptBuilderConfiguration: ITypeScriptBuilderConfiguration = {
      buildFolder: heftConfiguration.buildFolder,
      buildMetadataFolder: Path.convertToSlashes(`${heftConfiguration.buildFolder}/temp`),
      typeScriptToolPath: typeScriptToolPath,

      buildProjectReferences: typeScriptConfigurationJson?.buildProjectReferences,

      tsconfigPath: tsconfigFilePath,
      additionalModuleKindsToEmit: typeScriptConfigurationJson?.additionalModuleKindsToEmit,
      emitCjsExtensionForCommonJS: !!typeScriptConfigurationJson?.emitCjsExtensionForCommonJS,
      emitMjsExtensionForESModule: !!typeScriptConfigurationJson?.emitMjsExtensionForESModule,
      // watchMode: watchMode,
      maxWriteParallelism: typeScriptConfigurationJson?.maxWriteParallelism || 50,
      scopedLogger: taskSession.logger,
      emitChangedFilesCallback: (program: IExtendedProgram, changedFiles?: Set<IExtendedSourceFile>) => {
        // Provide the typescript program dependent plugins
        if (this.accessor.onChangedFilesHook!.isUsed()) {
          this.accessor.onChangedFilesHook!.call({ program, changedFiles });
        }
      }
    };

    // Run the builder
    const typeScriptBuilder: TypeScriptBuilder = new TypeScriptBuilder(typeScriptBuilderConfiguration);
    await typeScriptBuilder.invokeAsync();
  }

  private async _loadTypescriptConfigurationFileAsync(
    heftConfiguration: HeftConfiguration,
    terminal: ITerminal
  ): Promise<ITypeScriptConfigurationJson | undefined> {
    const buildFolder: string = heftConfiguration.buildFolder;

    // Check the cache first
    let typescriptConfigurationFileCacheEntry: ITypeScriptConfigurationFileCacheEntry | undefined =
      _typeScriptConfigurationFileCache.get(buildFolder);

    if (!typescriptConfigurationFileCacheEntry) {
      // Ensure that the file loader has been initialized.
      if (!_typeScriptConfigurationFileLoader) {
        const schemaPath: string = `${__dirname}/schemas/typescript.schema.json`;
        _typeScriptConfigurationFileLoader = new ConfigurationFile<ITypeScriptConfigurationJson>({
          projectRelativeFilePath: 'config/typescript.json',
          jsonSchemaPath: schemaPath,
          propertyInheritance: {
            staticAssetsToCopy: {
              // When merging objects, arrays will be automatically appended
              inheritanceType: InheritanceType.merge
            }
          }
        } as IConfigurationFileOptions<ITypeScriptConfigurationJson>);
      }

      typescriptConfigurationFileCacheEntry = {
        configurationFile: await _typeScriptConfigurationFileLoader.tryLoadConfigurationFileForProjectAsync(
          terminal,
          buildFolder,
          heftConfiguration.rigConfig
        )
      };
      _typeScriptConfigurationFileCache.set(buildFolder, typescriptConfigurationFileCacheEntry);
    }

    return typescriptConfigurationFileCacheEntry.configurationFile;
  }

  private async _loadPartialTsconfigFile(
    heftConfiguration: HeftConfiguration,
    terminal: ITerminal,
    tsconfigFilePath: string
  ): Promise<IPartialTsconfig | undefined> {
    const buildFolder: string = heftConfiguration.buildFolder;

    // Check the cache first
    let partialTsconfigFile: IPartialTsconfig | undefined = _partialTsconfigFileCache.get(buildFolder);

    if (!partialTsconfigFile) {
      // We don't want to load the tsconfig.json file through the rig, but we do want to take
      // advantage of the extends functionality that ConfigurationFile provides. So we'll
      // check to see if the file exists and exit early if not.
      terminal.writeVerboseLine(`Looking for tsconfig at ${tsconfigFilePath}`);
      const tsconfigExists: boolean = await FileSystem.existsAsync(tsconfigFilePath);
      if (!tsconfigExists) {
        // No tsconfig file, nothing to load
        return;
      }

      // Ensure that the file loader has been initialized.
      if (!_partialTsconfigFileLoader) {
        const schemaPath: string = `${__dirname}/schemas/anything.schema.json`;
        _partialTsconfigFileLoader = new ConfigurationFile<IPartialTsconfig>({
          projectRelativeFilePath: 'tsconfig.json',
          jsonSchemaPath: schemaPath,
          propertyInheritance: {
            compilerOptions: {
              inheritanceType: InheritanceType.merge
            }
          },
          jsonPathMetadata: {
            '$.compilerOptions.outDir': {
              pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToConfigurationFile
            }
          }
        });
      }

      partialTsconfigFile = await _partialTsconfigFileLoader.loadConfigurationFileForProjectAsync(
        terminal,
        buildFolder,
        heftConfiguration.rigConfig
      );
      _partialTsconfigFileCache.set(buildFolder, partialTsconfigFile);
    }

    return partialTsconfigFile;
  }

  private async _getTsconfigOutDirAsync(
    taskSession: HeftTaskSession,
    heftConfiguration: HeftConfiguration,
    typeScriptConfiguration: ITypeScriptConfigurationJson | undefined
  ): Promise<string | undefined> {
    const tsconfigFilePath: string = this._getTsconfigFilePath(heftConfiguration, typeScriptConfiguration);
    const partialTsconfigFile: IPartialTsconfig | undefined = await this._loadPartialTsconfigFile(
      heftConfiguration,
      taskSession.logger.terminal,
      tsconfigFilePath
    );
    return partialTsconfigFile?.compilerOptions?.outDir;
  }

  private _getTsconfigFilePath(
    heftConfiguration: HeftConfiguration,
    typeScriptConfigurationJson?: ITypeScriptConfigurationJson
  ): string {
    return Path.convertToSlashes(
      path.resolve(heftConfiguration.buildFolder, typeScriptConfigurationJson?.project || './tsconfig.json')
    );
  }
}

export default new TypeScriptPlugin();
