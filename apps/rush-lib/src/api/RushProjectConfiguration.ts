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
interface IRushProjectJson {
  /**
   * A list of folder names under the project root that should be cached.
   *
   * These folders should not be tracked by git.
   */
  projectOutputFolderNames?: string[];

  /**
   * Options for individual phases.
   */
  phaseOptions?: IRushProjectJsonPhaseOptionsJson[];

  /**
   * The incremental analyzer can skip Rush commands for projects whose input files have
   * not changed since the last build. Normally, every Git-tracked file under the project
   * folder is assumed to be an input. Set incrementalBuildIgnoredGlobs to ignore specific
   * files, specified as globs relative to the project folder. The list of file globs will
   * be interpreted the same way your .gitignore file is.
   */
  incrementalBuildIgnoredGlobs?: string[];

  /**
   * Additional project-specific options related to build caching.
   */
  buildCacheOptions?: IBuildCacheOptionsJson;
}

interface IRushProjectJsonPhaseOptionsJson {
  /**
   * The name of the phase. This is the name that appears in command-line.json.
   */
  phaseName: string;

  /**
   * A list of folder names under the project root that should be cached.
   *
   * These folders should not be tracked by git.
   */
  projectOutputFolderNames?: string[];
}

interface IBuildCacheOptionsJson extends IBuildCacheOptionsBase {
  /**
   * Allows for fine-grained control of cache for individual commands.
   */
  optionsForCommands?: ICacheOptionsForCommand[];
}

export interface IBuildCacheOptionsBase {
  /**
   * Disable caching for this project. The project will never be restored from cache.
   * This may be useful if this project affects state outside of its folder.
   *
   * This option is only used when the cloud build cache is enabled for the repo. You can set
   * disableBuildCache=true to disable caching for a specific project. This is a useful workaround
   * if that project's build scripts violate the assumptions of the cache, for example by writing
   * files outside the project folder. Where possible, a better solution is to improve the build scripts
   * to be compatible with caching.
   */
  disableBuildCache?: boolean;
}

export interface IBuildCacheOptions extends IBuildCacheOptionsBase {
  /**
   * Allows for fine-grained control of cache for individual commands.
   */
  optionsForCommandsByName: Map<string, ICacheOptionsForCommand>;
}

export interface ICacheOptionsForCommand {
  /**
   * The command name.
   */
  name: string;

  /**
   * Disable caching for this command.
   * This may be useful if this command for this project affects state outside of this project folder.
   *
   * This option is only used when the cloud build cache is enabled for the repo. You can set
   * disableBuildCache=true to disable caching for a command in a specific project. This is a useful workaround
   * if that project's build scripts violate the assumptions of the cache, for example by writing
   * files outside the project folder. Where possible, a better solution is to improve the build scripts
   * to be compatible with caching.
   */
  disableBuildCache?: boolean;
}

/**
 * Use this class to load the "config/rush-project.json" config file.
 *
 * This file provides project-specific configuration options.
 * @public
 */
export class RushProjectConfiguration {
  private static _projectBuildCacheConfigurationFile: ConfigurationFile<IRushProjectJson> =
    new ConfigurationFile<IRushProjectJson>({
      projectRelativeFilePath: `config/${RushConstants.rushProjectConfigFilename}`,
      jsonSchemaPath: path.resolve(__dirname, '..', 'schemas', 'rush-project.schema.json'),
      propertyInheritance: {
        projectOutputFolderNames: {
          inheritanceType: InheritanceType.append
        },
        phaseOptions: {
          inheritanceType: InheritanceType.append
        },
        incrementalBuildIgnoredGlobs: {
          inheritanceType: InheritanceType.replace
        },
        buildCacheOptions: {
          inheritanceType: InheritanceType.custom,
          inheritanceFunction: (
            current: IBuildCacheOptionsJson | undefined,
            parent: IBuildCacheOptionsJson | undefined
          ): IBuildCacheOptionsJson | undefined => {
            if (!current) {
              return parent;
            } else if (!parent) {
              return current;
            } else {
              return {
                ...parent,
                ...current,
                optionsForCommands: [
                  ...(parent.optionsForCommands || []),
                  ...(current.optionsForCommands || [])
                ]
              };
            }
          }
        }
      }
    });

