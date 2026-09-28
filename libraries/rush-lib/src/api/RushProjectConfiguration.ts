// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as fs from 'node:fs';

import { AlreadyReportedError, Async, FileSystem, Import, JsonFile, Path } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import { ProjectConfigurationFile, InheritanceType } from '@rushstack/heft-config-file';
import {
  RigConfig,
  type IRigConfig,
  type IRigConfigJson,
  type ILoadForProjectFolderOptions
} from '@rushstack/rig-package';

import type { RushConfigurationProject } from './RushConfigurationProject';
import { RushConstants } from '../logic/RushConstants';
import type { IPhase } from './CommandLineConfiguration';
import { OverlappingPathAnalyzer } from '../utilities/OverlappingPathAnalyzer';
import schemaJson from '../schemas/rush-project.schema.json';
import anythingSchemaJson from '../schemas/anything.schema.json';
import { HotlinkManager } from '../utilities/HotlinkManager';
import type { RushConfiguration } from './RushConfiguration';
import { PhasedCommandEngineProjectConfigurationError } from './PhasedCommandEngineProjectConfigurationError';
import {
  getFileStamp,
  getSettledBeforeNs,
  isFileStatSettled,
  MISSING_FILE_STAMP
} from '../utilities/FileContentStamp';

/**
 * Describes the file structure for the `<project root>/config/rush-project.json` config file.
 * @internal
 */
export interface IRushProjectJson {
  /**
   * The incremental analyzer can skip Rush commands for projects whose input files have
   * not changed since the last build. Normally, every Git-tracked file under the project
   * folder is assumed to be an input. Set incrementalBuildIgnoredGlobs to ignore specific
   * files, specified as globs relative to the project folder. The list of file globs will
   * be interpreted the same way your .gitignore file is.
   */
  incrementalBuildIgnoredGlobs?: string[];

  /**
   * Disable caching for this project. The project will never be restored from cache.
   * This may be useful if this project affects state outside of its folder.
   *
   * This option is only used when the build cache is enabled for the repo. You can set
   * disableBuildCacheForProject=true to disable caching for a specific project. This is a useful workaround
   * if that project's build scripts violate the assumptions of the cache, for example by writing
   * files outside the project folder. Where possible, a better solution is to improve the build scripts
   * to be compatible with caching.
   */
  disableBuildCacheForProject?: boolean;

  operationSettings?: IOperationSettings[];
}

/** @alpha */
export interface IRushPhaseSharding {
  /**
   * The number of shards to create.
   */
  count: number;

  /**
   * The format of the argument to pass to the command to indicate the shard index and count.
   *
   * @defaultValue `--shard={shardIndex}/{shardCount}`
   */
  shardArgumentFormat?: string;

  /**
   * An optional argument to pass to the command to indicate the output folder for the shard.
   *  It must end with `{shardIndex}`.
   *
   * @defaultValue `--shard-output-folder=.rush/operations/{phaseName}/shards/{shardIndex}`.
   */
  outputFolderArgumentFormat?: string;

  /**
   * @deprecated Create a separate operation settings object for the shard operation settings with the name `{operationName}:shard`.
   */
  shardOperationSettings?: unknown;
}

/**
 * The granularity at which the Node.js version is included in the build cache hash.
 *
 * - `"major"` - includes only the major version (e.g. `18`)
 * - `"minor"` - includes the major and minor version (e.g. `18.17`)
 * - `"patch"` - includes the full version (e.g. `18.17.1`)
 *
 * @alpha
 */
export type NodeVersionGranularity = 'major' | 'minor' | 'patch';

/**
 * An explicitly selected, non-cacheable Node IPC tool for an unsharded daemon build operation.
 * @alpha
 */
export interface IDaemonIpcConfiguration {
  /**
   * A project-root-relative .js, .cjs or .mjs entrypoint in a dedicated implementation subdirectory.
   * The directory's complete file tree is fingerprinted; imports outside it (other than Node built-ins)
   * are unsupported. Do not write build outputs or ordinary input files into this directory.
   */
  entryPoint: string;
  /** Literal tool arguments, followed by the operation's non-ignored raw custom parameters. */
  args?: string[];
}

/**
 * @alpha
 */
export interface IOperationSettings {
  /**
   * The name of the operation. This should be a key in the `package.json`'s `scripts` object.
   */
  operationName: string;
  /**
   * Explicit Node IPC launcher, used only with daemon.usePersistentIpcRunners for incremental daemon builds.
   * Native shell, rebuild, missing-script/NoOp, and preassigned sharded runners remain unchanged.
   */
  daemonIpc?: IDaemonIpcConfiguration;

  /**
   * Specify the folders where this operation writes its output files. If enabled, the Rush build
   * cache will restore these folders from the cache. The strings are folder names under the project
   * root folder.
   *
   * These folders should not be tracked by Git. They must not contain symlinks.
   */
  outputFolderNames?: string[];

  /**
   * Disable caching for this operation. The operation will never be restored from cache.
   * This may be useful if this operation affects state outside of its folder.
   *
   * This option is only used when the build cache is enabled for the repo. You can set
   * disableBuildCacheForOperation=true to disable caching for a specific project operation.
   * This is a useful workaround if that project's build scripts violate the assumptions of the cache,
   * for example by writing files outside the project folder. Where possible, a better solution is to improve
   * the build scripts to be compatible with caching.
   */
  disableBuildCacheForOperation?: boolean;

  /**
   * An optional list of environment variables that can affect this operation. The values of
   * these environment variables will become part of the hash when reading and writing the build cache.
   *
   * Note: generally speaking, all environment variables available to Rush are also available to any
   * operations performed -- Rush assumes that environment variables do not affect build outputs unless
   * you list them here.
   */
  dependsOnEnvVars?: string[];

