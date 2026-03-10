// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type * as TTypescript from 'typescript';
import { SyncHook } from 'tapable';

import { FileSystem } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import { ProjectConfigurationFile, InheritanceType, PathResolutionMethod } from '@rushstack/heft-config-file';
import type {
  HeftConfiguration,
  IHeftTaskSession,
  IHeftTaskPlugin,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions,
  ICopyOperation,
  IHeftTaskFileOperations,
  ConfigurationFile
} from '@rushstack/heft';

import { TypeScriptBuilder, type ITypeScriptBuilderConfiguration } from './TypeScriptBuilder.ts';
import anythingSchema from './schemas/anything.schema.json';
import typescriptConfigSchema from './schemas/typescript.schema.json';
import { getTsconfigFilePath } from './tsconfigLoader.ts';

/**
 * The name of the plugin, as specified in heft-plugin.json
 *
 * @public
 */
export const PLUGIN_NAME: 'typescript-plugin' = 'typescript-plugin';

/**
 * The ${configDir} token supported in TypeScript 5.5
 * @see {@link https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html#the-configdir-template-variable-for-configuration-files}
 */
const CONFIG_DIR_TOKEN: '${configDir}' = '${configDir}';

/**
 * @beta
 */
export interface IEmitModuleKind {
  moduleKind: 'commonjs' | 'amd' | 'umd' | 'system' | 'es2015' | 'esnext';
  outFolderName: string;
  jsExtensionOverride?: string;
  emitModulePackageJson?: boolean;
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

  /**
   * If true, the TypeScript compiler will only resolve symlinks to their targets if the links are in a node_modules folder.
   * This significantly reduces file system operations in typical usage.
   */
  onlyResolveSymlinksInNodeModules?: boolean;

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

const TYPESCRIPT_LOADER_CONFIG: ConfigurationFile.IProjectConfigurationFileSpecification<ITypeScriptConfigurationJson> =
  {
    projectRelativeFilePath: 'config/typescript.json',
    jsonSchemaObject: typescriptConfigSchema,
    propertyInheritance: {
      staticAssetsToCopy: {
        // When merging objects, arrays will be automatically appended
        inheritanceType: InheritanceType.merge
      }
    },
    jsonPathMetadata: {
      '$.additionalModuleKindsToEmit.*.outFolderName': {
        pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
      }
    }
  };

/**
 * @beta
 */
export async function loadTypeScriptConfigurationFileAsync(
  heftConfiguration: HeftConfiguration,
  terminal: ITerminal
): Promise<ITypeScriptConfigurationJson | undefined> {
  return await heftConfiguration.tryLoadProjectConfigurationFileAsync<ITypeScriptConfigurationJson>(
    TYPESCRIPT_LOADER_CONFIG,
    terminal
  );
}

let _partialTsconfigFileLoader: ProjectConfigurationFile<IPartialTsconfig> | undefined;
const _partialTsconfigFilePromiseCache: Map<string, Promise<IPartialTsconfig | undefined>> = new Map();

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

