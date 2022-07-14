// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SyncHook } from 'tapable';
import { FileSystem, Path, type ITerminal } from '@rushstack/node-core-library';
import {
  ConfigurationFile,
  InheritanceType,
  PathResolutionMethod
} from '@rushstack/heft-config-file';
import type {
  HeftConfiguration,
  IHeftTaskSession,
  IHeftTaskPlugin,
  IHeftTaskRunHookOptions,
  IHeftTaskCleanHookOptions
} from '@rushstack/heft';

import { TypeScriptBuilder, ITypeScriptBuilderConfiguration } from './TypeScriptBuilder';
import type { IExtendedProgram, IExtendedSourceFile } from './internalTypings/TypeScriptInternals';

const PLUGIN_NAME: 'typescript' = 'typescript';

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
export interface IPartialTsconfigCompilerOptions {
  outDir?: string;
}

/**
 * @beta
 */
export interface IPartialTsconfig {
  compilerOptions?: IPartialTsconfigCompilerOptions;
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
}

let _typeScriptConfigurationFileLoader: ConfigurationFile<ITypeScriptConfigurationJson> | undefined;
const _typeScriptConfigurationFilePromiseCache: Map<
  string,
  Promise<ITypeScriptConfigurationJson | undefined>
> = new Map();

/**
 * @beta
 */
export async function loadTypeScriptConfigurationFileAsync(
  heftConfiguration: HeftConfiguration,
  terminal: ITerminal
): Promise<ITypeScriptConfigurationJson | undefined> {
  const buildFolder: string = heftConfiguration.buildFolder;

  // Check the cache first
  let typescriptConfigurationFilePromise: Promise<ITypeScriptConfigurationJson | undefined> | undefined =
    _typeScriptConfigurationFilePromiseCache.get(buildFolder);

  if (!typescriptConfigurationFilePromise) {
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
      });
    }

    typescriptConfigurationFilePromise =
      _typeScriptConfigurationFileLoader.tryLoadConfigurationFileForProjectAsync(
        terminal,
        buildFolder,
        heftConfiguration.rigConfig
      );
    _typeScriptConfigurationFilePromiseCache.set(buildFolder, typescriptConfigurationFilePromise);
  }

  return await typescriptConfigurationFilePromise;
}

let _partialTsconfigFileLoader: ConfigurationFile<IPartialTsconfig> | undefined;
const _partialTsconfigFilePromiseCache: Map<string, Promise<IPartialTsconfig | undefined>> = new Map();

function getTsconfigFilePath(
  heftConfiguration: HeftConfiguration,
  typeScriptConfigurationJson?: ITypeScriptConfigurationJson
): string {
  return Path.convertToSlashes(
    `${heftConfiguration.buildFolder}/${typeScriptConfigurationJson?.project || './tsconfig.json'}`
  );
}

/**
 * @beta
 */
export async function loadPartialTsconfigFileAsync(
  heftConfiguration: HeftConfiguration,
  terminal: ITerminal,
  typeScriptConfigurationJson: ITypeScriptConfigurationJson | undefined
): Promise<IPartialTsconfig | undefined> {
  const buildFolder: string = heftConfiguration.buildFolder;

  // Check the cache first
  let partialTsconfigFilePromise: Promise<IPartialTsconfig | undefined> | undefined =
    _partialTsconfigFilePromiseCache.get(buildFolder);

  if (!partialTsconfigFilePromise) {
    // We don't want to load the tsconfig.json file through the rig, but we do want to take
    // advantage of the extends functionality that ConfigurationFile provides. So we'll
    // check to see if the file exists and exit early if not.

    const tsconfigFilePath: string = getTsconfigFilePath(heftConfiguration, typeScriptConfigurationJson);
    terminal.writeVerboseLine(`Looking for tsconfig at ${tsconfigFilePath}`);
    const tsconfigExists: boolean = await FileSystem.existsAsync(tsconfigFilePath);
    if (!tsconfigExists) {
      partialTsconfigFilePromise = Promise.resolve(undefined);
    } else {
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

      partialTsconfigFilePromise = _partialTsconfigFileLoader.loadConfigurationFileForProjectAsync(
        terminal,
        buildFolder,
        heftConfiguration.rigConfig
      );
    }
    _partialTsconfigFilePromiseCache.set(buildFolder, partialTsconfigFilePromise);
  }

  return await partialTsconfigFilePromise;
}

