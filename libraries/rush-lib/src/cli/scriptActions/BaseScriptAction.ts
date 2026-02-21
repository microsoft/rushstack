// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineParameter } from '@rushstack/ts-command-line';

import { BaseRushAction, type IBaseRushActionOptions } from '../actions/BaseRushAction.ts';
import type {
  Command,
  CommandLineConfiguration,
  IParameterJson
} from '../../api/CommandLineConfiguration.ts';
import { defineCustomParameters } from '../parsing/defineCustomParameters.ts';

/**
 * Constructor parameters for BaseScriptAction
 */
export interface IBaseScriptActionOptions<TCommand extends Command> extends IBaseRushActionOptions {
  commandLineConfiguration: CommandLineConfiguration;
  command: TCommand;
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
export abstract class BaseScriptAction<TCommand extends Command> extends BaseRushAction {
  protected readonly commandLineConfiguration: CommandLineConfiguration;
  protected readonly customParameters: Map<IParameterJson, CommandLineParameter> = new Map();
  protected readonly command: TCommand;

  public constructor(options: IBaseScriptActionOptions<TCommand>) {
    super(options);
    this.commandLineConfiguration = options.commandLineConfiguration;
    this.command = options.command;
  }

  protected defineScriptParameters(): void {
    if (!this.commandLineConfiguration) {
      return;
    }

    // Use the centralized helper to create CommandLineParameter instances
    defineCustomParameters(this, this.command.associatedParameters, this.customParameters);
  }
}