    const tsconfigFilePath: string = getTsconfigFilePath(
      heftConfiguration,
      typeScriptConfigurationJson?.project
    );
    terminal.writeVerboseLine(`Looking for tsconfig at ${tsconfigFilePath}`);
    const tsconfigExists: boolean = await FileSystem.existsAsync(tsconfigFilePath);
    if (!tsconfigExists) {
      partialTsconfigFilePromise = Promise.resolve(undefined);
    } else {
      // Ensure that the file loader has been initialized.
      if (!_partialTsconfigFileLoader) {
        _partialTsconfigFileLoader = new ProjectConfigurationFile<IPartialTsconfig>({
          projectRelativeFilePath: typeScriptConfigurationJson?.project || 'tsconfig.json',
          jsonSchemaObject: anythingSchema,
          propertyInheritance: {
            compilerOptions: {
              inheritanceType: InheritanceType.merge
            }
          },
          jsonPathMetadata: {
            '$.compilerOptions.outDir': {
              pathResolutionMethod: PathResolutionMethod.custom,
              customResolver(
                resolverOptions: ConfigurationFile.IJsonPathMetadataResolverOptions<IPartialTsconfig>
              ): string {
                if (resolverOptions.propertyValue.includes(CONFIG_DIR_TOKEN)) {
                  // Typescript 5.5. introduced the `${configDir}` token to refer to the directory containing the root tsconfig
                  const configDir: string = path.dirname(tsconfigFilePath);
                  // The token is an absolute path, so it should occur at most once.
                  return path.resolve(resolverOptions.propertyValue.replace(CONFIG_DIR_TOKEN, configDir));
                } else {
                  const thisConfigDir: string = path.dirname(resolverOptions.configurationFilePath);
                  return path.resolve(thisConfigDir, resolverOptions.propertyValue);
                }
              }
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

interface ITypeScriptConfigurationJsonAndPartialTsconfigFile {
  typeScriptConfigurationJson: ITypeScriptConfigurationJson | undefined;
  partialTsconfigFile: IPartialTsconfig | undefined;
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
        for (const copyOperation of await this._getStaticAssetCopyOperationsAsync(
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

  private async _getStaticAssetCopyOperationsAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration
  ): Promise<ICopyOperation[]> {
    const { typeScriptConfigurationJson, partialTsconfigFile } = await this._loadConfigAsync(
      taskSession,
      heftConfiguration
    );

    // We only care about the copy if static assets were specified.
    const copyOperations: ICopyOperation[] = [];
    const staticAssetsConfig: IStaticAssetsCopyConfiguration | undefined =
      typeScriptConfigurationJson?.staticAssetsToCopy;
    if (
      staticAssetsConfig &&
      (staticAssetsConfig.fileExtensions?.length ||
        staticAssetsConfig.includeGlobs?.length ||
        staticAssetsConfig.excludeGlobs?.length)
    ) {
      const destinationFolderPaths: Set<string> = new Set<string>();

      // Add the output folder and all additional module kind output folders as destinations
      const tsconfigOutDir: string | undefined = partialTsconfigFile?.compilerOptions?.outDir;
      if (tsconfigOutDir) {
        destinationFolderPaths.add(tsconfigOutDir);
      }

      for (const emitModule of typeScriptConfigurationJson?.additionalModuleKindsToEmit || []) {
        destinationFolderPaths.add(emitModule.outFolderName);
      }

      copyOperations.push({
        ...staticAssetsConfig,

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
    const { typeScriptConfigurationJson, partialTsconfigFile } = await this._loadConfigAsync(
      taskSession,
      heftConfiguration
    );

    if (!partialTsconfigFile) {
      // There is no tsconfig file, we can exit early
      // This check may need watch mode to break on tsconfig addition/deletion
      return false;
    }

    // Build out the configuration
    const typeScriptBuilderConfiguration: ITypeScriptBuilderConfiguration = {
      buildFolderPath: heftConfiguration.buildFolderPath,
      // Build metadata is just another build output, but we put it in the temp folder because it will
      // usually be discarded when published.
      buildMetadataFolderPath: taskSession.tempFolderPath,
      heftConfiguration,

      buildProjectReferences: typeScriptConfigurationJson?.buildProjectReferences,

      useTranspilerWorker: typeScriptConfigurationJson?.useTranspilerWorker,

      onlyResolveSymlinksInNodeModules: typeScriptConfigurationJson?.onlyResolveSymlinksInNodeModules,

      tsconfigPath: getTsconfigFilePath(heftConfiguration, typeScriptConfigurationJson?.project),
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

  private async _loadConfigAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration
  ): Promise<ITypeScriptConfigurationJsonAndPartialTsconfigFile> {
    const terminal: ITerminal = taskSession.logger.terminal;

    const typeScriptConfigurationJson: ITypeScriptConfigurationJson | undefined =
      await loadTypeScriptConfigurationFileAsync(heftConfiguration, terminal);

    const partialTsconfigFile: IPartialTsconfig | undefined = await loadPartialTsconfigFileAsync(
      heftConfiguration,
      terminal,
      typeScriptConfigurationJson
    );

    return {
      typeScriptConfigurationJson,
      partialTsconfigFile
    };
  }
}