  /**
   * Specifies whether and at what granularity the Node.js version should be included in the hash
   * used for the build cache. When enabled, changing the Node.js version at the specified granularity
   * will invalidate cached outputs and cause the operation to be re-executed. This is useful for
   * projects that produce Node.js-version-specific outputs, such as native module builds.
   *
   * Allowed values:
   * - `true` - alias for `"patch"`, includes the full version (e.g. `18.17.1`)
   * - `"major"` - includes only the major version (e.g. `18`)
   * - `"minor"` - includes the major and minor version (e.g. `18.17`)
   * - `"patch"` - includes the full version (e.g. `18.17.1`)
   */
  dependsOnNodeVersion?: boolean | NodeVersionGranularity;

  /**
   * An optional list of glob (minimatch) patterns pointing to files that can affect this operation.
   * The hash values of the contents of these files will become part of the final hash when reading
   * and writing the build cache.
   *
   * Note: if a particular file will be matched by patterns provided by both `incrementalBuildIgnoredGlobs` and
   * `dependsOnAdditionalFiles` options - `dependsOnAdditionalFiles` will win and the file will be included
   * calculating final hash value when reading and writing the build cache
   */
  dependsOnAdditionalFiles?: string[];

  /**
   * An optional config object for sharding the operation. If specified, the operation will be sharded
   * into multiple invocations. The `count` property specifies the number of shards to create. The
   * `shardArgumentFormat` property specifies the format of the argument to pass to the command to
   * indicate the shard index and count. The default value is `--shard={shardIndex}/{shardCount}`.
   */
  sharding?: IRushPhaseSharding;

  /**
   * How many concurrency units this operation should take up during execution. The maximum concurrent units is
   *  determined by the -p flag.
   */
  weight?: number | `${number}%`;

  /**
   * If true, this operation can use cobuilds for orchestration without restoring build cache entries.
   */
  allowCobuildWithoutCache?: boolean;

  /**
   * If true, this operation will never be skipped by the `--changed-projects-only` flag.
   */
  ignoreChangedProjectsOnlyFlag?: boolean;

  /**
   * An optional list of custom command-line parameter names (their `parameterLongName` values from
   * command-line.json) that should be ignored when invoking the command for this operation.
   * This allows a project to opt out of parameters that don't affect its operation, preventing
   * unnecessary cache invalidation for this operation and its consumers.
   */
  parameterNamesToIgnore?: string[];
}

interface IOldRushProjectJson {
  projectOutputFolderNames?: unknown;
  phaseOptions?: unknown;
  buildCacheOptions?: unknown;
}

function createProjectConfigurationFile(): ProjectConfigurationFile<IRushProjectJson> {
  const configurationFile: ProjectConfigurationFile<IRushProjectJson> =
    new ProjectConfigurationFile<IRushProjectJson>({
      projectRelativeFilePath: `config/${RushConstants.rushProjectConfigFilename}`,
      jsonSchemaObject: schemaJson,
      propertyInheritance: {
        operationSettings: {
          inheritanceType: InheritanceType.custom,
          inheritanceFunction: (
            child: IOperationSettings[] | undefined,
            parent: IOperationSettings[] | undefined
          ) => {
            if (!child) {
              return parent;
            } else if (!parent) {
              return child;
            } else {
              // Merge any properties that need to be merged
              const resultOperationSettingsByOperationName: Map<string, IOperationSettings> = new Map();
              for (const parentOperationSettings of parent) {
                resultOperationSettingsByOperationName.set(
                  parentOperationSettings.operationName,
                  parentOperationSettings
                );
              }

              const childEncounteredOperationNames: Set<string> = new Set();
              for (const childOperationSettings of child) {
                const operationName: string = childOperationSettings.operationName;
                if (childEncounteredOperationNames.has(operationName)) {
                  // If the operation settings already exist, but didn't come from the parent, then
                  // it shows up multiple times in the child.
                  const childSourceFilePath: string = configurationFile.getObjectSourceFilePath(child)!;
                  throw new Error(
                    `The operation "${operationName}" occurs multiple times in the "operationSettings" array ` +
                      `in "${childSourceFilePath}".`
                  );
                }

                childEncounteredOperationNames.add(operationName);

                let mergedOperationSettings: IOperationSettings | undefined =
                  resultOperationSettingsByOperationName.get(operationName);
                if (mergedOperationSettings) {
                  // The parent operation settings object already exists
                  const outputFolderNames: string[] | undefined =
                    mergedOperationSettings.outputFolderNames && childOperationSettings.outputFolderNames
                      ? [
                          ...mergedOperationSettings.outputFolderNames,
                          ...childOperationSettings.outputFolderNames
                        ]
                      : mergedOperationSettings.outputFolderNames || childOperationSettings.outputFolderNames;

                  const dependsOnEnvVars: string[] | undefined =
                    mergedOperationSettings.dependsOnEnvVars && childOperationSettings.dependsOnEnvVars
                      ? [
                          ...mergedOperationSettings.dependsOnEnvVars,
                          ...childOperationSettings.dependsOnEnvVars
                        ]
                      : mergedOperationSettings.dependsOnEnvVars || childOperationSettings.dependsOnEnvVars;

                  mergedOperationSettings = {
                    ...mergedOperationSettings,
                    ...childOperationSettings,
                    ...(outputFolderNames ? { outputFolderNames } : {}),
                    ...(dependsOnEnvVars ? { dependsOnEnvVars } : {})
                  };
                  resultOperationSettingsByOperationName.set(operationName, mergedOperationSettings);
                } else {
                  resultOperationSettingsByOperationName.set(operationName, childOperationSettings);
                }
              }

              return Array.from(resultOperationSettingsByOperationName.values());
            }
          }
        },
        incrementalBuildIgnoredGlobs: {
          inheritanceType: InheritanceType.replace
        }
      }
    });
  return configurationFile;
}

