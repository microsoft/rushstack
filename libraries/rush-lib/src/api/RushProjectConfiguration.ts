// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyReportedError, Async, Path } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import { ProjectConfigurationFile, InheritanceType } from '@rushstack/heft-config-file';
import { RigConfig } from '@rushstack/rig-package';

import type { RushConfigurationProject } from './RushConfigurationProject';
import { RushConstants } from '../logic/RushConstants';
import type { IPhase } from './CommandLineConfiguration';
import { OverlappingPathAnalyzer } from '../utilities/OverlappingPathAnalyzer';
import schemaJson from '../schemas/rush-project.schema.json';
import anythingSchemaJson from '../schemas/rush-project.schema.json';
import { HotlinkManager } from '../utilities/HotlinkManager';
import type { RushConfiguration } from './RushConfiguration';

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
 * @alpha
 */
export interface IOperationSettings {
  /**
   * The name of the operation. This should be a key in the `package.json`'s `scripts` object.
   */
  operationName: string;

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
  weight?: number;

  /**
   * If true, this operation can use cobuilds for orchestration without restoring build cache entries.
   */
  allowCobuildWithoutCache?: boolean;

  /**
   * If true, this operation will never be skipped by the `--changed-projects-only` flag.
   */
  ignoreChangedProjectsOnlyFlag?: boolean;
}

interface IOldRushProjectJson {
  projectOutputFolderNames?: unknown;
  phaseOptions?: unknown;
  buildCacheOptions?: unknown;
}

const RUSH_PROJECT_CONFIGURATION_FILE: ProjectConfigurationFile<IRushProjectJson> =
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
                const childSourceFilePath: string =
                  RUSH_PROJECT_CONFIGURATION_FILE.getObjectSourceFilePath(child)!;
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

const OLD_RUSH_PROJECT_CONFIGURATION_FILE: ProjectConfigurationFile<IOldRushProjectJson> =
  new ProjectConfigurationFile<IOldRushProjectJson>({
    projectRelativeFilePath: RUSH_PROJECT_CONFIGURATION_FILE.projectRelativeFilePath,
    jsonSchemaObject: anythingSchemaJson
  });

/**
 * Use this class to load the "config/rush-project.json" config file.
 *
 * This file provides project-specific configuration options.
 * @alpha
 */
export class RushProjectConfiguration {
  private static readonly _configCache: Map<RushConfigurationProject, RushProjectConfiguration | false> =
    new Map();

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

  private readonly _validationCache: WeakSet<object> = new WeakSet();

  private constructor(
    project: RushConfigurationProject,
    rushProjectJson: IRushProjectJson,
    operationSettingsByOperationName: ReadonlyMap<string, IOperationSettings>
  ) {
    this.project = project;
    this.incrementalBuildIgnoredGlobs = rushProjectJson.incrementalBuildIgnoredGlobs || [];
    this.disableBuildCacheForProject = rushProjectJson.disableBuildCacheForProject || false;
    this.operationSettingsByOperationName = operationSettingsByOperationName;
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
    if (this._validationCache.has(phases)) {
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
      }
    }

    this._validationCache.add(phases);

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
    const cacheEntry: RushProjectConfiguration | false | undefined =
      RushProjectConfiguration._configCache.get(project);
    if (cacheEntry !== undefined) {
      return cacheEntry || undefined;
    }

    const rushProjectJson: IRushProjectJson | undefined = await this._tryLoadJsonForProjectAsync(
      project,
      terminal
    );

    if (rushProjectJson) {
      const result: RushProjectConfiguration = RushProjectConfiguration._getRushProjectConfiguration(
        project,
        rushProjectJson,
        terminal
      );
      RushProjectConfiguration._configCache.set(project, result);
      return result;
    } else {
      RushProjectConfiguration._configCache.set(project, false);
      return undefined;
    }
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
    const rushProjectJson: IRushProjectJson | undefined = await this._tryLoadJsonForProjectAsync(
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

  private static async _tryLoadJsonForProjectAsync(
    project: RushConfigurationProject,
    terminal: ITerminal
  ): Promise<IRushProjectJson | undefined> {
    const rigConfig: RigConfig = await RigConfig.loadForProjectFolderAsync({
      projectFolderPath: project.projectFolder
    });

    try {
      return await RUSH_PROJECT_CONFIGURATION_FILE.tryLoadConfigurationFileForProjectAsync(
        terminal,
        project.projectFolder,
        rigConfig
      );
    } catch (e1) {
      // Detect if the project is using the old rush-project.json schema
      let oldRushProjectJson: IOldRushProjectJson | undefined;
      try {
        oldRushProjectJson =
          await OLD_RUSH_PROJECT_CONFIGURATION_FILE.tryLoadConfigurationFileForProjectAsync(
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

  private static _getRushProjectConfiguration(
    project: RushConfigurationProject,
    rushProjectJson: IRushProjectJson,
    terminal: ITerminal
  ): RushProjectConfiguration {
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

    return new RushProjectConfiguration(project, rushProjectJson, operationSettingsByOperationName);
  }
}
