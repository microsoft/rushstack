// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import type * as TTypescript from 'typescript';
import { SyncHook } from 'tapable';
import { FileSystem, Path } from '@rushstack/node-core-library';
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
  IScopedLogger,
  IProjectConfigurationFileSpecification,
  IJavaScriptEmitKindsConfigurationJson,
  IJavaScriptEmitKind,
  JavaScriptTarget,
  JavaScriptModuleKind
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
  module?: keyof TTypescript.ModuleKind;
  target?: keyof TTypescript.ScriptTarget;
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

const TYPESCRIPT_LOADER_CONFIG: IProjectConfigurationFileSpecification<ITypeScriptConfigurationJson> = {
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

interface ITypeScriptConfigurationJsonAndPartialTsconfigFile {
  configJson: ITypeScriptConfigurationJson | undefined;
  tsConfigFile: IPartialTsconfig | undefined;
}

export default class TypeScriptPlugin implements IHeftTaskPlugin {
  public accessor: ITypeScriptPluginAccessor = {
    onChangedFilesHook: new SyncHook<IChangedFilesHookOptions>(['changedFilesHookOptions'])
  };

  private _validatedEmitKinds: boolean = false;

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
    const { configJson: typeScriptConfiguration, tsConfigFile: tsconfigFile } =
      await this._loadAndValidateConfigAsync(taskSession, heftConfiguration);

    // We only care about the copy if static assets were specified.
    const copyOperations: ICopyOperation[] = [];
    if (
      typeScriptConfiguration?.staticAssetsToCopy?.fileExtensions?.length ||
      typeScriptConfiguration?.staticAssetsToCopy?.includeGlobs?.length ||
      typeScriptConfiguration?.staticAssetsToCopy?.excludeGlobs?.length
    ) {
      const destinationFolderPaths: Set<string> = new Set<string>();

      // Add the output folder and all additional module kind output folders as destinations
      const tsconfigOutDir: string | undefined = tsconfigFile?.compilerOptions?.outDir;
      if (tsconfigOutDir) {
        destinationFolderPaths.add(tsconfigOutDir);
      }

      for (const emitModule of typeScriptConfiguration?.additionalModuleKindsToEmit || []) {
        destinationFolderPaths.add(emitModule.outFolderName);
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

    const { configJson: typeScriptConfigurationJson, tsConfigFile: partialTsconfigFile } =
      await this._loadAndValidateConfigAsync(taskSession, heftConfiguration);

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

      onlyResolveSymlinksInNodeModules: typeScriptConfigurationJson?.onlyResolveSymlinksInNodeModules,

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

  private async _loadAndValidateConfigAsync(
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

    if (partialTsconfigFile) {
      await this._validateEmitKindsAsync(
        heftConfiguration,
        taskSession.logger,
        typeScriptConfigurationJson,
        partialTsconfigFile
      );
    }

    return {
      configJson: typeScriptConfigurationJson,
      tsConfigFile: partialTsconfigFile
    };
  }

  private async _validateEmitKindsAsync(
    heftConfiguration: HeftConfiguration,
    logger: IScopedLogger,
    typeScriptConfigurationJson: ITypeScriptConfigurationJson | undefined,
    partialTsconfigFile: IPartialTsconfig
  ): Promise<void> {
    if (this._validatedEmitKinds) {
      return;
    }

    this._validatedEmitKinds = true;

    const locallyConfiguredOutputKinds: Map<string, IJavaScriptEmitKind> = new Map();
    const { compilerOptions } = partialTsconfigFile;
    let configuredTarget: JavaScriptTarget | undefined;
    if (compilerOptions?.outDir) {
      const { outDir, target = 'ES5' } = compilerOptions;

      const { module = target === 'ES5' ? 'CommonJS' : 'ES2015' } = compilerOptions;

      configuredTarget = target.toLowerCase() as JavaScriptTarget;

      locallyConfiguredOutputKinds.set(outDir, {
        outputFolder: outDir,
        moduleKind: module.toLowerCase() as JavaScriptModuleKind,
        target: configuredTarget
      });
    }

    if (typeScriptConfigurationJson) {
      const { additionalModuleKindsToEmit } = typeScriptConfigurationJson;
      if (additionalModuleKindsToEmit) {
        for (const emitKind of additionalModuleKindsToEmit) {
          locallyConfiguredOutputKinds.set(emitKind.outFolderName, {
            outputFolder: emitKind.outFolderName,
            moduleKind: emitKind.moduleKind as JavaScriptModuleKind,
            target: configuredTarget ?? 'esnext'
          });
        }
      }
    }

    const { JavaScriptEmitKinds } = heftConfiguration.wellKnownConfigurationFiles;
    const javascriptEmitKindsConfiguration: IJavaScriptEmitKindsConfigurationJson | undefined =
      await heftConfiguration.tryLoadProjectConfigurationFileAsync(JavaScriptEmitKinds, logger.terminal);

    if (javascriptEmitKindsConfiguration) {
      const { projectRelativeFilePath: globalConfigPath } = JavaScriptEmitKinds;
      const { projectRelativeFilePath: typescriptConfigPath } = TYPESCRIPT_LOADER_CONFIG;

      const { emitKinds: globalEmitKinds } = javascriptEmitKindsConfiguration;
      const globalEmitKindMap: Map<string, IJavaScriptEmitKind> = new Map();
      for (const globalEmitKind of globalEmitKinds) {
        const { outputFolder } = globalEmitKind;
        const emitKind: IJavaScriptEmitKind | undefined = locallyConfiguredOutputKinds.get(outputFolder);
        if (!emitKind) {
          logger.emitWarning(
            new Error(
              `The configuration at "${globalConfigPath}" says to emit "${globalEmitKind.moduleKind}" modules targeting "${globalEmitKind.target}" to the "${outputFolder}" folder, but this folder is not configured in the TypeScript plugin. Please add the entry to "${typescriptConfigPath}" if it should be emitted or remove it from "${globalConfigPath}" if it should not.`
            )
          );
          continue;
        }

        globalEmitKindMap.set(outputFolder, globalEmitKind);
      }

      for (const [outputFolder, emitKind] of locallyConfiguredOutputKinds) {
        const globalEmitKind: IJavaScriptEmitKind | undefined = globalEmitKindMap.get(outputFolder);
        if (!globalEmitKind) {
          logger.emitWarning(
            new Error(
              `The TypeScript plugin is emitting "${emitKind.moduleKind}" modules targeting "${emitKind.target}" to the "${outputFolder}" folder, but this folder has not been registered in the global config at "${globalConfigPath}". Please remove the entry from "${typescriptConfigPath}" task if it should not be emitted or add it to "${globalConfigPath}" if it should.`
            )
          );
        } else if (
          emitKind.moduleKind !== globalEmitKind.moduleKind ||
          emitKind.target !== globalEmitKind.target
        ) {
          logger.emitWarning(
            new Error(
              `The TypeScript plugin is emitting "${emitKind.moduleKind}" modules targeting "${emitKind.target}" to the "${outputFolder}" folder, but this folder has been registered for emitting "${globalEmitKind.moduleKind}" modules targeting "${globalEmitKind.target}" in "${globalConfigPath}". Please update one of the config files.`
            )
          );
        }
      }
    }
  }
}