const RUSH_PROJECT_CONFIGURATION_FILE: ProjectConfigurationFile<IRushProjectJson> =
  createProjectConfigurationFile();

const OLD_RUSH_PROJECT_CONFIGURATION_FILE: ProjectConfigurationFile<IOldRushProjectJson> =
  new ProjectConfigurationFile<IOldRushProjectJson>({
    projectRelativeFilePath: RUSH_PROJECT_CONFIGURATION_FILE.projectRelativeFilePath,
    jsonSchemaObject: anythingSchemaJson
  });

const _configCache: Map<RushConfigurationProject, RushProjectConfiguration | false> = new Map();

interface IProjectConfigurationLoaders {
  readonly configurationFile: ProjectConfigurationFile<IRushProjectJson>;
  readonly oldConfigurationFile: ProjectConfigurationFile<IOldRushProjectJson>;
}

/** A configuration file that a load read, or found missing. */
interface IConfigurationFileInput {
  /** The path the loader reads. */
  readonly filePath: string;
  readonly stamp: string;
  /** The file's `extends` value and the path it resolved to. */
  readonly parent: { readonly specifier: string; readonly filePath: string } | undefined;
}

/** The rig profile that a project without its own configuration file loads it from. */
interface IRigProfileInput {
  /** `<project>/node_modules/<rig>/package.json`, the first path that the rig package can resolve to. */
  readonly packageJsonPath: string;
  /** `<project>/node_modules/<rig>/profiles/<profile>` */
  readonly profileFolderPath: string;
  /** The profile folder's real path, which the loader reads the rig's configuration file from. */
  readonly realProfileFolderPath: string;
}

interface IProjectConfigurationInputs {
  readonly rigJsonStamp: string;
  readonly ownFileStamp: string;
  readonly rigProfile: IRigProfileInput | undefined;
  /** The loaded file and its `extends` chain, or the missing rig configuration file. */
  readonly files: ReadonlyArray<IConfigurationFileInput>;
}

interface IProjectConfigurationCacheEntry {
  readonly rushProjectJson: IRushProjectJson | undefined;
  readonly jsonForFingerprint: string | undefined;
  /** Undefined if the load can't be reused, for example because one of its files changed too recently. */
  readonly inputs: IProjectConfigurationInputs | undefined;
}

/**
 * The last configuration that {@link RushProjectConfiguration._tryLoadForProjectsUncachedAsync} loaded for a
 * project, with the inputs it was loaded from.
 */
const _currentConfigurationCache: WeakMap<RushConfigurationProject, IProjectConfigurationCacheEntry> =
  new WeakMap();

/**
 * Use this class to load the "config/rush-project.json" config file.
 *
 * This file provides project-specific configuration options.
 * @alpha
 */
export class RushProjectConfiguration {
  public readonly project: RushConfigurationProject;

  /**
   * {@inheritdoc _IRushProjectJson.incrementalBuildIgnoredGlobs}
   */
  public readonly incrementalBuildIgnoredGlobs: ReadonlyArray<string>;

  /**
   * {@inheritdoc _IRushProjectJson.disableBuildCacheForProject}
   */
  public readonly disableBuildCacheForProject: boolean;

  public readonly operationSettingsByOperationName: ReadonlyMap<string, Readonly<IOperationSettings>>;

  readonly #validationCache: WeakSet<object> = new WeakSet();
  readonly #jsonForFingerprint: string;

  private constructor(
    project: RushConfigurationProject,
    rushProjectJson: IRushProjectJson,
    operationSettingsByOperationName: ReadonlyMap<string, IOperationSettings>,
    jsonForFingerprint: string = JSON.stringify(rushProjectJson)
  ) {
    this.project = project;
    this.#jsonForFingerprint = jsonForFingerprint;
    this.incrementalBuildIgnoredGlobs = rushProjectJson.incrementalBuildIgnoredGlobs || [];
    this.disableBuildCacheForProject = rushProjectJson.disableBuildCacheForProject || false;
    this.operationSettingsByOperationName = operationSettingsByOperationName;
  }

  /** @internal */
  public _getJsonForFingerprint(): string {
    return this.#jsonForFingerprint;
  }

