// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BuildCacheConfiguration } from '../api/BuildCacheConfiguration';
import { RushConfiguration } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { convertSlashesForWindows } from './taskExecution/ProjectTaskRunner';
import { ProjectChangeAnalyzer } from './ProjectChangeAnalyzer';
import { TaskCollection } from './taskExecution/TaskCollection';

export interface ITaskSelectorOptions {
  logFilenameIdentifier: string;
  commandToRun: string;
  ignoreMissingScript: boolean;
  ignoreDependencyOrder: boolean;
  allowWarningsInSuccessfulBuild?: boolean;
  rushConfiguration: RushConfiguration;
  buildCacheConfiguration: BuildCacheConfiguration | undefined;
  selection: ReadonlySet<RushConfigurationProject>;
  commandName: string;
  customParameterValues: string[];
  isQuietMode: boolean;
  isDebugMode: boolean;
  isIncrementalBuildAllowed: boolean;
  projectChangeAnalyzer?: ProjectChangeAnalyzer;
}

/**
 * This class is responsible for:
 *  - based on to/from flags, solving the dependency graph and figuring out which projects need to be run
 *  - creating a ProjectBuilder for each project that needs to be built
 *  - registering the necessary ProjectBuilders with the TaskExecutionManager, which actually orchestrates execution
 */
export class ProjectTaskSelector {
  protected _options: ITaskSelectorOptions;
  protected _projectChangeAnalyzer: ProjectChangeAnalyzer;

  public constructor(options: ITaskSelectorOptions) {
    this._options = options;

    const { projectChangeAnalyzer = new ProjectChangeAnalyzer(options.rushConfiguration) } = options;

    this._projectChangeAnalyzer = projectChangeAnalyzer;
  }

  public static getScriptToRun(
    rushProject: RushConfigurationProject,
    commandToRun: string,
    customParameterValues: string[]
  ): string | undefined {
    const script: string | undefined = ProjectTaskSelector._getScriptCommand(rushProject, commandToRun);

    if (script === undefined) {
      return undefined;
    }

    if (!script) {
      return '';
    } else {
      const taskCommand: string = `${script} ${customParameterValues.join(' ')}`;
      return process.platform === 'win32' ? convertSlashesForWindows(taskCommand) : taskCommand;
    }
  }

  public abstract registerTasks(): TaskCollection;

  private static _getScriptCommand(
    rushProject: RushConfigurationProject,
    script: string
  ): string | undefined {
    if (!rushProject.packageJson.scripts) {
      return undefined;
    }

    const rawCommand: string = rushProject.packageJson.scripts[script];

    if (rawCommand === undefined || rawCommand === null) {
      return undefined;
    }

    return rawCommand;
  }
}
