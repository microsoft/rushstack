// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParameter } from '@microsoft/ts-command-line';
import { BaseRushAction, IBaseRushActionOptions } from '../actions/BaseRushAction';
import { CommandLineConfiguration } from '../../api/CommandLineConfiguration';
import { RushConstants } from '../../logic/RushConstants';

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

  constructor(
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
    for (const parameter of this._commandLineConfiguration.parameters) {
      let associated: boolean = false;
      for (const associatedCommand of parameter.associatedCommands) {
        if (associatedCommand === this.actionName) {
          associated = true;
        }
      }

      if (associated) {
        let customParameter: CommandLineParameter | undefined;

        switch (parameter.parameterKind) {
          case 'flag':
            customParameter = this.defineFlagParameter({
              parameterShortName: parameter.shortName,
              parameterLongName: parameter.longName,
              description: parameter.description
            });
            break;
          case 'choice':
           customParameter = this.defineChoiceParameter({
              parameterShortName: parameter.shortName,
              parameterLongName: parameter.longName,
              description: parameter.description,
              alternatives: parameter.alternatives.map(x => x.name),
              defaultValue: parameter.defaultValue
            });
            break;
          case 'string':
            customParameter = this.defineStringParameter({
              parameterLongName: parameter.longName,
              parameterShortName: parameter.shortName,
              description: parameter.description,
              argumentName: parameter.argumentName
            });
            break;
          default:
            throw new Error(`${RushConstants.commandLineFilename} defines a parameter "${parameter!.longName}"`
              + ` using an unsupported parameter kind "${parameter!.parameterKind}"`);
        }
        if (customParameter) {
          this.customParameters.push(customParameter);
        }
      }
    }
  }
}