  /**
   * Validates that the requested phases are compatible.
   * Deferral of this logic to its own method means that Rush no longer eagerly validates
   * all defined commands in command-line.json. As such, while validation will be run for a given
   * command upon invoking that command, defining overlapping phases in "rush custom-command"
   * that are not used by "rush build" will not cause "rush build" to exit with an error.
   */
  public validatePhaseConfiguration(phases: Iterable<IPhase>, terminal: ITerminal): void {
    // Don't repeatedly validate the same set of phases for the same project.
    if (this.#validationCache.has(phases)) {
      return;
    }

    const overlappingPathAnalyzer: OverlappingPathAnalyzer<string> = new OverlappingPathAnalyzer<string>();

    const { operationSettingsByOperationName, project } = this;

    let hasErrors: boolean = false;

    for (const phase of phases) {
      const operationName: string = phase.name;
      const operationSettings: IOperationSettings | undefined =
        operationSettingsByOperationName.get(operationName);
      if (operationSettings) {
        if (operationSettings.outputFolderNames) {
          for (const outputFolderName of operationSettings.outputFolderNames) {
            const otherOverlappingOperationNames: string[] | undefined =
              overlappingPathAnalyzer.addPathAndGetFirstEncounteredLabels(outputFolderName, operationName);
            if (otherOverlappingOperationNames) {
              const overlapsWithOwnOperation: boolean =
                otherOverlappingOperationNames?.includes(operationName);
              if (overlapsWithOwnOperation) {
                terminal.writeErrorLine(
                  `The project "${project.packageName}" has a ` +
                    `"${RUSH_PROJECT_CONFIGURATION_FILE.projectRelativeFilePath}" configuration that defines an ` +
                    `operation with overlapping paths in the "outputFolderNames" list. The operation is ` +
                    `"${operationName}", and the conflicting path is "${outputFolderName}".`
                );
              } else {
                terminal.writeErrorLine(
                  `The project "${project.packageName}" has a ` +
                    `"${RUSH_PROJECT_CONFIGURATION_FILE.projectRelativeFilePath}" configuration that defines ` +
                    'two operations in the same command whose "outputFolderNames" would overlap. ' +
                    'Operations outputs in the same command must be disjoint so that they can be independently cached. ' +
                    `The "${outputFolderName}" path overlaps between these operations: ` +
                    `"${operationName}", "${otherOverlappingOperationNames.join('", "')}"`
                );
              }

              hasErrors = true;
            }
          }
        }

        // Validate that parameter names to ignore actually exist for this operation
        if (operationSettings.parameterNamesToIgnore) {
          // Build a set of valid parameter names for this phase
          const validParameterNames: Set<string> = new Set<string>();
          for (const parameter of phase.associatedParameters) {
            validParameterNames.add(parameter.longName);
          }

          // Collect all invalid parameter names
          const invalidParameterNames: string[] = [];
          for (const parameterName of operationSettings.parameterNamesToIgnore) {
            if (!validParameterNames.has(parameterName)) {
              invalidParameterNames.push(parameterName);
            }
          }

          // Report all invalid parameters in a single message
          if (invalidParameterNames.length > 0) {
            terminal.writeErrorLine(
              `The project "${project.packageName}" has a ` +
                `"${RUSH_PROJECT_CONFIGURATION_FILE.projectRelativeFilePath}" configuration that specifies ` +
                `invalid parameter(s) in "parameterNamesToIgnore" for operation "${operationName}": ` +
                `${invalidParameterNames.join(', ')}. ` +
                `Valid parameters for this operation are: ${Array.from(validParameterNames).sort().join(', ') || '(none)'}.`
            );
            hasErrors = true;
          }
        }
      }
    }

    this.#validationCache.add(phases);

    if (hasErrors) {
      throw new AlreadyReportedError();
    }
  }

  /**
   * Examines the list of source files for the project and the target phase and returns a reason
   * why the project cannot enable the build cache for that phase, or undefined if it is safe to so do.
   */
  public getCacheDisabledReason(
    trackedFileNames: Iterable<string>,
    phaseName: string,
    isNoOp: boolean
  ): string | undefined {
    const rushConfiguration: RushConfiguration | undefined = this.project.rushConfiguration;
    if (rushConfiguration) {
      const hotlinkManager: HotlinkManager = HotlinkManager.loadFromRushConfiguration(rushConfiguration);
      if (hotlinkManager.hasAnyHotlinksInSubspace(this.project.subspace.subspaceName)) {
        return 'Caching has been disabled for this project because it is in a subspace with hotlinked dependencies.';
      }
    }

    // Skip no-op operations as they won't have any output/cacheable things.
    if (isNoOp) {
      return undefined;
    }
    if (this.disableBuildCacheForProject) {
      return 'Caching has been disabled for this project.';
    }

    const operationSettings: IOperationSettings | undefined =
      this.operationSettingsByOperationName.get(phaseName);
    if (!operationSettings) {
      return `This project does not define the caching behavior of the "${phaseName}" command, so caching has been disabled.`;
    }

    if (operationSettings.disableBuildCacheForOperation) {
      return `Caching has been disabled for this project's "${phaseName}" command.`;
    }

    const { outputFolderNames } = operationSettings;
    if (!outputFolderNames) {
      return;
    }
    const normalizedProjectRelativeFolder: string = Path.convertToSlashes(this.project.projectRelativeFolder);

    const normalizedOutputFolders: string[] = outputFolderNames.map(
      (outputFolderName) => `${normalizedProjectRelativeFolder}/${outputFolderName}/`
    );

    const inputOutputFiles: string[] = [];
    for (const file of trackedFileNames) {
      for (const outputFolder of normalizedOutputFolders) {
        if (file.startsWith(outputFolder)) {
          inputOutputFiles.push(file);
        }
      }
    }

    if (inputOutputFiles.length > 0) {
      return (
        'The following files are used to calculate project state ' +
        `and are considered project output: ${inputOutputFiles.join(', ')}`
      );
    }
  }

  /**
   * Source of truth for whether a project is unable to use the build cache for a given phase.
   * As some operations may not have a rush-project.json file defined at all, but may be no-op operations
   *  we'll want to ignore those completely.
   */
  public static getCacheDisabledReasonForProject(options: {
    projectConfiguration: RushProjectConfiguration | undefined;
    trackedFileNames: Iterable<string>;
    phaseName: string;
    isNoOp: boolean;
  }): string | undefined {
    const { projectConfiguration, trackedFileNames, phaseName, isNoOp } = options;
    if (isNoOp) {
      return undefined;
    }

    if (!projectConfiguration) {
      return (
        `Project does not have a ${RushConstants.rushProjectConfigFilename} configuration file, ` +
        'or one provided by a rig, so it does not support caching.'
      );
    }

    return projectConfiguration.getCacheDisabledReason(trackedFileNames, phaseName, isNoOp);
  }

