// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Terminal } from '@rushstack/node-core-library';
import { ConfigurationFile, InheritanceType } from '@rushstack/heft-config-file';
import { RigConfig } from '@rushstack/rig-package';

import { RushConfigurationProject } from './RushConfigurationProject';
import { RushConstants } from '../logic/RushConstants';
import { CommandLineConfiguration } from './CommandLineConfiguration';

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

  cacheOptions?: ICacheOptions;
}

export interface ICacheOptions {
  /**
   * NOT RECOMMENDED.
   *
   * Disable caching for this project. The project will never be restored from cache.
   * This may be useful if this project affects state outside of its folder.
   */
  disableCache?: boolean;

  /**
   * Allows for fine-grained control of cache for individual commands.
   */
  optionsForCommands?: {
    [commandName: string]: ICacheOptionsForCommand;
  };
}

export interface ICacheOptionsForCommand {
  /**
   * NOT RECOMMENDED.
   *
   * Disable caching for this command.
   * This may be useful if this command for this project affects state outside of this project folder.
   */
  disableCache?: boolean;
}

/**
 * Use this class to load the "config/rush-project.json" config file.
 *
 * This file provides project-specific configuration options.
 * @public
 */
export class RushProjectConfiguration {
  private static _projectBuildCacheConfigurationFile: ConfigurationFile<IRushProjectJson> = new ConfigurationFile<IRushProjectJson>(
    {
      projectRelativeFilePath: `config/${RushConstants.rushProjectConfigFilename}`,
      jsonSchemaPath: path.resolve(__dirname, '..', 'schemas', 'rush-project.schema.json'),
      propertyInheritance: {
        projectOutputFolderNames: {
          inheritanceType: InheritanceType.append
        }
      }
    }
  );

  public readonly project: RushConfigurationProject;

  /**
   * A list of folder names under the project root that should be cached.
   *
   * These folders should not be tracked by git.
   */
  public readonly projectOutputFolderNames?: string[];

  /**
   * Project-specific cache options.
   */
  public readonly cacheOptions?: ICacheOptions;

  private constructor(project: RushConfigurationProject, projectBuildCacheJson: IRushProjectJson) {
    this.project = project;

    this.projectOutputFolderNames = projectBuildCacheJson.projectOutputFolderNames;
  }

  /**
   * Loads the rush-project.json data for the specified project.
   */
  public static async tryLoadForProjectAsync(
    project: RushConfigurationProject,
    repoCommandLineConfiguration: CommandLineConfiguration | undefined,
    terminal: Terminal
  ): Promise<RushProjectConfiguration | undefined> {
    const rigConfig: RigConfig = await RigConfig.loadForProjectFolderAsync({
      projectFolderPath: project.projectFolder
    });

    const rushProjectJson:
      | IRushProjectJson
      | undefined = await this._projectBuildCacheConfigurationFile.tryLoadConfigurationFileForProjectAsync(
      terminal,
      project.projectFolder,
      rigConfig
    );

    if (rushProjectJson) {
      RushProjectConfiguration._validateConfiguration(
        project,
        rushProjectJson,
        repoCommandLineConfiguration,
        terminal
      );
      return new RushProjectConfiguration(project, rushProjectJson);
    } else {
      return undefined;
    }
  }

  private static _validateConfiguration(
    project: RushConfigurationProject,
    rushProjectJson: IRushProjectJson,
    repoCommandLineConfiguration: CommandLineConfiguration | undefined,
    terminal: Terminal
  ): void {
    const invalidFolderNames: string[] = [];
    for (const projectOutputFolder of rushProjectJson.projectOutputFolderNames || []) {
      if (projectOutputFolder.match(/[\/\\]/)) {
        invalidFolderNames.push(projectOutputFolder);
      }
    }

    if (invalidFolderNames.length > 0) {
      terminal.writeErrorLine(
        `Invalid project configuration for project "${project.packageName}". Entries in ` +
          '"projectOutputFolderNames" must not contain slashes and the following entries do: ' +
          invalidFolderNames.join(', ')
      );
    }

    const invalidCommandNames: string[] = [];
    if (rushProjectJson.cacheOptions?.optionsForCommands) {
      const commandNames: Set<string> = new Set<string>([
        RushConstants.buildCommandName,
        RushConstants.rebuildCommandName
      ]);
      if (repoCommandLineConfiguration) {
        for (const command of repoCommandLineConfiguration.commands) {
          if (command.commandKind === RushConstants.bulkCommandKind) {
            commandNames.add(command.name);
          }
        }
      }

      for (const commandName of Object.keys(rushProjectJson.cacheOptions.optionsForCommands)) {
        if (!commandNames.has(commandName)) {
          invalidCommandNames.push(commandName);
        }
      }
    }

    if (invalidCommandNames.length > 0) {
      terminal.writeErrorLine(
        `Invalid project configuration fpr project "${project.packageName}". The following ` +
          'entries in in cacheOptions.optionsForCommands are not specified in this repo: ' +
          invalidCommandNames.join(', ')
      );
    }
  }
}