export default class TypeScriptPlugin implements IHeftTaskPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public accessor: ITypeScriptPluginAccessor = {
    onChangedFilesHook: new SyncHook<IChangedFilesHookOptions>(['changedFilesHookOptions'])
  };

  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    taskSession.hooks.clean.tapPromise(PLUGIN_NAME, async (cleanOptions: IHeftTaskCleanHookOptions) => {
      await this._updateClean(taskSession, heftConfiguration, cleanOptions);
    });

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      await this._runTypeScriptAsync(taskSession, heftConfiguration);
      // TODO: We should consider maybe only doing one copy of static assets and pointing
      // all source files to this set of static assets. This would allow us to avoid
      // having to copy the static assets multiple times, increasing build times and
      // package size.
      await this._updateStaticAssetsToCopy(taskSession, heftConfiguration, runOptions);
    });
  }

  private async _updateClean(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    cleanOptions: IHeftTaskCleanHookOptions
  ): Promise<void> {
    const configurationFile: ITypeScriptConfigurationJson | undefined =
      await loadTypeScriptConfigurationFileAsync(heftConfiguration, taskSession.logger.terminal);

    // For now, delete the entire output folder and additional module kind output folders. In the future,
    // we may want to clean specific files that we know are produced by the TypeScript compiler.
    const tsconfigOutDir: string | undefined = await this._getTsconfigOutDirAsync(
      taskSession,
      heftConfiguration,
      configurationFile
    );
    if (tsconfigOutDir) {
      cleanOptions.addDeleteOperations({ sourcePath: tsconfigOutDir });
    }

    if (configurationFile?.additionalModuleKindsToEmit) {
      for (const additionalModuleKindToEmit of configurationFile.additionalModuleKindsToEmit) {
        cleanOptions.addDeleteOperations({
          sourcePath: `${heftConfiguration.buildFolder}/${additionalModuleKindToEmit.outFolderName}`
        });
      }
    }
  }

  private async _updateStaticAssetsToCopy(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    runOptions: IHeftTaskRunHookOptions
  ): Promise<void> {
    const typeScriptConfiguration: ITypeScriptConfigurationJson | undefined =
      await loadTypeScriptConfigurationFileAsync(heftConfiguration, taskSession.logger.terminal);

    // We only care about the copy if static assets were specified.
    if (
      typeScriptConfiguration?.staticAssetsToCopy?.fileExtensions?.length ||
      typeScriptConfiguration?.staticAssetsToCopy?.includeGlobs?.length ||
      typeScriptConfiguration?.staticAssetsToCopy?.excludeGlobs?.length
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
        destinationFolderPaths.add(`${heftConfiguration.buildFolder}/${emitModule.outFolderName}`);
      }

      runOptions.addCopyOperations({
        ...typeScriptConfiguration?.staticAssetsToCopy,

        // For now - these may need to be revised later
        sourcePath: 'src',
        destinationFolders: Array.from(destinationFolderPaths),
        flatten: false,
        hardlink: false
      });
    }
  }

  private async _runTypeScriptAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration
  ): Promise<void> {
    const terminal: ITerminal = taskSession.logger.terminal;

    const typeScriptToolPath: string = await heftConfiguration.rigToolResolver.resolvePackageAsync(
      'typescript',
      terminal
    );

    const typeScriptConfigurationJson: ITypeScriptConfigurationJson | undefined =
      await loadTypeScriptConfigurationFileAsync(heftConfiguration, terminal);

    const partialTsconfigFile: IPartialTsconfig | undefined = await loadPartialTsconfigFileAsync(
      heftConfiguration,
      terminal,
      typeScriptConfigurationJson
    );

    if (!partialTsconfigFile) {
      // There is no tsconfig file, we can exit early
      return;
    }

    // Build out the configuration
    const typeScriptBuilderConfiguration: ITypeScriptBuilderConfiguration = {
      buildFolder: heftConfiguration.buildFolder,
      buildMetadataFolder: taskSession.cacheFolder,
      typeScriptToolPath: typeScriptToolPath,

      buildProjectReferences: typeScriptConfigurationJson?.buildProjectReferences,

      tsconfigPath: getTsconfigFilePath(heftConfiguration, typeScriptConfigurationJson),
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

  private async _getTsconfigOutDirAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    typeScriptConfiguration: ITypeScriptConfigurationJson | undefined
  ): Promise<string | undefined> {
    const partialTsconfigFile: IPartialTsconfig | undefined = await loadPartialTsconfigFileAsync(
      heftConfiguration,
      taskSession.logger.terminal,
      typeScriptConfiguration
    );
    return partialTsconfigFile?.compilerOptions?.outDir;
  }
}