  /**
   * Loads the rush-project.json data for the specified project.
   */
  public static async tryLoadForProjectAsync(
    project: RushConfigurationProject,
    terminal: ITerminal
  ): Promise<RushProjectConfiguration | undefined> {
    // false is a signal that the project config does not exist
    const cacheEntry: RushProjectConfiguration | false | undefined = _configCache.get(project);
    if (cacheEntry !== undefined) {
      return cacheEntry || undefined;
    }

    const rushProjectJson: IRushProjectJson | undefined = await _tryLoadJsonForProjectAsync(
      project,
      terminal
    );
    if (rushProjectJson) {
      const operationSettingsByOperationName: ReadonlyMap<string, IOperationSettings> =
        _getRushProjectConfiguration(project, rushProjectJson, terminal);
      const result: RushProjectConfiguration = new RushProjectConfiguration(
        project,
        rushProjectJson,
        operationSettingsByOperationName
      );
      _configCache.set(project, result);
      return result;
    } else {
      _configCache.set(project, false);
      return undefined;
    }
  }

  /**
   * Loads a native configuration snapshot of the current files without reading or modifying the process-wide
   * project, inherited-file, or rig caches of other loads. The loaders are owned only by this invocation.
   *
   * @remarks
   * Throws a {@link PhasedCommandEngineProjectConfigurationError} that names a project whose
   * configuration could not be loaded.
   *
   * A project's merged configuration is reused from an earlier call only if every input of its load is
   * unchanged: the stamps (identity, size, mtime and ctime) of its `config/rig.json`, its own
   * `config/rush-project.json`, and each file of the `extends` chain that was loaded; the path each `extends`
   * value resolves to; and, for a configuration that comes from a rig, the real path of the rig profile folder
   * that the project's `node_modules` reaches. A configuration is recorded only if each of its files had
   * already been unchanged for a few seconds when it was examined, and only after a load that succeeded; the
   * warnings are reported again by every call.
   * @internal
   */
  public static async _tryLoadForProjectsUncachedAsync(
    projects: Iterable<RushConfigurationProject>,
    terminal: ITerminal
  ): Promise<ReadonlyMap<RushConfigurationProject, RushProjectConfiguration>> {
    const loaders: IProjectConfigurationLoaders = {
      configurationFile: createProjectConfigurationFile(),
      oldConfigurationFile: new ProjectConfigurationFile<IOldRushProjectJson>({
        projectRelativeFilePath: RUSH_PROJECT_CONFIGURATION_FILE.projectRelativeFilePath,
        jsonSchemaObject: anythingSchemaJson
      })
    };
    const view: ConfigurationInputView = _createConfigurationInputView();
    const result: Map<RushConfigurationProject, RushProjectConfiguration> = new Map();
    await Async.forEachAsync(
      projects,
      async (project) => {
        try {
          const entry: IProjectConfigurationCacheEntry = await _getCurrentConfigurationEntryAsync(
            project,
            terminal,
            loaders,
            view
          );
          const { rushProjectJson } = entry;
          if (rushProjectJson) {
            result.set(
              project,
              new RushProjectConfiguration(
                project,
                rushProjectJson,
                _getRushProjectConfiguration(project, rushProjectJson, terminal),
                entry.jsonForFingerprint
              )
            );
          }
          if (entry.inputs) {
            _currentConfigurationCache.set(project, entry);
          }
        } catch (error) {
          throw new PhasedCommandEngineProjectConfigurationError(project.packageName, error);
        }
      },
      { concurrency: 50 }
    );
    return result;
  }

  /**
   * Load only the `incrementalBuildIgnoredGlobs` property from the rush-project.json file, skipping
   * validation of other parts of the config file.
   *
   * @remarks
   * This function exists to allow the ProjectChangeAnalyzer to load just the ignore globs without
   * having to validate the rest of the `rush-project.json` file against the repo's command-line configuration.
   */
  public static async tryLoadIgnoreGlobsForProjectAsync(
    project: RushConfigurationProject,
    terminal: ITerminal
  ): Promise<ReadonlyArray<string> | undefined> {
    const rushProjectJson: IRushProjectJson | undefined = await _tryLoadJsonForProjectAsync(
      project,
      terminal
    );

    return rushProjectJson?.incrementalBuildIgnoredGlobs;
  }

  /**
   * Load the rush-project.json data for all selected projects.
   * Validate compatibility of output folders across all selected phases.
   */
  public static async tryLoadForProjectsAsync(
    projects: Iterable<RushConfigurationProject>,
    terminal: ITerminal
  ): Promise<ReadonlyMap<RushConfigurationProject, RushProjectConfiguration>> {
    const result: Map<RushConfigurationProject, RushProjectConfiguration> = new Map();

    await Async.forEachAsync(
      projects,
      async (project: RushConfigurationProject) => {
        const projectConfig: RushProjectConfiguration | undefined =
          await RushProjectConfiguration.tryLoadForProjectAsync(project, terminal);
        if (projectConfig) {
          result.set(project, projectConfig);
        }
      },
      { concurrency: 50 }
    );

    return result;
  }
}

async function _tryLoadJsonForProjectAsync(
  project: RushConfigurationProject,
  terminal: ITerminal
): Promise<IRushProjectJson | undefined> {
  return await _tryLoadJsonForProjectWithRigAsync(
    project,
    terminal,
    {
      configurationFile: RUSH_PROJECT_CONFIGURATION_FILE,
      oldConfigurationFile: OLD_RUSH_PROJECT_CONFIGURATION_FILE
    },
    await RigConfig.loadForProjectFolderAsync({ projectFolderPath: project.projectFolder })
  );
}

