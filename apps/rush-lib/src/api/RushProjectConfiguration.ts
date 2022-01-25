// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { AlreadyReportedError, ITerminal, Path } from '@rushstack/node-core-library';
import { ConfigurationFile, InheritanceType } from '@rushstack/heft-config-file';
import { RigConfig } from '@rushstack/rig-package';

import { RushConfigurationProject } from './RushConfigurationProject';
import { RushConstants } from '../logic/RushConstants';
import { CommandLineConfiguration } from './CommandLineConfiguration';
import { OverlappingPathAnalyzer } from '../utilities/OverlappingPathAnalyzer';

/**
 * Describes the file structure for the "<project root>/config/rush-project.json" config file.
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
}

interface IOldRushProjectJson {
  projectOutputFolderNames?: unknown;
  phaseOptions?: unknown;
  buildCacheOptions?: unknown;
}

export const RUSH_PROJECT_CONFIGURATION_FILE: ConfigurationFile<IRushProjectJson> =
  new ConfigurationFile<IRushProjectJson>({
    projectRelativeFilePath: `config/${RushConstants.rushProjectConfigFilename}`,
    jsonSchemaPath: path.resolve(__dirname, '..', 'schemas', 'rush-project.schema.json'),
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
            // Merge the outputFolderNames arrays
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
                // The parent operation settings object already exists, so append to the outputFolderNames
                const outputFolderNames: string[] | undefined =
                  mergedOperationSettings.outputFolderNames && childOperationSettings.outputFolderNames
                    ? [
                        ...mergedOperationSettings.outputFolderNames,
                        ...childOperationSettings.outputFolderNames
                      ]
                    : mergedOperationSettings.outputFolderNames || childOperationSettings.outputFolderNames;

                mergedOperationSettings = {
                  ...mergedOperationSettings,
                  ...childOperationSettings,
                  outputFolderNames
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

const OLD_RUSH_PROJECT_CONFIGURATION_FILE: ConfigurationFile<IOldRushProjectJson> =
  new ConfigurationFile<IOldRushProjectJson>({
    projectRelativeFilePath: RUSH_PROJECT_CONFIGURATION_FILE.projectRelativeFilePath,
    jsonSchemaPath: path.resolve(__dirname, '..', 'schemas', 'anything.schema.json')
  });

/**
 * Use this class to load the "config/rush-project.json" config file.
 *
 * This file provides project-specific configuration options.
 * @public
 */
export class RushProjectConfiguration {
  private static readonly _configCache: Map<RushConfigurationProject, RushProjectConfiguration | false> =
    new Map();

  public readonly project: RushConfigurationProject;

  /**
   * {@inheritdoc IRushProjectJson.incrementalBuildIgnoredGlobs}
   */
  public readonly incrementalBuildIgnoredGlobs: ReadonlyArray<string>;

  /**
   * {@inheritdoc IRushProjectJson.disableBuildCacheForProject}
   */
  public readonly disableBuildCacheForProject: boolean;

  public readonly operationSettingsByOperationName: ReadonlyMap<string, Readonly<IOperationSettings>>;

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
   * Loads the rush-project.json data for the specified project.
   */
  public static async tryLoadForProjectAsync(
    project: RushConfigurationProject,
    repoCommandLineConfiguration: CommandLineConfiguration,
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
        repoCommandLineConfiguration,
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
    } catch (e) {
      // Detect if the project is using the old rush-project.json schema
      let oldRushProjectJson: IOldRushProjectJson | undefined;
      try {
        oldRushProjectJson =
          await OLD_RUSH_PROJECT_CONFIGURATION_FILE.tryLoadConfigurationFileForProjectAsync(
            terminal,
            project.projectFolder,
            rigConfig
          );
      } catch (e) {
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
        throw e;
      }
    }
  }

  private static _getRushProjectConfiguration(
    project: RushConfigurationProject,
    rushProjectJson: IRushProjectJson,
    repoCommandLineConfiguration: CommandLineConfiguration,
    terminal: ITerminal
  ): RushProjectConfiguration {
    const operationSettingsByOperationName: Map<string, IOperationSettings> = new Map<
      string,
      IOperationSettings
    >();
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

      // For each phased command, check if any of its phases' output folders overlap.
      for (const command of repoCommandLineConfiguration.commands.values()) {
        if (command.commandKind === 'phased') {
          const overlappingPathAnalyzer: OverlappingPathAnalyzer<string> =
            new OverlappingPathAnalyzer<string>();

          for (const phase of command.phases) {
            const operationName: string = phase.name;
            const operationSettings: IOperationSettings | undefined =
              operationSettingsByOperationName.get(operationName);
            if (operationSettings) {
              if (operationSettings.outputFolderNames) {
                for (const outputFolderName of operationSettings.outputFolderNames) {
                  const overlappingOperationNames: string[] | undefined =
                    overlappingPathAnalyzer.addPathAndGetFirstEncounteredLabels(
                      outputFolderName,
                      operationName
                    );
                  if (overlappingOperationNames) {
                    const overlapsWithOwnOperation: boolean =
                      overlappingOperationNames?.includes(operationName);
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
                          'two potentially simultaneous operations whose "outputFolderNames" would overlap. ' +
                          "Simultaneous operations should not delete each other's output." +
                          `\n\n` +
                          `The "${outputFolderName}" path overlaps between these operations: ` +
                          overlappingOperationNames.map((operationName) => `"${operationName}"`).join(', ')
                      );
                    }

                    throw new AlreadyReportedError();
                  }
                }
              }
            }
          }
        }
      }
    }

    return new RushProjectConfiguration(project, rushProjectJson, operationSettingsByOperationName);
  }
}
