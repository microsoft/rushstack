// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import type * as TTypescript from 'typescript';
import { SyncHook } from 'tapable';
import { FileSystem, Path } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import { ConfigurationFile, InheritanceType, PathResolutionMethod } from '@rushstack/heft-config-file';
import type {
  HeftConfiguration,
  IHeftTaskSession,
  IHeftTaskPlugin,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions,
  ICopyOperation,
  IHeftTaskFileOperations
} from '@rushstack/heft';

import { TypeScriptBuilder, type ITypeScriptBuilderConfiguration } from './TypeScriptBuilder';
import anythingSchema from './schemas/anything.schema.json';
import typescriptConfigSchema from './schemas/typescript.schema.json';

/**
 * The name of the plugin, as specified in heft-plugin.json
 *
 * @public
 */
export const PLUGIN_NAME: 'typescript-plugin' = 'typescript-plugin';

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

  /**
   * If true, and the tsconfig has \"isolatedModules\": true, then transpilation will happen in parallel in a worker thread.
   */
  useTranspilerWorker?: boolean;

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
  program: TTypescript.Program;
  changedFiles?: ReadonlySet<TTypescript.SourceFile>;
}

/**
 * @beta
 */
export interface ITypeScriptPluginAccessor {
  readonly onChangedFilesHook: SyncHook<IChangedFilesHookOptions>;
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
  const buildFolderPath: string = heftConfiguration.buildFolderPath;

  // Check the cache first
  let typescriptConfigurationFilePromise: Promise<ITypeScriptConfigurationJson | undefined> | undefined =
    _typeScriptConfigurationFilePromiseCache.get(buildFolderPath);

  if (!typescriptConfigurationFilePromise) {
    // Ensure that the file loader has been initialized.
    if (!_typeScriptConfigurationFileLoader) {
      _typeScriptConfigurationFileLoader = new ConfigurationFile<ITypeScriptConfigurationJson>({
        projectRelativeFilePath: 'config/typescript.json',
        jsonSchemaObject: typescriptConfigSchema,
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
        buildFolderPath,
        heftConfiguration.rigConfig
      );
    _typeScriptConfigurationFilePromiseCache.set(buildFolderPath, typescriptConfigurationFilePromise);
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
    // Use path.resolve because the path can start with `./` or `../`
    path.resolve(heftConfiguration.buildFolderPath, typeScriptConfigurationJson?.project || './tsconfig.json')
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
  const buildFolderPath: string = heftConfiguration.buildFolderPath;

  // Check the cache first
  let partialTsconfigFilePromise: Promise<IPartialTsconfig | undefined> | undefined =
    _partialTsconfigFilePromiseCache.get(buildFolderPath);

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
        _partialTsconfigFileLoader = new ConfigurationFile<IPartialTsconfig>({
          projectRelativeFilePath: typeScriptConfigurationJson?.project || 'tsconfig.json',
          jsonSchemaObject: anythingSchema,
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
        buildFolderPath,
        heftConfiguration.rigConfig
      );
    }
    _partialTsconfigFilePromiseCache.set(buildFolderPath, partialTsconfigFilePromise);
  }

  return await partialTsconfigFilePromise;
}

export default class TypeScriptPlugin implements IHeftTaskPlugin {
  public accessor: ITypeScriptPluginAccessor = {
    onChangedFilesHook: new SyncHook<IChangedFilesHookOptions>(['changedFilesHookOptions'])
  };

  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    taskSession.hooks.registerFileOperations.tapPromise(
      PLUGIN_NAME,
      async (fileOperations: IHeftTaskFileOperations): Promise<IHeftTaskFileOperations> => {
        // TODO: We should consider maybe only doing one copy of static assets and pointing
        // all source files to this set of static assets. This would allow us to avoid
        // having to copy the static assets multiple times, increasing build times and
        // package size.
        for (const copyOperation of await this._getStaticAssetCopyOperations(
          taskSession,
          heftConfiguration
        )) {
          fileOperations.copyOperations.add(copyOperation);
        }

        return fileOperations;
      }
    );

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      const builder: TypeScriptBuilder | false = await this._getTypeScriptBuilderAsync(
        taskSession,
        heftConfiguration
      );
      if (builder) {
        await builder.invokeAsync();
      }
    });