async function _tryLoadJsonForProjectWithRigAsync(
  project: RushConfigurationProject,
  terminal: ITerminal,
  loaders: IProjectConfigurationLoaders,
  rigConfig: IRigConfig | undefined
): Promise<IRushProjectJson | undefined> {
  const { configurationFile, oldConfigurationFile } = loaders;
  try {
    return await configurationFile.tryLoadConfigurationFileForProjectAsync(
      terminal,
      project.projectFolder,
      rigConfig
    );
  } catch (e1) {
    // Detect if the project is using the old rush-project.json schema
    let oldRushProjectJson: IOldRushProjectJson | undefined;
    try {
      oldRushProjectJson = await oldConfigurationFile.tryLoadConfigurationFileForProjectAsync(
        terminal,
        project.projectFolder,
        rigConfig
      );
    } catch (e2) {
      // Ignore
    }

    if (
      oldRushProjectJson?.projectOutputFolderNames ||
      oldRushProjectJson?.phaseOptions ||
      oldRushProjectJson?.buildCacheOptions
    ) {
      throw new Error(
        `The ${RUSH_PROJECT_CONFIGURATION_FILE.projectRelativeFilePath} file appears to be ` +
          'in an outdated format. Please see the UPGRADING.md notes for details. ' +
          'Quick link: https://rushjs.io/link/upgrading'
      );
    } else {
      throw e1;
    }
  }
}

/**
 * A found rig whose resolved profile folder is the real path of the rig package's profile folder.
 */
class RealProfileFolderRigConfig implements IRigConfig {
  public readonly projectFolderOriginalPath: string;
  public readonly projectFolderPath: string;
  public readonly rigFound: boolean;
  public readonly filePath: string;
  public readonly rigPackageName: string;
  public readonly rigProfile: string;
  public readonly relativeProfileFolderPath: string;
  readonly #rigConfig: IRigConfig;
  readonly #profileFolder: string;

  public constructor(rigConfig: IRigConfig, profileFolder: string) {
    this.projectFolderOriginalPath = rigConfig.projectFolderOriginalPath;
    this.projectFolderPath = rigConfig.projectFolderPath;
    this.rigFound = rigConfig.rigFound;
    this.filePath = rigConfig.filePath;
    this.rigPackageName = rigConfig.rigPackageName;
    this.rigProfile = rigConfig.rigProfile;
    this.relativeProfileFolderPath = rigConfig.relativeProfileFolderPath;
    this.#rigConfig = rigConfig;
    this.#profileFolder = profileFolder;
  }

  public getResolvedProfileFolder(): string {
    return this.#profileFolder;
  }

  public async getResolvedProfileFolderAsync(): Promise<string> {
    return this.#profileFolder;
  }

  public tryResolveConfigFilePath(configFileRelativePath: string): string | undefined {
    return this.#rigConfig.tryResolveConfigFilePath(configFileRelativePath);
  }

  public async tryResolveConfigFilePathAsync(configFileRelativePath: string): Promise<string | undefined> {
    return await this.#rigConfig.tryResolveConfigFilePathAsync(configFileRelativePath);
  }
}

async function loadIsolatedRigConfigAsync(projectFolder: string): Promise<IRigConfig | undefined> {
  let rigJson: IRigConfigJson;
  try {
    rigJson = await JsonFile.loadAsync(path.join(projectFolder, 'config', 'rig.json'));
  } catch (error) {
    if (FileSystem.isNotExistError(error as Error)) return undefined;
    throw error;
  }
  if (!rigJson || typeof rigJson !== 'object' || Array.isArray(rigJson)) {
    throw new Error(`The rig configuration for "${projectFolder}" must be a JSON object.`);
  }
  // bypassCache still writes the shared rig cache. An explicit JSON override uses the
  // native schema/resolution path without either reading or populating that cache.
  const options: ILoadForProjectFolderOptions = {
    projectFolderPath: projectFolder,
    overrideRigJsonObject: rigJson
  };
  const rigConfig: RigConfig = await RigConfig.loadForProjectFolderAsync(options);
  if (rigConfig.rigFound) {
    let profileFolder: string;
    try {
      // The configuration file loader resolves the rig profile synchronously, which serializes these
      // concurrent project loads. Resolving it asynchronously first caches the same result on this instance.
      profileFolder = await rigConfig.getResolvedProfileFolderAsync();
    } catch {
      // A fresh instance reports the failure exactly as the native loader does, if and when the rig is used.
      return await RigConfig.loadForProjectFolderAsync(options);
    }
    // Each project reaches a shared rig through its own node_modules symlink, and the loaders cache by file
    // path. The real profile folder lets every project share one load of the rig's files and "extends" chain.
    return new RealProfileFolderRigConfig(rigConfig, await FileSystem.getRealPathAsync(profileFolder));
  }
  return rigConfig;
}

async function _getCurrentConfigurationEntryAsync(
  project: RushConfigurationProject,
  terminal: ITerminal,
  loaders: IProjectConfigurationLoaders,
  view: ConfigurationInputView
): Promise<IProjectConfigurationCacheEntry> {
  const entry: IProjectConfigurationCacheEntry | undefined = _currentConfigurationCache.get(project);
  if (entry && view.isCurrent(project, entry)) {
    return entry;
  }
  _currentConfigurationCache.delete(project);
  // Examined before the loader reads them.
  const rigJson: IConfigurationFileStat | undefined = view.getStat(getRigJsonPath(project));
  const ownFile: IConfigurationFileStat | undefined = view.getStat(getOwnConfigurationFilePath(project));
  const rigConfig: IRigConfig | undefined = await loadIsolatedRigConfigAsync(project.projectFolder);
  const inputs: IProjectConfigurationInputs | undefined =
    rigJson?.settled && ownFile?.settled
      ? await view.tryGetInputsAsync(project, rigConfig, rigJson.stamp, ownFile.stamp)
      : undefined;
  const rushProjectJson: IRushProjectJson | undefined = await _tryLoadJsonForProjectWithRigAsync(
    project,
    terminal,
    loaders,
    rigConfig
  );
  return {
    rushProjectJson,
    jsonForFingerprint: rushProjectJson && JSON.stringify(rushProjectJson),
    inputs
  };
}

