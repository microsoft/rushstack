// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParameterKind } from '@rushstack/ts-command-line';

import { RushCommandLineParser } from '../cli/RushCommandLineParser';

/**
 * Information about the available parameters associated with a rush action
 *
 * @beta
 */
export interface IRushCommandLineParameter {
  /**
   * The corresponding string representation of CliParameterKind
   */
  readonly kind: keyof typeof CommandLineParameterKind;

  /**
   * The long name of the flag including double dashes, e.g. "--do-something"
   */
  readonly longName: string;

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

  /**
   * If provided, this parameter can also be provided by an environment variable with the specified name.
   */
  readonly environmentVariable?: string;
}

/**
 * The full spec of an available rush command line action
 *
 * @beta
 */
export interface IRushCommandLineAction {
  actionName: string;
  parameters: IRushCommandLineParameter[];
}

const _workspaceCommandLineMap: Map<string, IRushCommandLineAction[]> = new Map();

/**
 * Information about the available CLI commands
 *
 * @beta
 */
export class RushCommandLine {
  public static getSpec(workspaceFolder: string): IRushCommandLineAction[] {
    let result: IRushCommandLineAction[] | undefined = _workspaceCommandLineMap.get(workspaceFolder);

    if (!result) {
      const commandLineParser: RushCommandLineParser = new RushCommandLineParser({ cwd: workspaceFolder });

      // extract the set of command line elements from the command line parser
      result = [];
      for (const { actionName, parameters: rawParameters } of commandLineParser.actions) {
        const parameters: IRushCommandLineParameter[] = [];
        for (const {
          kind: rawKind,
          longName,
          shortName,
          description,
          required,
          environmentVariable
        } of rawParameters) {
          parameters.push({
            kind: CommandLineParameterKind[rawKind] as keyof typeof CommandLineParameterKind,
            longName,
            shortName,
            description,
            required,
            environmentVariable
          });
        }

        result.push({
          actionName,
          parameters
        });
      }

      _workspaceCommandLineMap.set(workspaceFolder, result);
    }

    return result;
  }
}