  private static readonly _configCache: Map<RushConfigurationProject, RushProjectConfiguration | false> =
    new Map();

  public readonly project: RushConfigurationProject;

  /**
   * A list of folder names under the project root that should be cached.
   *
   * These folders should not be tracked by git.
   */
  public readonly projectOutputFolderNames?: ReadonlyArray<string>;

  /**
   * A list of folder names under the project root that should be cached for each phase.
   *
   * These folders should not be tracked by git.
   */
  public readonly projectOutputFolderNamesForPhases?: ReadonlyMap<string, ReadonlyArray<string>>;

  /**
   * The incremental analyzer can skip Rush commands for projects whose input files have
   * not changed since the last build. Normally, every Git-tracked file under the project
   * folder is assumed to be an input. Set incrementalBuildIgnoredGlobs to ignore specific
   * files, specified as globs relative to the project folder. The list of file globs will
   * be interpreted the same way your .gitignore file is.
   */
  public readonly incrementalBuildIgnoredGlobs?: ReadonlyArray<string>;

  /**
   * Project-specific cache options.
   */
  public readonly cacheOptions: IBuildCacheOptions;

  private constructor(
    project: RushConfigurationProject,
    rushProjectJson: IRushProjectJson,
    projectOutputFolderNamesForPhases: ReadonlyMap<string, ReadonlyArray<string>> | undefined
  ) {
    this.project = project;

    this.projectOutputFolderNames = rushProjectJson.projectOutputFolderNames;

    this.projectOutputFolderNamesForPhases = projectOutputFolderNamesForPhases;

    this.incrementalBuildIgnoredGlobs = rushProjectJson.incrementalBuildIgnoredGlobs;

    const optionsForCommandsByName: Map<string, ICacheOptionsForCommand> = new Map<
      string,
      ICacheOptionsForCommand
    >();
    if (rushProjectJson.buildCacheOptions?.optionsForCommands) {
      for (const cacheOptionsForCommand of rushProjectJson.buildCacheOptions.optionsForCommands) {
        optionsForCommandsByName.set(cacheOptionsForCommand.name, cacheOptionsForCommand);
      }
    }
    this.cacheOptions = {
      disableBuildCache: rushProjectJson.buildCacheOptions?.disableBuildCache,
      optionsForCommandsByName
    };
  }