function getRigJsonPath(project: RushConfigurationProject): string {
  return path.join(project.projectFolder, 'config', 'rig.json');
}

function getOwnConfigurationFilePath(project: RushConfigurationProject): string {
  // The path that the loader reads.
  return path.resolve(project.projectFolder, RUSH_PROJECT_CONFIGURATION_FILE.projectRelativeFilePath);
}

interface IConfigurationFileStat {
  readonly stamp: string;
  /** Whether the file had been unchanged long enough for its stamp to identify its content. */
  readonly settled: boolean;
}

const getNativeRealPath: (folderPath: string) => string =
  // As in the "resolve" package, which Windows network paths make fall back to the JavaScript implementation.
  process.platform === 'win32' ? fs.realpathSync : fs.realpathSync.native;

/**
 * The file system state that one {@link RushProjectConfiguration._tryLoadForProjectsUncachedAsync} call compares
 * recorded inputs with. Each fact is examined at most once per call, and a file is always examined before the
 * call's loader reads it.
 */
class ConfigurationInputView {
  readonly #settledBeforeNs: bigint = getSettledBeforeNs();
  readonly #stats: Map<string, IConfigurationFileStat | undefined> = new Map();
  readonly #realPaths: Map<string, string | undefined> = new Map();
  readonly #resolutions: Map<string, string | undefined> = new Map();
  readonly #fileInputs: Map<string, Promise<ReadonlyArray<IConfigurationFileInput> | undefined>> = new Map();

  /** Returns undefined for a path that isn't a regular file or can't be examined. */
  public getStat(filePath: string): IConfigurationFileStat | undefined {
    if (!this.#stats.has(filePath)) {
      let result: IConfigurationFileStat | undefined;
      try {
        // statSync follows links, so dev and ino identify the file whose content is loaded.
        const stat: fs.BigIntStats | undefined = fs.statSync(filePath, { bigint: true, throwIfNoEntry: false });
        if (!stat) {
          result = { stamp: MISSING_FILE_STAMP, settled: true };
        } else if (stat.isFile()) {
          result = { stamp: getFileStamp(stat), settled: isFileStatSettled(stat, this.#settledBeforeNs) };
        }
      } catch (error) {
        if (FileSystem.isNotExistError(error as Error)) {
          result = { stamp: MISSING_FILE_STAMP, settled: true };
        }
      }
      this.#stats.set(filePath, result);
    }
    return this.#stats.get(filePath);
  }

  public isCurrent(project: RushConfigurationProject, entry: IProjectConfigurationCacheEntry): boolean {
    const { inputs } = entry;
    if (
      !inputs ||
      this.getStat(getRigJsonPath(project))?.stamp !== inputs.rigJsonStamp ||
      this.getStat(getOwnConfigurationFilePath(project))?.stamp !== inputs.ownFileStamp ||
      (inputs.rigProfile && !this.#isRigProfileCurrent(inputs.rigProfile))
    ) {
      return false;
    }
    return inputs.files.every(
      ({ filePath, stamp, parent }) =>
        this.getStat(filePath)?.stamp === stamp &&
        (!parent || this.#resolveExtends(parent.specifier, filePath) === parent.filePath)
    );
  }

  /**
   * Records what a load of the project's configuration depends on, before the loader reads any of it. Returns
   * undefined if the load can't be reused.
   */
  public async tryGetInputsAsync(
    project: RushConfigurationProject,
    rigConfig: IRigConfig | undefined,
    rigJsonStamp: string,
    ownFileStamp: string
  ): Promise<IProjectConfigurationInputs | undefined> {
    let rigProfile: IRigProfileInput | undefined;
    let filePath: string | undefined;
    if (ownFileStamp !== MISSING_FILE_STAMP) {
      filePath = getOwnConfigurationFilePath(project);
    } else if (rigConfig instanceof RealProfileFolderRigConfig) {
      const rigFolderPath: string = path.join(project.projectFolder, 'node_modules', rigConfig.rigPackageName);
      rigProfile = {
        packageJsonPath: path.join(rigFolderPath, 'package.json'),
        profileFolderPath: path.join(rigFolderPath, rigConfig.relativeProfileFolderPath),
        realProfileFolderPath: rigConfig.getResolvedProfileFolder()
      };
      // The shortcut that a reuse checks must agree with the loader's own resolution of the rig.
      if (!this.#isRigProfileCurrent(rigProfile)) return undefined;
      filePath = path.resolve(
        rigProfile.realProfileFolderPath,
        RUSH_PROJECT_CONFIGURATION_FILE.projectRelativeFilePath
      );
    } else if (rigConfig?.rigFound) {
      // The rig package can't be resolved, which the loader reports if it needs the rig.
      return undefined;
    }
    const files: ReadonlyArray<IConfigurationFileInput> | undefined = filePath
      ? await this.#getFileInputsAsync(filePath)
      : [];
    return files && { rigJsonStamp, ownFileStamp, rigProfile, files };
  }

  #isRigProfileCurrent(rigProfile: IRigProfileInput): boolean {
    // When this file exists, the rig package resolves to it before any other candidate.
    const packageJson: IConfigurationFileStat | undefined = this.getStat(rigProfile.packageJsonPath);
    return (
      packageJson !== undefined &&
      packageJson.stamp !== MISSING_FILE_STAMP &&
      this.#getRealPath(rigProfile.profileFolderPath) === rigProfile.realProfileFolderPath
    );
  }

  #getRealPath(folderPath: string): string | undefined {
    if (!this.#realPaths.has(folderPath)) {
      let realPath: string | undefined;
      try {
        realPath = getNativeRealPath(folderPath);
      } catch {
        // A missing profile folder is reported by the loader.
      }
      this.#realPaths.set(folderPath, realPath);
    }
    return this.#realPaths.get(folderPath);
  }

  #resolveExtends(specifier: string, configurationFilePath: string): string | undefined {
    const baseFolderPath: string = path.dirname(configurationFilePath);
    const key: string = `${baseFolderPath}\0${specifier}`;
    if (!this.#resolutions.has(key)) {
      let resolvedPath: string | undefined;
      try {
        // As the configuration file loader resolves "extends".
        resolvedPath = Import.resolveModule({ modulePath: specifier, baseFolderPath });
      } catch {
        // The loader reports the failure.
      }
      this.#resolutions.set(key, resolvedPath);
    }
    return this.#resolutions.get(key);
  }

  #getFileInputsAsync(filePath: string): Promise<ReadonlyArray<IConfigurationFileInput> | undefined> {
    let result: Promise<ReadonlyArray<IConfigurationFileInput> | undefined> | undefined =
      this.#fileInputs.get(filePath);
    if (!result) {
      result = this.#readFileInputsAsync(filePath);
      this.#fileInputs.set(filePath, result);
    }
    return result;
  }

  async #readFileInputsAsync(
    firstFilePath: string
  ): Promise<ReadonlyArray<IConfigurationFileInput> | undefined> {
    const files: IConfigurationFileInput[] = [];
    const visited: Set<string> = new Set();
    for (let filePath: string | undefined = firstFilePath; filePath !== undefined; ) {
      const stat: IConfigurationFileStat | undefined = this.getStat(filePath);
      if (!stat?.settled || visited.has(filePath)) return undefined;
      visited.add(filePath);
      let specifier: unknown;
      if (stat.stamp !== MISSING_FILE_STAMP) {
        try {
          specifier = JsonFile.parseString(await FileSystem.readFileAsync(filePath))?.extends;
        } catch {
          // The loader reports the failure.
          return undefined;
        }
      }
      if (specifier && typeof specifier !== 'string') return undefined;
      const parentPath: string | undefined = specifier
        ? this.#resolveExtends(specifier as string, filePath)
        : undefined;
      if (specifier && parentPath === undefined) return undefined;
      files.push({
        filePath,
        stamp: stat.stamp,
        parent: parentPath !== undefined ? { specifier: specifier as string, filePath: parentPath } : undefined
      });
      filePath = parentPath;
    }
    return files;
  }
}

