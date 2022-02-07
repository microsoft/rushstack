// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import type { CommandLineConfiguration, IPhase } from '../../api/CommandLineConfiguration';
import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IRegisteredCustomParameter } from '../../cli/scriptActions/BaseScriptAction';
import { ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';
import type { IOperationOptions, IOperationFactory } from './OperationSelector';
import { RushConstants } from '../RushConstants';
import { IOperationRunner } from './IOperationRunner';
import { NullOperationRunner } from './NullOperationRunner';
import { convertSlashesForWindows, ShellOperationRunner } from './ShellOperationRunner';
import { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';

export interface IOperationFactoryOptions {
  rushConfiguration: RushConfiguration;
  buildCacheConfiguration?: BuildCacheConfiguration | undefined;
  commandLineConfiguration: CommandLineConfiguration;
  isIncrementalBuildAllowed: boolean;
  customParameters: Iterable<IRegisteredCustomParameter>;
  projectChangeAnalyzer: ProjectChangeAnalyzer;
}

export class OperationFactory implements IOperationFactory {
  private readonly _options: IOperationFactoryOptions;
  private readonly _customParametersByPhase: Map<IPhase, string[]>;

  public constructor(options: IOperationFactoryOptions) {
    this._options = options;
    this._customParametersByPhase = new Map();
  }

  public createTask(options: IOperationOptions): Operation {
    const { phase, project } = options;

    const factoryOptions: IOperationFactoryOptions = this._options;

    const customParameterValues: ReadonlyArray<string> = this._getCustomParameterValuesForPhase(phase);

    const commandToRun: string | undefined = OperationFactory._getScriptToRun(
      project,
      phase.name,
      customParameterValues
    );
    if (commandToRun === undefined && !phase.ignoreMissingScript) {
      throw new Error(
        `The project '${project.packageName}' does not define a '${phase.name}' command in the 'scripts' section of its package.json`
      );
    }

    const displayName: string = OperationFactory._getDisplayName(phase, project);

    // Empty build script indicates a no-op, so use a no-op runner
    const runner: IOperationRunner = commandToRun
      ? new ShellOperationRunner({
          rushProject: project,
          displayName,
          rushConfiguration: factoryOptions.rushConfiguration,
          buildCacheConfiguration: factoryOptions.buildCacheConfiguration,
          commandLineConfiguration: factoryOptions.commandLineConfiguration,
          commandToRun: commandToRun || '',
          isIncrementalBuildAllowed: factoryOptions.isIncrementalBuildAllowed,
          projectChangeAnalyzer: factoryOptions.projectChangeAnalyzer,
          phase
        })
      : new NullOperationRunner(displayName, OperationStatus.FromCache);

    const operation: Operation = new Operation(runner);

    return operation;
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
      const shellCommand: string = `${rawCommand} ${customParameterValues.join(' ')}`;
      return process.platform === 'win32' ? convertSlashesForWindows(shellCommand) : shellCommand;
    }
  }

  private static _getDisplayName(phase: IPhase, project: RushConfigurationProject): string {
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