    let incrementalBuilder: TypeScriptBuilder | undefined | false;
    taskSession.hooks.runIncremental.tapPromise(
      PLUGIN_NAME,
      async (runIncrementalOptions: IHeftTaskRunIncrementalHookOptions) => {
        if (incrementalBuilder === undefined) {
          // eslint-disable-next-line require-atomic-updates
          incrementalBuilder = await this._getTypeScriptBuilderAsync(taskSession, heftConfiguration);
        }

        if (incrementalBuilder) {
          await incrementalBuilder.invokeAsync(runIncrementalOptions.requestRun);
        }
      }
    );
  }

  private async _getStaticAssetCopyOperations(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration
  ): Promise<ICopyOperation[]> {
    const typeScriptConfiguration: ITypeScriptConfigurationJson | undefined =
      await loadTypeScriptConfigurationFileAsync(heftConfiguration, taskSession.logger.terminal);

    // We only care about the copy if static assets were specified.
    const copyOperations: ICopyOperation[] = [];
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
        destinationFolderPaths.add(`${heftConfiguration.buildFolderPath}/${emitModule.outFolderName}`);
      }

      copyOperations.push({
        ...typeScriptConfiguration?.staticAssetsToCopy,

        // For now - these may need to be revised later
        sourcePath: path.resolve(heftConfiguration.buildFolderPath, 'src'),
        destinationFolders: Array.from(destinationFolderPaths),
        flatten: false,
        hardlink: false
      });
    }
    return copyOperations;
  }

  private async _getTypeScriptBuilderAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration
  ): Promise<TypeScriptBuilder | false> {
    const terminal: ITerminal = taskSession.logger.terminal;

    const typeScriptConfigurationJson: ITypeScriptConfigurationJson | undefined =
      await loadTypeScriptConfigurationFileAsync(heftConfiguration, terminal);

    const partialTsconfigFile: IPartialTsconfig | undefined = await loadPartialTsconfigFileAsync(
      heftConfiguration,
      terminal,
      typeScriptConfigurationJson
    );

    if (!partialTsconfigFile) {
      // There is no tsconfig file, we can exit early
      // This check may need watch mode to break on tsconfig addition/deletion
      return false;
    }

    const typeScriptToolPath: string = await heftConfiguration.rigPackageResolver.resolvePackageAsync(
      'typescript',
      terminal
    );

    // Build out the configuration
    const typeScriptBuilderConfiguration: ITypeScriptBuilderConfiguration = {
      buildFolderPath: heftConfiguration.buildFolderPath,
      // Build metadata is just another build output, but we put it in the temp folder because it will
      // usually be discarded when published.
      buildMetadataFolderPath: taskSession.tempFolderPath,
      typeScriptToolPath: typeScriptToolPath,

      buildProjectReferences: typeScriptConfigurationJson?.buildProjectReferences,

      useTranspilerWorker: typeScriptConfigurationJson?.useTranspilerWorker,

      tsconfigPath: getTsconfigFilePath(heftConfiguration, typeScriptConfigurationJson),
      additionalModuleKindsToEmit: typeScriptConfigurationJson?.additionalModuleKindsToEmit,
      emitCjsExtensionForCommonJS: !!typeScriptConfigurationJson?.emitCjsExtensionForCommonJS,
      emitMjsExtensionForESModule: !!typeScriptConfigurationJson?.emitMjsExtensionForESModule,
      scopedLogger: taskSession.logger,
      emitChangedFilesCallback: (
        program: TTypescript.Program,
        changedFiles?: Set<TTypescript.SourceFile>
      ) => {
        // Provide the typescript program dependent plugins
        if (this.accessor.onChangedFilesHook.isUsed()) {
          this.accessor.onChangedFilesHook.call({ program, changedFiles });
        }
      }
    };

    // Run the builder
    const typeScriptBuilder: TypeScriptBuilder = new TypeScriptBuilder(typeScriptBuilderConfiguration);
    return typeScriptBuilder;
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