/**
 * Parses and validates the operation settings from the rush-project.json data. Returns the
 * validated `operationSettingsByOperationName` map used to construct a {@link RushProjectConfiguration}.
 * (The construction itself must remain in the class body because the constructor is private.)
 */
function _getRushProjectConfiguration(
  project: RushConfigurationProject,
  rushProjectJson: IRushProjectJson,
  terminal: ITerminal
): ReadonlyMap<string, IOperationSettings> {
  const operationSettingsByOperationName: Map<string, IOperationSettings> = new Map<
    string,
    IOperationSettings
  >();

  let hasErrors: boolean = false;

  if (rushProjectJson.operationSettings) {
    for (const operationSettings of rushProjectJson.operationSettings) {
      const operationName: string = operationSettings.operationName;
      const existingOperationSettings: IOperationSettings | undefined =
        operationSettingsByOperationName.get(operationName);
      if (existingOperationSettings) {
        const existingOperationSettingsJsonPath: string | undefined =
          RUSH_PROJECT_CONFIGURATION_FILE.getObjectSourceFilePath(existingOperationSettings);
        const operationSettingsJsonPath: string | undefined =
          RUSH_PROJECT_CONFIGURATION_FILE.getObjectSourceFilePath(operationSettings);
        hasErrors = true;
        let errorMessage: string =
          `The operation "${operationName}" appears multiple times in the "${project.packageName}" project's ` +
          `${RUSH_PROJECT_CONFIGURATION_FILE.projectRelativeFilePath} file's ` +
          'operationSettings property.';
        if (existingOperationSettingsJsonPath && operationSettingsJsonPath) {
          if (existingOperationSettingsJsonPath !== operationSettingsJsonPath) {
            errorMessage +=
              ` It first appears in "${existingOperationSettingsJsonPath}" and again ` +
              `in "${operationSettingsJsonPath}".`;
          } else if (
            !Path.convertToSlashes(existingOperationSettingsJsonPath).startsWith(
              Path.convertToSlashes(project.projectFolder)
            )
          ) {
            errorMessage += ` It appears multiple times in "${operationSettingsJsonPath}".`;
          }
        }

        terminal.writeErrorLine(errorMessage);
      } else {
        operationSettingsByOperationName.set(operationName, operationSettings);
      }
    }

    for (const [operationName, operationSettings] of operationSettingsByOperationName) {
      if (operationSettings.sharding?.shardOperationSettings) {
        terminal.writeWarningLine(
          `DEPRECATED: The "sharding.shardOperationSettings" field is deprecated. Please create a new operation, '${operationName}:shard' to track shard operation settings.`
        );
      }
    }
  }

  if (hasErrors) {
    throw new AlreadyReportedError();
  }

  return operationSettingsByOperationName;
}

function _createConfigurationInputView(): ConfigurationInputView {
  return new ConfigurationInputView();
}
