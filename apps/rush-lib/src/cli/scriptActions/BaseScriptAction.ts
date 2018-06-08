// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParameter } from '@microsoft/ts-command-line';
import { BaseRushAction, IBaseRushActionOptions } from '../actions/BaseRushAction';
import { CommandLineConfiguration } from '../../api/CommandLineConfiguration';
import { ParameterJson } from '../../api/CommandLineJson';
import { RushConstants } from '../../api/RushConstants';

/**
 * Constructor parameters for BaseScriptAction
 */
export interface IBaseScriptActionOptions extends IBaseRushActionOptions {
  commandLineConfiguration: CommandLineConfiguration;
}

/**
 * Base class for command-line actions that are implemented using user-defined scripts.
 * These actions and their parameters can be defined via common/config/command-line.json.
 */
export abstract class BaseScriptAction extends BaseRushAction {
  protected readonly _commandLineConfiguration: CommandLineConfiguration;
  protected readonly customParameters: CommandLineParameter[] = [];

  constructor(
    options: IBaseScriptActionOptions
  ) {
    super(options);
    this._commandLineConfiguration = options.commandLineConfiguration;
  }

  protected defineScriptParameters(): void {
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
