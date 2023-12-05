// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineAction,
  CommandLineParameter,
  CommandLineParameterKind
} from '@rushstack/ts-command-line';
import { RushCommandLineParser } from '../cli/RushCommandLineParser';

/**
 * Information about the available parameters associated with a rush action
 *
 * @beta
 */
export interface ICommandLineParameter {
  /**
   * The corresponding string representation of CliParameterKind
   */
  readonly kind: string;

  /**
   * The long name of the flag including double dashes, e.g. "--do-something"
   */
  readonly longName?: string;

  /**
   * An optional short name for the flag including the dash, e.g. "-d"
   */
  readonly shortName?: string;

  /**
   * Documentation for the parameter that will be shown when invoking the tool with "--help"
   */
  readonly description: string;

  /**
   * If true, then an error occurs if the parameter was not included on the command-line.
   */
  readonly required?: boolean;
}

/**
 * The full spec of an available rush command line action
 *
 * @beta
 */
export interface ICommandLineSpec {
  actionName: string;
  parameters: ICommandLineParameter[];
}

/**
 * Information about the available CLI commands
 *
 * @beta
 */
export class RushCommandLine {
  private static workspaceCommandLineMap: Map<string, RushCommandLineParser>;

  public static getSpec(workspaceFolder: string): ICommandLineSpec[] {
    let commandLineParser: RushCommandLineParser;
    if (!RushCommandLine.workspaceCommandLineMap.has(workspaceFolder)) {
      RushCommandLine.workspaceCommandLineMap.set(
        workspaceFolder,
        new RushCommandLineParser({ cwd: workspaceFolder })
      );
    }
    commandLineParser = RushCommandLine.workspaceCommandLineMap.get(workspaceFolder) as RushCommandLineParser;

    // Copy the actions
    const commandLineActions: readonly CommandLineAction[] = commandLineParser.actions;

    // extract the set of command line elements from the command line parser
    const filledCommandLineActions: ICommandLineSpec[] = [];
    for (const commandLineAction of commandLineActions) {
      const parameters: ICommandLineParameter[] = commandLineAction.parameters
        .slice()
        .map((parameter: CommandLineParameter) => {
          const o: ICommandLineParameter = {
            shortName: parameter.shortName,
            longName: parameter.scopedLongName,
            description: parameter.description,
            required: parameter.required,
            // kind is a getter in CommandLineParameter
            kind: CommandLineParameterKind[parameter.kind]
          };
          return o;
        });
      filledCommandLineActions.push({
        actionName: commandLineAction.actionName,
        parameters
      });
    }

    return filledCommandLineActions;
  }
}