  /**
   * Loads the rush-project.json data for the specified project.
   */
  public static async tryLoadForProjectAsync(
    project: RushConfigurationProject,
    repoCommandLineConfiguration: CommandLineConfiguration | undefined,
    terminal: ITerminal,
    skipCache?: boolean
  ): Promise<RushProjectConfiguration | undefined> {
    // false is a signal that the project config does not exist
    const cacheEntry: RushProjectConfiguration | false | undefined = skipCache
      ? undefined
      : RushProjectConfiguration._configCache.get(project);
    if (cacheEntry !== undefined) {
      return cacheEntry || undefined;
    }

    const rigConfig: RigConfig = await RigConfig.loadForProjectFolderAsync({
      projectFolderPath: project.projectFolder
    });

    const rushProjectJson: IRushProjectJson | undefined =
      await this._projectBuildCacheConfigurationFile.tryLoadConfigurationFileForProjectAsync(
        terminal,
        project.projectFolder,
        rigConfig
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

  private static _getRushProjectConfiguration(
    project: RushConfigurationProject,
    rushProjectJson: IRushProjectJson,
    repoCommandLineConfiguration: CommandLineConfiguration | undefined,
    terminal: ITerminal
  ): RushProjectConfiguration {
    if (rushProjectJson.projectOutputFolderNames) {
      const overlappingPathAnalyzer: OverlappingPathAnalyzer<boolean> =
        new OverlappingPathAnalyzer<boolean>();

      const invalidFolderNames: string[] = [];
      for (const projectOutputFolder of rushProjectJson.projectOutputFolderNames) {
        if (projectOutputFolder.match(/[\\]/)) {
          invalidFolderNames.push(projectOutputFolder);
        }

        const overlaps: boolean = !!overlappingPathAnalyzer.addPathAndGetFirstEncounteredLabels(
          projectOutputFolder,
          true
        );
        if (overlaps) {
          terminal.writeErrorLine(
            `The project output folder name "${projectOutputFolder}" is invalid because it overlaps with another folder name.`
          );
          throw new AlreadyReportedError();
        }
      }

      if (invalidFolderNames.length > 0) {
        terminal.writeErrorLine(
          `Invalid project configuration for project "${project.packageName}". Entries in ` +
            '"projectOutputFolderNames" must not contain backslashes and the following entries do: ' +
            invalidFolderNames.join(', ')
        );
      }
    }

    const duplicateCommandNames: Set<string> = new Set<string>();
    const invalidCommandNames: string[] = [];
    if (rushProjectJson.buildCacheOptions?.optionsForCommands) {
      const commandNames: Set<string> = new Set<string>();
      if (repoCommandLineConfiguration) {
        for (const [commandName, command] of repoCommandLineConfiguration.commands) {
          if (command.commandKind === RushConstants.phasedCommandKind) {
            commandNames.add(commandName);
          }
        }
      }

      const alreadyEncounteredCommandNames: Set<string> = new Set<string>();
      for (const cacheOptionsForCommand of rushProjectJson.buildCacheOptions.optionsForCommands) {
        const commandName: string = cacheOptionsForCommand.name;
        if (!commandNames.has(commandName)) {
          invalidCommandNames.push(commandName);
        } else if (alreadyEncounteredCommandNames.has(commandName)) {
          duplicateCommandNames.add(commandName);
        } else {
          alreadyEncounteredCommandNames.add(commandName);
        }
      }
    }

    if (invalidCommandNames.length > 0) {
      terminal.writeErrorLine(
        `Invalid project configuration fpr project "${project.packageName}". The following ` +
          'command names in cacheOptions.optionsForCommands are not specified in this repo: ' +
          invalidCommandNames.join(', ')
      );
    }

    if (duplicateCommandNames.size > 0) {
      terminal.writeErrorLine(
        `Invalid project configuration fpr project "${project.packageName}". The following ` +
          'command names in cacheOptions.optionsForCommands are specified more than once: ' +
          Array.from(duplicateCommandNames).join(', ')
      );
    }

    let projectOutputFolderNamesForPhases: Map<string, string[]> | undefined;
    if (rushProjectJson.phaseOptions) {
      const overlappingPathAnalyzer: OverlappingPathAnalyzer<string> = new OverlappingPathAnalyzer<string>();

      projectOutputFolderNamesForPhases = new Map<string, string[]>();
      const phaseOptionsByPhase: Map<string, IRushProjectJsonPhaseOptionsJson> = new Map<
        string,
        IRushProjectJsonPhaseOptionsJson
      >();
      for (const phaseOptions of rushProjectJson.phaseOptions) {
        const phaseName: string = phaseOptions.phaseName;
        const existingPhaseOptions: IRushProjectJsonPhaseOptionsJson | undefined =
          phaseOptionsByPhase.get(phaseName);
        if (existingPhaseOptions) {
          const existingPhaseOptionsJsonPath: string | undefined =
            RushProjectConfiguration._projectBuildCacheConfigurationFile.getObjectSourceFilePath(
              existingPhaseOptions
            );
          const phaseOptionsJsonPath: string | undefined =
            RushProjectConfiguration._projectBuildCacheConfigurationFile.getObjectSourceFilePath(
              phaseOptions
            );
          let errorMessage: string =
            `The phase "${phaseName}" appears multiple times in the "${project.packageName}" project's ` +
            `${RushProjectConfiguration._projectBuildCacheConfigurationFile.projectRelativeFilePath} file's ` +
            'phaseOptions property.';
          if (existingPhaseOptionsJsonPath && phaseOptionsJsonPath) {
            if (existingPhaseOptionsJsonPath !== phaseOptionsJsonPath) {
              errorMessage +=
                ` It first appears in "${existingPhaseOptionsJsonPath}" and again ` +
                `in "${phaseOptionsJsonPath}".`;
            } else if (
              !Path.convertToSlashes(existingPhaseOptionsJsonPath).startsWith(
                Path.convertToSlashes(project.projectFolder)
              )
            ) {
              errorMessage += ` It appears multiple times in "${phaseOptionsJsonPath}".`;
            }
          }

          terminal.writeErrorLine(errorMessage);
        } else if (!repoCommandLineConfiguration?.phases.has(phaseName)) {
          terminal.writeErrorLine(
            `Invalid "${RushProjectConfiguration._projectBuildCacheConfigurationFile.projectRelativeFilePath}"` +
              ` for project "${project.packageName}". Phase "${phaseName}" is not defined in the repo's ${RushConstants.commandLineFilename}.`
          );
        } else {
          phaseOptionsByPhase.set(phaseOptions.phaseName, phaseOptions);
          if (phaseOptions.projectOutputFolderNames) {
            projectOutputFolderNamesForPhases.set(
              phaseOptions.phaseName,
              phaseOptions.projectOutputFolderNames
            );
          }
        }

        if (phaseOptions.projectOutputFolderNames) {
          for (const projectOutputFolderName of phaseOptions.projectOutputFolderNames) {
            const overlappingPhaseNames: string[] | undefined =
              overlappingPathAnalyzer.addPathAndGetFirstEncounteredLabels(projectOutputFolderName, phaseName);
            if (overlappingPhaseNames) {
              const overlapsWithOwnPhase: boolean = overlappingPhaseNames?.includes(phaseName);
              if (overlapsWithOwnPhase) {
                if (overlappingPhaseNames.length === 1) {
                  terminal.writeErrorLine(
                    `Invalid "${RushProjectConfiguration._projectBuildCacheConfigurationFile.projectRelativeFilePath}" ` +
                      `for project "${project.packageName}". The project output folder name "${projectOutputFolderName}" in ` +
                      `phase ${phaseName} overlaps with other another folder name in the same phase.`
                  );
                } else {
                  const otherPhaseNames: string[] = overlappingPhaseNames.filter(
                    (overlappingPhaseName) => overlappingPhaseName !== phaseName
                  );
                  terminal.writeErrorLine(
                    `Invalid "${RushProjectConfiguration._projectBuildCacheConfigurationFile.projectRelativeFilePath}" ` +
                      `for project "${project.packageName}". The project output folder name "${projectOutputFolderName}" in ` +
                      `phase ${phaseName} overlaps with other another folder names in the same phase and with ` +
                      `folder names in the following other phases: ${otherPhaseNames.join(', ')}.`
                  );
                }
              } else {
                terminal.writeErrorLine(
                  `Invalid "${RushProjectConfiguration._projectBuildCacheConfigurationFile.projectRelativeFilePath}" ` +
                    `for project "${project.packageName}". The project output folder name "${projectOutputFolderName}" in ` +
                    `phase ${phaseName} overlaps with other folder name(s) in the following other phases: ` +
                    `${overlappingPhaseNames.join(', ')}.`
                );
              }

              throw new AlreadyReportedError();
            }
          }
        }
      }
    }

    return new RushProjectConfiguration(project, rushProjectJson, projectOutputFolderNamesForPhases);
  }
}
