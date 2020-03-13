// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParameter } from '@microsoft/ts-command-line';
import { BaseRushAction, IBaseRushActionOptions } from '../actions/BaseRushAction';
import { CommandLineConfiguration } from '../../api/CommandLineConfiguration';
import { RushConstants } from '../../logic/RushConstants';
import { ParameterJson } from '../../api/CommandLineJson';

/**
 * Constructor parameters for BaseScriptAction
 */
export interface IBaseScriptActionOptions extends IBaseRushActionOptions {
  commandLineConfiguration: CommandLineConfiguration | undefined;
}

/**
 * Base class for command-line actions that are implemented using user-defined scripts.
 *
 * @remarks
 * Compared to the normal built-in actions, these actions are special because (1) they
 * can be discovered dynamically via common/config/command-line.json, and (2)
 * user-defined command-line parameters can be passed through to the script.
 *
 * The two subclasses are BulkScriptAction and GlobalScriptAction.
 */
export abstract class BaseScriptAction extends BaseRushAction {
  protected readonly _commandLineConfiguration: CommandLineConfiguration | undefined;
  protected readonly customParameters: CommandLineParameter[] = [];

  private readonly _parameterCache: Map<ParameterJson, CommandLineParameter> =
    new Map<ParameterJson, CommandLineParameter>();

  public constructor(
    options: IBaseScriptActionOptions
  ) {
    super(options);
    this._commandLineConfiguration = options.commandLineConfiguration;
  }

  protected defineScriptParameters(): void {
    if (!this._commandLineConfiguration) {
      return;
    }

    // Find any parameters that are associated with this command
    for (const parameterJson of this._commandLineConfiguration.parameters) {
      if (parameterJson.associatedCommands.includes(this.actionName)) {
        this.customParameters.push(this.getCommandLineParameter(parameterJson));
      }
    }
  }

  protected getCommandLineParameter(parameterJson: ParameterJson): CommandLineParameter {
    let customParameter: CommandLineParameter | undefined = this._parameterCache.get(parameterJson);
    if (customParameter) {
      return customParameter;
    }

    switch (parameterJson.parameterKind) {
      case 'flag':
        customParameter = this.defineFlagParameter({
          parameterShortName: parameterJson.shortName,
          parameterLongName: parameterJson.longName,
          description: parameterJson.description,
          required: parameterJson.required
        });
        break;
      case 'choice':
       customParameter = this.defineChoiceParameter({
          parameterShortName: parameterJson.shortName,
          parameterLongName: parameterJson.longName,
          description: parameterJson.description,
          required: parameterJson.required,
          alternatives: parameterJson.alternatives.map(x => x.name),
          defaultValue: parameterJson.defaultValue
        });
        break;
      case 'string':
        customParameter = this.defineStringParameter({
          parameterLongName: parameterJson.longName,
          parameterShortName: parameterJson.shortName,
          description: parameterJson.description,
          required: parameterJson.required,
          argumentName: parameterJson.argumentName
        });
        break;
      default:
        throw new Error(`${RushConstants.commandLineFilename} defines a parameter "${parameterJson!.longName}"`
          + ` using an unsupported parameter kind "${parameterJson!.parameterKind}"`);
    }

    this._parameterCache.set(parameterJson, customParameter);
    return customParameter;
  }
}
