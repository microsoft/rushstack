// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import type { IPhase } from '../../api/CommandLineConfiguration';
import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IRegisteredCustomParameter } from '../../cli/scriptActions/BaseScriptAction';
import { ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';
import type { IProjectTaskOptions, IProjectTaskFactory } from '../ProjectTaskSelector';
import { RushConstants } from '../RushConstants';
import { convertSlashesForWindows, ProjectTaskRunner } from './ProjectTaskRunner';
import { Task } from './Task';
import { TaskStatus } from './TaskStatus';

export interface IProjectTaskFactoryOptions {
  rushConfiguration: RushConfiguration;
  buildCacheConfiguration?: BuildCacheConfiguration | undefined;
  isIncrementalBuildAllowed: boolean;
  customParameters: Iterable<IRegisteredCustomParameter>;
  projectChangeAnalyzer: ProjectChangeAnalyzer;
}

export class ProjectTaskFactory implements IProjectTaskFactory {
  private readonly _options: IProjectTaskFactoryOptions;
  private readonly _customParametersByPhase: Map<IPhase, string[]>;

  public constructor(options: IProjectTaskFactoryOptions) {
    this._options = options;
    this._customParametersByPhase = new Map();
  }

  public createTask(options: IProjectTaskOptions): Task {
    const { phase, project } = options;

    const factoryOptions: IProjectTaskFactoryOptions = this._options;

    const customParameterValues: ReadonlyArray<string> = this._getCustomParameterValuesForPhase(phase);

    const commandToRun: string | undefined = ProjectTaskFactory._getScriptToRun(
      project,
      phase.name,
      customParameterValues
    );
    if (commandToRun === undefined && !phase.ignoreMissingScript) {
      throw new Error(
        `The project '${project.packageName}' does not define a '${phase.name}' command in the 'scripts' section of its package.json`
      );
    }

    const taskName: string = ProjectTaskFactory._getTaskDisplayName(phase, project);

    const task: Task = new Task(
      new ProjectTaskRunner({
        rushProject: project,
        taskName,
        rushConfiguration: factoryOptions.rushConfiguration,
        buildCacheConfiguration: factoryOptions.buildCacheConfiguration,
        commandToRun: commandToRun || '',
        isIncrementalBuildAllowed: factoryOptions.isIncrementalBuildAllowed,
        projectChangeAnalyzer: factoryOptions.projectChangeAnalyzer,
        phase
      }),
      TaskStatus.Ready
    );

    return task;
  }

  private static _getScriptToRun(
    rushProject: RushConfigurationProject,
    commandToRun: string,
    customParameterValues: ReadonlyArray<string>
  ): string | undefined {
    const { scripts } = rushProject.packageJson;

    const rawCommand: string | undefined | null = scripts?.[commandToRun];

    if (rawCommand === undefined || rawCommand === null) {
      return undefined;
    }

    if (!rawCommand) {
      return '';
    } else {
      const taskCommand: string = `${rawCommand} ${customParameterValues.join(' ')}`;
      return process.platform === 'win32' ? convertSlashesForWindows(taskCommand) : taskCommand;
    }
  }

  private static _getTaskDisplayName(phase: IPhase, project: RushConfigurationProject): string {
    if (phase.isSynthetic) {
      // Because this is a synthetic phase, just use the project name because there aren't any other phases
      return project.packageName;
    } else {
      const phaseNameWithoutPrefix: string = phase.name.slice(RushConstants.phaseNamePrefix.length);
      return `${project.packageName} (${phaseNameWithoutPrefix})`;
    }
  }

  private _getCustomParameterValuesForPhase(phase: IPhase): ReadonlyArray<string> {
    let customParameterValues: string[] | undefined = this._customParametersByPhase.get(phase);
    if (!customParameterValues) {
      customParameterValues = [];
      for (const { tsCommandLineParameter, parameter } of this._options.customParameters) {
        if (phase.associatedParameters.has(parameter)) {
          tsCommandLineParameter.appendToArgList(customParameterValues);
        }
      }

      this._customParametersByPhase.set(phase, customParameterValues);
    }

    return customParameterValues;
  }
}
